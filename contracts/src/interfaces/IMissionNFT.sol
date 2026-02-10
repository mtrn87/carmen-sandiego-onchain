// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMissionNFT {
    struct MissionRecord {
        uint256 missionId;
        address player;
        uint256 capturedChainId;
        uint8 cluesCollected;
        uint8 investigationsUsed;
        uint256 blocksUsed;
        uint256 reward;
        uint256 timestamp;
    }

    event MissionNFTMinted(uint256 indexed tokenId, uint256 indexed missionId, address indexed player, uint256 reward);

    function mintMissionComplete(
        address player,
        MissionRecord calldata record,
        string calldata tokenURI
    ) external returns (uint256);

    function getMissionRecord(uint256 tokenId) external view returns (MissionRecord memory);
}
