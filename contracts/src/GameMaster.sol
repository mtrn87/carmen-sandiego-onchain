// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {IGameMaster} from "./interfaces/IGameMaster.sol";

/**
 * @title GameMaster
 * @notice Main contract for Carmen Sandiego On-Chain game.
 *         Uses commit-reveal pattern: Carmen's location is stored as a hash,
 *         never in plaintext. CRE validates off-chain and reveals on capture.
 *         VRF v2.5 provides verifiable randomness for Carmen's location.
 */
contract GameMaster is VRFConsumerBaseV2Plus, IGameMaster {
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
    uint256[] public validChainIds;                     // Chain IDs representing cities

    // --- Game State ---
    uint256 public nextMissionId;
    mapping(uint256 => Mission) public missions;                        // missionId => Mission
    mapping(uint256 => Clue[]) public missionClues;                     // missionId => Clue[]
    mapping(address => uint256) public activePlayerMission;             // player => active missionId
    mapping(uint256 => uint256) private vrfRequestToMission;            // VRF requestId => missionId
    mapping(uint256 => bytes32) public missionSalts;                    // missionId => salt (for CRE to read)

    // --- Player Registry ---
    mapping(address => bytes) public playerPublicKeys;                  // player => ECIES public key

    // --- Access Control ---
    address public creOracle;    // CRE workflow address allowed to write results

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
    function startMission() external {
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
    function submitInvestigation(uint256 chainId) external hasActiveMission(msg.sender) {
        uint256 missionId = activePlayerMission[msg.sender];
        Mission storage mission = missions[missionId];

        require(_isValidChainId(chainId), "Invalid city/chain");

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
        string calldata ipfsPointer
    ) external onlyCRE {
        require(missions[missionId].status == MissionStatus.Active, "Mission not active");

        Clue memory clue = Clue({
            clueType: clueType,
            contentHash: contentHash,
            ipfsPointer: ipfsPointer,
            timestamp: block.timestamp
        });

        missionClues[missionId].push(clue);
        missions[missionId].cluesReceived++;

        emit ClueReceived(missionId, clueType, contentHash, ipfsPointer);
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

        _captureCarmen(missionId);
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

    function getPlayerPublicKey(address player) external view returns (bytes memory) {
        return playerPublicKeys[player];
    }

    function getMissionSalt(uint256 missionId) external view returns (bytes32) {
        return missionSalts[missionId];
    }

    // ============================================================
    //                   ADMIN FUNCTIONS
    // ============================================================

    function setCREOracle(address _creOracle) external onlyOwner {
        creOracle = _creOracle;
    }

    function setValidChainIds(uint256[] calldata _chainIds) external onlyOwner {
        require(_chainIds.length >= 2, "Need at least 2 cities");
        validChainIds = _chainIds;
    }

    // ============================================================
    //                   INTERNAL FUNCTIONS
    // ============================================================

    function _captureCarmen(uint256 missionId) internal {
        Mission storage mission = missions[missionId];
        mission.status = MissionStatus.Completed;

        uint256 blocksUsed = block.number - mission.startBlock;
        uint256 reward = _calculateReward(blocksUsed);

        activePlayerMission[mission.player] = 0;

        emit CarmenCaptured(missionId, mission.player, blocksUsed, reward);
    }

    function _failMission(uint256 missionId) internal {
        Mission storage mission = missions[missionId];
        mission.status = MissionStatus.Failed;
        activePlayerMission[mission.player] = 0;

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
