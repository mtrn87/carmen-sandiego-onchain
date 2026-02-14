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
}
