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
        uint8 strength;                // 0-100: clue strength (>65 = evidence)
    }

    struct WalletFragment {
        uint8 startIndex;              // Position in the 40-char hex address
        uint8 length;                  // Number of hex chars revealed (typically 5)
        bytes32 contentHash;           // Hash of the fragment content
        string ipfsPointer;            // IPFS CID for encrypted fragment
        uint256 timestamp;
    }

    // --- External Functions (called by GameMasterProxy) ---
    function receiveClue(uint256 missionId, ClueType clueType, bytes32 contentHash, string calldata ipfsPointer, uint8 strength) external;
    function resolveCapture(uint256 missionId, uint256 revealedChainId, bytes32 salt) external;
    function updateTarget(uint256 missionId, bytes32 newTargetHash) external;
    function receiveWalletFragment(uint256 missionId, uint8 startIndex, uint8 length, bytes32 contentHash, string calldata ipfsPointer) external;
    function resolveWalletCapture(uint256 missionId, address submittedWallet, uint256 revealedChainId, bytes32 salt) external;
    function setMissionTokenURI(uint256 missionId, string calldata uri) external;

    // --- CityNode Integration ---
    function resolveClueOnCity(address cityNode, uint256 requestId, uint8 clueType, bytes32 clueDataHash, bytes32 anomalyRefId) external;
    function resolveDossierOnCity(address cityNode, uint256 requestId, bytes32 dossierHash, uint8 confidence, bytes32 nextObjectiveHintHash) external;
    function resolveCaptureOnCity(address cityNode, uint256 requestId, bool success, uint8 reasonCode, bytes32 gmNoteHash) external;
    function trackPlayerClue(address player, bytes32 cityNodeId, bytes32 identityCommitHash) external;

    // --- View Functions ---
    function getPlayerGlobalProgress(address player) external view returns (uint8 citiesVisited, uint256 totalClues, uint256 identityCommitsCount);
    function getPlayerIdentityCommits(address player) external view returns (bytes32[] memory);
    function getPlayerCityClueCount(address player, bytes32 cityNodeId) external view returns (uint8);
    function getMissionWalletFragments(uint256 missionId) external view returns (WalletFragment[] memory);
    function getMissionFragmentCount(uint256 missionId) external view returns (uint8);
    function getMissionEvidenceCount(uint256 missionId) external view returns (uint8);
    function deriveCarmenWallet(bytes32 salt) external pure returns (address);

    // --- Events ---
    event PlayerRegistered(address indexed player, bytes publicKey);
    event MissionStarted(uint256 indexed missionId, address indexed player, uint256 startBlock);
    event CarmenLocationCommitted(uint256 indexed missionId, bytes32 targetHash);
    event InvestigationSubmitted(uint256 indexed missionId, address indexed player, uint256 chainId);
    event ClueReceived(uint256 indexed missionId, ClueType clueType, bytes32 contentHash, string ipfsPointer, uint8 strength);
    event CarmenCaptured(uint256 indexed missionId, address indexed player, uint256 blocksUsed, uint256 reward);
    event CarmenMoved(uint256 indexed missionId, bytes32 newTargetHash);
    event MissionFailed(uint256 indexed missionId, address indexed player);
    event EvidenceCollected(uint256 indexed missionId, uint8 evidenceCount, uint8 strength);
    event MissionNFTSet(address indexed missionNFT);
    event TokenURISet(uint256 indexed missionId, uint256 indexed tokenId);

    // --- Wallet Evidence Events ---
    event WalletFragmentReceived(uint256 indexed missionId, uint8 fragmentIndex, uint8 startIndex, uint8 length, bytes32 contentHash, string ipfsPointer);
    event WalletCaseBuilt(uint256 indexed missionId, address indexed player, address submittedWallet, bool valid);

    // --- CityNode Integration Events ---
    event ClueResolvedOnCity(address indexed cityNode, uint256 indexed requestId, uint8 clueType, bytes32 clueDataHash);
    event DossierResolvedOnCity(address indexed cityNode, uint256 indexed requestId, bytes32 dossierHash, uint8 confidence);
    event CaptureResolvedOnCity(address indexed cityNode, uint256 indexed requestId, bool success, uint8 reasonCode);
}
