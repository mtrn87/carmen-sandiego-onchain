// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGameMaster {
    // --- Enums ---
    enum MissionStatus { None, Active, Completed, Failed }
    enum ClueType { Text, Audio }

    // --- Structs ---
    struct Mission {
        address player;
        uint256 startBlock;
        uint256 targetChainId;     // Chain where Carmen is hiding
        uint8 cluesReceived;
        uint8 investigationsCount;
        MissionStatus status;
    }

    struct Clue {
        ClueType clueType;
        bytes32 contentHash;       // Hash of the clue content (for verification)
        string ipfsPointer;        // IPFS CID for audio clues
        string textContent;        // Text content for text clues
        bool isTrue;               // Whether the clue points to the real location
        uint256 timestamp;
    }

    // --- Events ---
    event MissionStarted(uint256 indexed missionId, address indexed player, uint256 startBlock);
    event CarmenLocationSet(uint256 indexed missionId, uint256 targetChainId);
    event InvestigationSubmitted(uint256 indexed missionId, address indexed player, uint256 chainId);
    event ClueReceived(uint256 indexed missionId, ClueType clueType, bytes32 contentHash, string ipfsPointer);
    event CarmenCaptured(uint256 indexed missionId, address indexed player, uint256 blocksUsed, uint256 reward);
    event MissionFailed(uint256 indexed missionId, address indexed player);
}