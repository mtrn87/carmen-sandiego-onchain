// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IGameMaster} from "./interfaces/IGameMaster.sol";
import {IMissionNFT} from "./interfaces/IMissionNFT.sol";
import {ICityNode} from "./interfaces/ICityNode.sol";

/**
 * @title GameMaster
 * @notice Main contract for Carmen Sandiego On-Chain game.
 *         Uses commit-reveal pattern: Carmen's location is stored as a hash,
 *         never in plaintext. CRE validates off-chain and reveals on capture.
 *         VRF v2.5 provides verifiable randomness for Carmen's location.
 */
contract GameMaster is VRFConsumerBaseV2Plus, IGameMaster, Pausable {
    // ============================================================
    //                        STATE
    // ============================================================

    // --- Chainlink VRF ---
    uint256 public immutable vrfSubscriptionId;
    bytes32 public immutable vrfKeyHash;
    uint32  public constant VRF_CALLBACK_GAS = 200_000;
    uint16  public constant VRF_CONFIRMATIONS = 3;
    uint32  public constant VRF_NUM_WORDS = 1;

    // --- Game Config ---
    uint256 public constant MAX_BLOCKS = 50;           // Max blocks before mission fails
    uint256 public constant MAX_INVESTIGATIONS = 10;   // Max investigation attempts
    uint8 public constant EVIDENCE_THRESHOLD = 65;     // Clue strength > this = evidence
    uint256[] public validChainIds;                     // Chain IDs representing cities

    // --- Game State ---
    uint256 public nextMissionId;
    mapping(uint256 => Mission) public missions;                        // missionId => Mission
    mapping(uint256 => Clue[]) public missionClues;                     // missionId => Clue[]
    mapping(address => uint256) public activePlayerMission;             // player => active missionId
    mapping(uint256 => uint256) private vrfRequestToMission;            // VRF requestId => missionId
    mapping(uint256 => bytes32) public missionSalts;                    // missionId => salt (for CRE to read)

    // --- Active Mission Tracking (for CRE efficient polling) ---
    uint256[] private _activeMissionIds;                                // dynamic array of active mission IDs
    mapping(uint256 => uint256) private _activeMissionIndex;            // missionId => index+1 in array (0 = not present)

    // --- Wallet Evidence ---
    mapping(uint256 => WalletFragment[]) public missionWalletFragments; // missionId => fragments
    mapping(uint256 => uint8) public missionFragmentCount;              // missionId => fragment count
    mapping(uint256 => uint8) public missionEvidenceCount;              // missionId => evidence count

    // --- Player Registry ---
    mapping(address => bytes) public playerPublicKeys;                  // player => ECIES public key

    // --- Access Control ---
    address public creOracle;    // CRE workflow address allowed to write results

    // --- NFT ---
    IMissionNFT public missionNFT;  // Trophy NFT contract (set after deployment)

    // --- CityNode integration ---
    mapping(address => mapping(bytes32 => uint8)) public playerCityClueCount;  // player => cityNodeId => clue count
    mapping(address => bytes32[]) public playerIdentityCommits;                // player => identity commit hashes
    mapping(uint256 => address) public captureRequestCity;                     // capture requestId => CityNode address
    mapping(address => uint8) public playerCitiesVisited;                      // player => number of cities visited

    // --- Rate limiting ---
    uint256 public investigationCooldown = 1;                                     // blocks between investigations
    mapping(address => uint256) public lastInvestigationBlock;                     // player => last investigation block

    // ============================================================
    //                      MODIFIERS
    // ============================================================

    modifier onlyCRE() {
        require(msg.sender == creOracle, "Not CRE oracle");
        _;
    }

    modifier hasActiveMission(address player) {
        uint256 missionId = activePlayerMission[player];
        require(missionId != 0, "No active mission");
        require(missions[missionId].status == MissionStatus.Active, "Mission not active");
        _;
    }

    // ============================================================
    //                     CONSTRUCTOR
    // ============================================================

    constructor(
        address _vrfCoordinator,
        uint256 _vrfSubscriptionId,
        bytes32 _vrfKeyHash,
        uint256[] memory _validChainIds,
        address _creOracle
    ) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        require(_validChainIds.length >= 2, "Need at least 2 cities");

        vrfSubscriptionId = _vrfSubscriptionId;
        vrfKeyHash = _vrfKeyHash;
        validChainIds = _validChainIds;
        creOracle = _creOracle;
        nextMissionId = 1; // Start at 1 so 0 means "no mission"
    }

    // ============================================================
    //                    PLAYER ACTIONS
    // ============================================================

    /**
     * @notice Register player with ECIES public key for encrypted clues.
     * @param publicKey The player's ECIES public key (secp256k1).
     */
    function registerPlayer(bytes calldata publicKey) external {
        require(publicKey.length > 0, "Invalid key");
        playerPublicKeys[msg.sender] = publicKey;
        emit PlayerRegistered(msg.sender, publicKey);
    }

    /**
     * @notice Start a new investigation mission.
     *         Triggers VRF to select Carmen's hiding location.
     *         Location is stored as hash (commit-reveal pattern).
     */
    function startMission() external whenNotPaused {
        require(playerPublicKeys[msg.sender].length > 0, "Register first");

        // Auto-close any existing active mission so player can start fresh
        uint256 existingMission = activePlayerMission[msg.sender];
        if (existingMission != 0 && missions[existingMission].status == MissionStatus.Active) {
            _failMission(existingMission);
        }

        uint256 missionId = nextMissionId++;

        missions[missionId] = Mission({
            player: msg.sender,
            startBlock: block.number,
            targetHash: bytes32(0), // Set by VRF callback
            cluesReceived: 0,
            investigationsCount: 0,
            status: MissionStatus.Active
        });

        activePlayerMission[msg.sender] = missionId;

        // Track active mission for CRE polling
        _activeMissionIds.push(missionId);
        _activeMissionIndex[missionId] = _activeMissionIds.length; // 1-indexed

        // Request randomness from VRF to determine Carmen's location
        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: vrfKeyHash,
                subId: vrfSubscriptionId,
                requestConfirmations: VRF_CONFIRMATIONS,
                callbackGasLimit: VRF_CALLBACK_GAS,
                numWords: VRF_NUM_WORDS,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: true})
                )
            })
        );

        vrfRequestToMission[requestId] = missionId;

        emit MissionStarted(missionId, msg.sender, block.number);
    }

    /**
     * @notice Submit an investigation guess for a specific chain/city.
     *         CRE workflow listens to this event and generates a clue.
     *         The contract does NOT check if the guess is correct — CRE does that off-chain.
     * @param chainId The chain ID the player is investigating.
     */
    function submitInvestigation(uint256 chainId) external whenNotPaused hasActiveMission(msg.sender) {
        uint256 missionId = activePlayerMission[msg.sender];
        Mission storage mission = missions[missionId];

        require(_isValidChainId(chainId), "Invalid city/chain");
        require(
            block.number >= lastInvestigationBlock[msg.sender] + investigationCooldown,
            "Investigation cooldown"
        );
        lastInvestigationBlock[msg.sender] = block.number;

        mission.investigationsCount++;

        // Check fail conditions
        if (mission.investigationsCount >= MAX_INVESTIGATIONS) {
            _failMission(missionId);
            return;
        }

        if (block.number - mission.startBlock >= MAX_BLOCKS) {
            _failMission(missionId);
            return;
        }

        // Emit event — CRE decides everything off-chain
        emit InvestigationSubmitted(missionId, msg.sender, chainId);
    }

    // ============================================================
    //                   CRE CALLBACKS
    // ============================================================

    /**
     * @notice Called by CRE workflow to deliver a generated clue.
     *         The contract does NOT know if the clue is true or false.
     * @param missionId The mission this clue belongs to.
     * @param clueType Type of clue (Text, Audio, or Image).
     * @param contentHash Hash of the clue content for verification.
     * @param ipfsPointer IPFS CID for the encrypted content.
     */
    function receiveClue(
        uint256 missionId,
        ClueType clueType,
        bytes32 contentHash,
        string calldata ipfsPointer,
        uint8 strength
    ) external onlyCRE {
        require(missions[missionId].status == MissionStatus.Active, "Mission not active");
        require(strength <= 100, "Invalid strength");

        Clue memory clue = Clue({
            clueType: clueType,
            contentHash: contentHash,
            ipfsPointer: ipfsPointer,
            timestamp: block.timestamp,
            strength: strength
        });

        missionClues[missionId].push(clue);
        missions[missionId].cluesReceived++;

        if (strength > EVIDENCE_THRESHOLD) {
            missionEvidenceCount[missionId]++;
            emit EvidenceCollected(missionId, missionEvidenceCount[missionId], strength);
        }

        emit ClueReceived(missionId, clueType, contentHash, ipfsPointer, strength);
    }

    /**
     * @notice Called by CRE to resolve a capture attempt (REVEAL phase).
     *         CRE reveals the actual chainId and salt, contract verifies the hash.
     * @param missionId The mission to resolve.
     * @param revealedChainId The actual chain where Carmen was hiding.
     * @param salt The salt used in the commit hash.
     */
    function resolveCapture(
        uint256 missionId,
        uint256 revealedChainId,
        bytes32 salt
    ) external onlyCRE {
        Mission storage mission = missions[missionId];
        require(mission.status == MissionStatus.Active, "Mission not active");
        require(missionClues[missionId].length >= 3, "Need 3+ clues");

        // REVEAL: verify the CRE is not lying about the location
        bytes32 expectedHash = keccak256(abi.encodePacked(revealedChainId, salt));
        require(expectedHash == mission.targetHash, "Invalid reveal");

        _captureCarmen(missionId, revealedChainId);
    }

    /**
     * @notice Called by CRE to move Carmen to a new chain mid-mission.
     *         Uses commit pattern — only hash is stored, not the actual chainId.
     * @param missionId The mission to update.
     * @param newTargetHash Hash of (newChainId, newSalt).
     */
    function updateTarget(uint256 missionId, bytes32 newTargetHash) external onlyCRE {
        require(missions[missionId].status == MissionStatus.Active, "Mission not active");
        missions[missionId].targetHash = newTargetHash;
        emit CarmenMoved(missionId, newTargetHash);
    }

    // ============================================================
    //               CITYNODE INTEGRATION
    // ============================================================

    /**
     * @notice Resolve a clue request on a CityNode. Called by CRE/operator.
     *         GameMaster acts as the trusted intermediary between CRE and CityNodes.
     * @param cityNode Address of the CityNode contract.
     * @param requestId The clue request ID on the CityNode.
     * @param clueType The type of clue (ICityNode.ClueType enum value).
     * @param clueDataHash Hash of the clue data.
     * @param anomalyRefId Related anomaly reference ID.
     */
    function resolveClueOnCity(
        address cityNode,
        uint256 requestId,
        uint8 clueType,
        bytes32 clueDataHash,
        bytes32 anomalyRefId
    ) external onlyCRE {
        require(cityNode != address(0), "Invalid city node");

        ICityNode(cityNode).resolveClue(requestId, clueType, clueDataHash, anomalyRefId);

        emit ClueResolvedOnCity(cityNode, requestId, clueType, clueDataHash);
    }

    /**
     * @notice Resolve a dossier request on a CityNode.
     * @param cityNode Address of the CityNode contract.
     * @param requestId The dossier request ID.
     * @param dossierHash Hash of the dossier content.
     * @param confidence Confidence level (0-100).
     * @param nextObjectiveHintHash Hash of the next objective hint.
     */
    function resolveDossierOnCity(
        address cityNode,
        uint256 requestId,
        bytes32 dossierHash,
        uint8 confidence,
        bytes32 nextObjectiveHintHash
    ) external onlyCRE {
        require(cityNode != address(0), "Invalid city node");

        ICityNode(cityNode).resolveDossier(requestId, dossierHash, confidence, nextObjectiveHintHash);

        emit DossierResolvedOnCity(cityNode, requestId, dossierHash, confidence);
    }

    /**
     * @notice Resolve a capture request on a CityNode.
     * @param cityNode Address of the CityNode contract.
     * @param requestId The capture request ID.
     * @param success Whether the capture was successful.
     * @param reasonCode Reason code for the result.
     * @param gmNoteHash Hash of the GM's note.
     */
    function resolveCaptureOnCity(
        address cityNode,
        uint256 requestId,
        bool success,
        uint8 reasonCode,
        bytes32 gmNoteHash
    ) external onlyCRE {
        require(cityNode != address(0), "Invalid city node");

        ICityNode(cityNode).resolveCapture(requestId, success, reasonCode, gmNoteHash);

        captureRequestCity[requestId] = cityNode;

        emit CaptureResolvedOnCity(cityNode, requestId, success, reasonCode);
    }

    /**
     * @notice Track a player's clue progress for a specific city.
     *         Called by CRE after resolving a clue to update global state.
     * @param player The player address.
     * @param cityNodeId Identifier for the city (bytes32 hash of cityNode address).
     * @param identityCommitHash If the clue is an identity commit, store it.
     */
    function trackPlayerClue(
        address player,
        bytes32 cityNodeId,
        bytes32 identityCommitHash
    ) external onlyCRE {
        playerCityClueCount[player][cityNodeId]++;

        // if first clue on this city, increment cities visited
        if (playerCityClueCount[player][cityNodeId] == 1) {
            playerCitiesVisited[player]++;
        }

        // store identity commit if provided
        if (identityCommitHash != bytes32(0)) {
            playerIdentityCommits[player].push(identityCommitHash);
        }
    }

    // ============================================================
    //                   VRF CALLBACK
    // ============================================================

    /**
     * @notice VRF callback — commits Carmen's hiding location as a hash.
     *         The actual chainId is never stored in plaintext.
     */
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        uint256 missionId = vrfRequestToMission[requestId];
        require(missions[missionId].status == MissionStatus.Active, "Mission not active");

        // Select a random city from valid chains
        uint256 cityIndex = randomWords[0] % validChainIds.length;
        uint256 targetChainId = validChainIds[cityIndex];

        // Generate salt from VRF randomness
        bytes32 salt = keccak256(abi.encodePacked(randomWords[0], missionId));

        // Store salt so CRE can read it and brute-force the 3 cities
        missionSalts[missionId] = salt;

        // COMMIT: store hash, not the value
        missions[missionId].targetHash = keccak256(abi.encodePacked(targetChainId, salt));

        emit CarmenLocationCommitted(missionId, missions[missionId].targetHash);
    }

    // ============================================================
    //               WALLET EVIDENCE (CRE CALLBACKS)
    // ============================================================

    /**
     * @notice Called by CRE to deliver a wallet fragment for a correct investigation.
     * @param missionId The mission this fragment belongs to.
     * @param startIndex Position in the 40-char hex address where fragment starts.
     * @param length Number of hex chars revealed (typically 5).
     * @param contentHash Hash of the fragment content for verification.
     * @param ipfsPointer IPFS CID for the encrypted fragment.
     */
    function receiveWalletFragment(
        uint256 missionId,
        uint8 startIndex,
        uint8 length,
        bytes32 contentHash,
        string calldata ipfsPointer
    ) external onlyCRE {
        require(missions[missionId].status == MissionStatus.Active, "Mission not active");
        require(startIndex + length <= 40, "Fragment out of bounds");

        WalletFragment memory fragment = WalletFragment({
            startIndex: startIndex,
            length: length,
            contentHash: contentHash,
            ipfsPointer: ipfsPointer,
            timestamp: block.timestamp
        });

        missionWalletFragments[missionId].push(fragment);
        uint8 fragmentIndex = missionFragmentCount[missionId];
        missionFragmentCount[missionId] = fragmentIndex + 1;

        emit WalletFragmentReceived(missionId, fragmentIndex, startIndex, length, contentHash, ipfsPointer);
    }

    /**
     * @notice Called by CRE to resolve a wallet-based capture attempt.
     *         Derives Carmen's wallet from salt and verifies the player's submission.
     * @param missionId The mission to resolve.
     * @param submittedWallet The wallet address the player reconstructed.
     * @param revealedChainId The actual chain where Carmen was hiding.
     * @param salt The salt used in the commit hash.
     */
    function resolveWalletCapture(
        uint256 missionId,
        address submittedWallet,
        uint256 revealedChainId,
        bytes32 salt
    ) external onlyCRE {
        Mission storage mission = missions[missionId];
        require(mission.status == MissionStatus.Active, "Mission not active");
        require(missionFragmentCount[missionId] >= 3, "Need 3+ fragments");

        // Verify chain reveal matches commit
        bytes32 expectedHash = keccak256(abi.encodePacked(revealedChainId, salt));
        require(expectedHash == mission.targetHash, "Invalid reveal");

        // Derive Carmen's wallet and check match
        address carmenWallet = deriveCarmenWallet(salt);
        bool valid = submittedWallet == carmenWallet;

        emit WalletCaseBuilt(missionId, mission.player, submittedWallet, valid);

        if (valid) {
            _captureCarmen(missionId, revealedChainId);
        }
    }

    /**
     * @notice Derive Carmen's wallet address deterministically from a mission salt.
     * @param salt The VRF-derived salt for the mission.
     * @return The deterministic Carmen wallet address.
     */
    function deriveCarmenWallet(bytes32 salt) public pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(salt, "carmen-wallet")))));
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function getMission(uint256 missionId) external view returns (Mission memory) {
        return missions[missionId];
    }

    function getMissionClues(uint256 missionId) external view returns (Clue[] memory) {
        return missionClues[missionId];
    }

    function getPlayerActiveMission(address player) external view returns (uint256) {
        return activePlayerMission[player];
    }

    function getBlocksUsed(uint256 missionId) external view returns (uint256) {
        Mission memory mission = missions[missionId];
        if (mission.status == MissionStatus.None) return 0;
        return block.number - mission.startBlock;
    }

    function getValidCities() external view returns (uint256[] memory) {
        return validChainIds;
    }

    function getActiveMissionIds() external view returns (uint256[] memory) {
        return _activeMissionIds;
    }

    function getPlayerPublicKey(address player) external view returns (bytes memory) {
        return playerPublicKeys[player];
    }

    function getMissionSalt(uint256 missionId) external view returns (bytes32) {
        return missionSalts[missionId];
    }

    function getMissionWalletFragments(uint256 missionId) external view returns (WalletFragment[] memory) {
        return missionWalletFragments[missionId];
    }

    function getMissionFragmentCount(uint256 missionId) external view returns (uint8) {
        return missionFragmentCount[missionId];
    }

    function getMissionEvidenceCount(uint256 missionId) external view returns (uint8) {
        return missionEvidenceCount[missionId];
    }

    /**
     * @notice Get a player's global progress across all cities.
     * @param player The player address.
     * @return citiesVisited Number of unique cities visited.
     * @return totalClues Total clue count (sum of all cities' identity commits).
     * @return identityCommitsCount Number of identity commits collected.
     */
    function getPlayerGlobalProgress(address player)
        external
        view
        returns (uint8 citiesVisited, uint256 totalClues, uint256 identityCommitsCount)
    {
        return (
            playerCitiesVisited[player],
            playerIdentityCommits[player].length,
            playerIdentityCommits[player].length
        );
    }

    /**
     * @notice Get a player's identity commits.
     * @param player The player address.
     * @return commits Array of identity commit hashes.
     */
    function getPlayerIdentityCommits(address player) external view returns (bytes32[] memory) {
        return playerIdentityCommits[player];
    }

    /**
     * @notice Get a player's clue count for a specific city.
     * @param player The player address.
     * @param cityNodeId City identifier hash.
     * @return count Number of clues found in this city.
     */
    function getPlayerCityClueCount(address player, bytes32 cityNodeId) external view returns (uint8) {
        return playerCityClueCount[player][cityNodeId];
    }

    // ============================================================
    //                   ADMIN FUNCTIONS
    // ============================================================

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setCREOracle(address _creOracle) external onlyOwner {
        creOracle = _creOracle;
    }

    function setMissionNFT(address _missionNFT) external onlyOwner {
        require(_missionNFT != address(0), "Invalid address");
        missionNFT = IMissionNFT(_missionNFT);
        emit MissionNFTSet(_missionNFT);
    }

    function setInvestigationCooldown(uint256 _cooldown) external onlyOwner {
        investigationCooldown = _cooldown;
    }

    function setValidChainIds(uint256[] calldata _chainIds) external onlyOwner {
        require(_chainIds.length >= 2, "Need at least 2 cities");
        validChainIds = _chainIds;
    }

    /**
     * @notice Called by CRE to set the token URI for a mission's trophy NFT.
     *         Used by the generate-finale workflow to attach AI-generated metadata.
     * @param missionId The mission whose NFT URI to set.
     * @param uri The metadata URI (data URI or IPFS CID).
     */
    function setMissionTokenURI(uint256 missionId, string calldata uri) external onlyCRE {
        require(address(missionNFT) != address(0), "MissionNFT not set");
        uint256 tokenId = missionNFT.missionToTokenId(missionId);
        require(tokenId != 0, "No NFT for mission");
        missionNFT.setTokenURIByCRE(tokenId, uri);
        emit TokenURISet(missionId, tokenId);
    }

    // ============================================================
    //                   INTERNAL FUNCTIONS
    // ============================================================

    function _removeActiveMission(uint256 missionId) internal {
        uint256 indexPlusOne = _activeMissionIndex[missionId];
        if (indexPlusOne == 0) return; // not tracked

        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = _activeMissionIds.length - 1;

        if (index != lastIndex) {
            uint256 lastMissionId = _activeMissionIds[lastIndex];
            _activeMissionIds[index] = lastMissionId;
            _activeMissionIndex[lastMissionId] = indexPlusOne;
        }

        _activeMissionIds.pop();
        delete _activeMissionIndex[missionId];
    }

    function _captureCarmen(uint256 missionId, uint256 revealedChainId) internal {
        Mission storage mission = missions[missionId];
        mission.status = MissionStatus.Completed;

        uint256 blocksUsed = block.number - mission.startBlock;
        uint256 reward = _calculateReward(blocksUsed);

        activePlayerMission[mission.player] = 0;
        _removeActiveMission(missionId);

        emit CarmenCaptured(missionId, mission.player, blocksUsed, reward);

        // Mint trophy NFT if MissionNFT contract is set
        if (address(missionNFT) != address(0)) {
            missionNFT.mintMissionComplete(
                mission.player,
                IMissionNFT.MissionRecord({
                    missionId: missionId,
                    player: mission.player,
                    capturedChainId: revealedChainId,
                    cluesCollected: mission.cluesReceived,
                    investigationsUsed: mission.investigationsCount,
                    blocksUsed: blocksUsed,
                    reward: reward,
                    timestamp: block.timestamp
                }),
                "" // URI set later by CRE (AI-generated trophy image)
            );
        }
    }

    function _failMission(uint256 missionId) internal {
        Mission storage mission = missions[missionId];
        mission.status = MissionStatus.Failed;
        activePlayerMission[mission.player] = 0;
        _removeActiveMission(missionId);

        emit MissionFailed(missionId, mission.player);
    }

    function _calculateReward(uint256 blocksUsed) internal pure returns (uint256) {
        if (blocksUsed <= 20) return 100;   // Gold - Perfect
        if (blocksUsed <= 35) return 75;    // Silver - Good
        if (blocksUsed <= 50) return 50;    // Bronze - OK
        return 0;                           // Failed
    }

    function _isValidChainId(uint256 chainId) internal view returns (bool) {
        for (uint256 i = 0; i < validChainIds.length; i++) {
            if (validChainIds[i] == chainId) return true;
        }
        return false;
    }
}
