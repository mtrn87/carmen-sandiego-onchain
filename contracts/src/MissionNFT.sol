// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {IMissionNFT} from "./interfaces/IMissionNFT.sol";

/**
 * @title MissionNFT
 * @notice ERC-721 trophy NFT minted when a player captures Carmen Sandiego.
 *         Each token stores on-chain metadata about the completed mission.
 *         Only the GameMaster contract can mint.
 */
contract MissionNFT is ERC721, ERC721URIStorage, IMissionNFT {
    uint256 private _nextTokenId;
    address public immutable gameMaster;

    mapping(uint256 => MissionRecord) private _missionRecords;

    modifier onlyGameMaster() {
        require(msg.sender == gameMaster, "Not GameMaster");
        _;
    }

    constructor(address _gameMaster) ERC721("Carmen Sandiego Mission", "CARMEN") {
        require(_gameMaster != address(0), "Invalid GameMaster");
        gameMaster = _gameMaster;
        _nextTokenId = 1;
    }

    /**
     * @notice Mint a trophy NFT for a completed mission.
     * @param player The player who captured Carmen.
     * @param record On-chain mission metadata.
     * @param uri IPFS URI for the AI-generated trophy image.
     */
    function mintMissionComplete(
        address player,
        MissionRecord calldata record,
        string calldata uri
    ) external onlyGameMaster returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(player, tokenId);
        if (bytes(uri).length > 0) {
            _setTokenURI(tokenId, uri);
        }
        _missionRecords[tokenId] = record;

        emit MissionNFTMinted(tokenId, record.missionId, player, record.reward);
        return tokenId;
    }

    /**
     * @notice Update the token URI (e.g., CRE sets AI-generated image after mint).
     */
    function setTokenURIByCRE(uint256 tokenId, string calldata uri) external onlyGameMaster {
        _setTokenURI(tokenId, uri);
    }

    function getMissionRecord(uint256 tokenId) external view returns (MissionRecord memory) {
        return _missionRecords[tokenId];
    }

    // --- Required overrides for ERC721 + ERC721URIStorage ---

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
