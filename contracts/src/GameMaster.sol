// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {IGameMaster} from "./interfaces/IGameMaster.sol";

/**
 * @title GameMaster
 * @notice Main contract for Carmen Sandiego On-Chain game.
 *         Deployed on Ethereum Sepolia as the HQ.
 *         CRE workflows listen to events emitted here and write results back.
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
     * @notice Start a new investigation mission.
     *         Triggers VRF to select Carmen's hiding location.
     *         Emits MissionStarted for CRE to generate the AI briefing.
     */
    function startMission() external {
        require(activePlayerMission[msg.sender] == 0, "Already on a mission");

        uint256 missionId = nextMissionId++;

        missions[missionId] = Mission({
            player: msg.sender,
            startBlock: block.number,
            targetChainId: 0, // Set by VRF callback
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
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: false})
                )
            })
        );

        vrfRequestToMission[requestId] = missionId;

        emit MissionStarted(missionId, msg.sender, block.number);
    }

    /**
     * @notice Submit an investigation guess for a specific chain/city.
     *         CRE workflow listens to this event and generates a clue.
     * @param chainId The chain ID the player is investigating.
     */
    function submitInvestigation(uint256 chainId) external hasActiveMission(msg.sender) {
        uint256 missionId = activePlayerMission[msg.sender];
        Mission storage mission = missions[missionId];

        require(_isValidChainId(chainId), "Invalid city/chain");

        mission.investigationsCount++;

        // If player guessed the correct chain and have at least one clue, they can capture Carmen
        if (chainId == mission.targetChainId && missionClues[missionId].length > 2) {
            _captureCarmen(missionId);
            return;
        }

        // Check if mission reached max attempts
        if (mission.investigationsCount >= MAX_INVESTIGATIONS) {
            _failMission(missionId);
            return;
        }

        if (block.number - mission.startBlock >= MAX_BLOCKS) {
            _failMission(missionId);
            return;
        }

        emit InvestigationSubmitted(missionId, msg.sender, chainId);
    }

    // ============================================================
    //                   CRE CALLBACKS
    // ============================================================

    /**
     * @notice Called by CRE workflow to deliver a generated clue.
     * @param missionId The mission this clue belongs to.
     * @param clueType Type of clue (Text or Audio).
     * @param contentHash Hash of the clue content for verification.
     * @param ipfsPointer IPFS CID (for audio clues).
     * @param textContent Text content (for text clues).
     * @param isTrue Whether this clue points to the real location.
     */
    function receiveClue(
        uint256 missionId,
        ClueType clueType,
        bytes32 contentHash,
        string calldata ipfsPointer,
        string calldata textContent,
        bool isTrue
    ) external onlyCRE {
        require(missions[missionId].status == MissionStatus.Active, "Mission not active");

        Clue memory clue = Clue({
            clueType: clueType,
            contentHash: contentHash,
            ipfsPointer: ipfsPointer,
            textContent: textContent,
            isTrue: isTrue,
            timestamp: block.timestamp
        });

        missionClues[missionId].push(clue);
        missions[missionId].cluesReceived++;

        emit ClueReceived(missionId, clueType, contentHash, ipfsPointer);
    }

    // ============================================================
    //                   VRF CALLBACK
    // ============================================================

    /**
     * @notice VRF callback - sets Carmen's hiding location.
     */
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        uint256 missionId = vrfRequestToMission[requestId];
        require(missions[missionId].status == MissionStatus.Active, "Mission not active");

        // Select a random city from valid chains
        uint256 cityIndex = randomWords[0] % validChainIds.length;
        missions[missionId].targetChainId = validChainIds[cityIndex];

        emit CarmenLocationSet(missionId, validChainIds[cityIndex]);
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