// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGameMaster {
    // --- Enums ---
    enum MissionStatus { None, Active, Completed, Failed }
    enum ClueType { Text, Audio, Image }

    // --- Structs ---
    struct Mission {
        address player;
        uint256 startBlock;
        bytes32 targetHash;            // Commit-reveal: hash of (chainId, salt)
        uint8 cluesReceived;
        uint8 investigationsCount;
        MissionStatus status;
    }

    struct Clue {
        ClueType clueType;
        bytes32 contentHash;           // Hash of the clue content (for verification)
        string ipfsPointer;            // IPFS CID for encrypted content
        uint256 timestamp;
    }

    // --- External Functions (called by GameMasterProxy) ---
    function receiveClue(uint256 missionId, ClueType clueType, bytes32 contentHash, string calldata ipfsPointer) external;
    function resolveCapture(uint256 missionId, uint256 revealedChainId, bytes32 salt) external;
    function updateTarget(uint256 missionId, bytes32 newTargetHash) external;

    // --- CityNode Integration ---
    function resolveClueOnCity(address cityNode, uint256 requestId, uint8 clueType, bytes32 clueDataHash, bytes32 anomalyRefId) external;
    function resolveDossierOnCity(address cityNode, uint256 requestId, bytes32 dossierHash, uint8 confidence, bytes32 nextObjectiveHintHash) external;
    function resolveCaptureOnCity(address cityNode, uint256 requestId, bool success, uint8 reasonCode, bytes32 gmNoteHash) external;
    function trackPlayerClue(address player, bytes32 cityNodeId, bytes32 identityCommitHash) external;

    // --- View Functions ---
    function getPlayerGlobalProgress(address player) external view returns (uint8 citiesVisited, uint256 totalClues, uint256 identityCommitsCount);
    function getPlayerIdentityCommits(address player) external view returns (bytes32[] memory);
    function getPlayerCityClueCount(address player, bytes32 cityNodeId) external view returns (uint8);

    // --- Events ---
    event PlayerRegistered(address indexed player, bytes publicKey);
    event MissionStarted(uint256 indexed missionId, address indexed player, uint256 startBlock);
    event CarmenLocationCommitted(uint256 indexed missionId, bytes32 targetHash);
    event InvestigationSubmitted(uint256 indexed missionId, address indexed player, uint256 chainId);
    event ClueReceived(uint256 indexed missionId, ClueType clueType, bytes32 contentHash, string ipfsPointer);
    event CarmenCaptured(uint256 indexed missionId, address indexed player, uint256 blocksUsed, uint256 reward);
    event CarmenMoved(uint256 indexed missionId, bytes32 newTargetHash);
    event MissionFailed(uint256 indexed missionId, address indexed player);
    event MissionNFTSet(address indexed missionNFT);

    // --- CityNode Integration Events ---
    event ClueResolvedOnCity(address indexed cityNode, uint256 indexed requestId, uint8 clueType, bytes32 clueDataHash);
    event DossierResolvedOnCity(address indexed cityNode, uint256 indexed requestId, bytes32 dossierHash, uint8 confidence);
    event CaptureResolvedOnCity(address indexed cityNode, uint256 indexed requestId, bool success, uint8 reasonCode);
}
