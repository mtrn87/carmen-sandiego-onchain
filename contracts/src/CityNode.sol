// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICityNode} from "./interfaces/ICityNode.sol";

/**
 * @title CityNode
 * @notice Deployed on each city chain (Arbitrum Sepolia, Base Sepolia).
 *         Tracks Carmen's presence on this specific chain.
 *         CRE workflows write Carmen's location via EVM Write capability.
 */
contract CityNode is ICityNode {
    // ============================================================
    //                        STATE
    // ============================================================

    string public override cityName;
    uint256 public override chainId;
    address public owner;
    address public creOracle;    // CRE workflow address allowed to update

    // missionId => whether Carmen is present on this chain
    mapping(uint256 => bool) private carmenPresence;
    mapping(uint256 => DepartureHint[]) private departureHints;

    // ============================================================
    //                      MODIFIERS
    // ============================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyCRE() {
        require(msg.sender == creOracle, "Not CRE oracle");
        _;
    }

    // ============================================================
    //                     CONSTRUCTOR
    // ============================================================

    constructor(
        string memory _cityName,
        uint256 _chainId,
        address _creOracle
    ) {
        cityName = _cityName;
        chainId = _chainId;
        creOracle = _creOracle;
        owner = msg.sender;
    }

    // ============================================================
    //                   CRE FUNCTIONS
    // ============================================================

    /**
     * @notice Called by CRE workflow to update Carmen's presence on this chain.
     * @param missionId The mission ID.
     * @param isPresent Whether Carmen is hiding on this chain.
     */
    function updateCarmenPresence(uint256 missionId, bool isPresent) external override onlyCRE {
        bool wasPresentBefore = carmenPresence[missionId];
        carmenPresence[missionId] = isPresent;

        if (isPresent && !wasPresentBefore) {
            emit CarmenArrived(missionId);
        } else if (!isPresent && wasPresentBefore) {
            emit CarmenDeparted(missionId);
        }
    }

    /**
     * @notice Called by CRE workflow when Carmen leaves this city.
     *         Stores a directional hint about where she may have gone.
     * @param missionId The mission ID.
     * @param contentHash Hash of hint content for integrity verification.
     * @param ipfsPointer IPFS CID for hint payload.
     */
    function recordDepartureHint(
        uint256 missionId,
        bytes32 contentHash,
        string calldata ipfsPointer
    ) external override onlyCRE {
        require(contentHash != bytes32(0), "Invalid hint");
        require(bytes(ipfsPointer).length > 0, "Invalid hint");

        departureHints[missionId].push(
            DepartureHint({
                contentHash: contentHash,
                ipfsPointer: ipfsPointer,
                timestamp: block.timestamp
            })
        );

        emit DepartureHintRecorded(missionId, contentHash, ipfsPointer);
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Check if Carmen is present on this chain for a specific mission.
     */
    function getCarmenStatus(uint256 missionId) external view override returns (bool) {
        return carmenPresence[missionId];
    }

    /**
     * @notice Returns all recorded departure hints for a mission in this city.
     */
    function getDepartureHints(uint256 missionId) external view override returns (DepartureHint[] memory) {
        return departureHints[missionId];
    }

    // ============================================================
    //                   ADMIN FUNCTIONS
    // ============================================================

    function setCREOracle(address _creOracle) external onlyOwner {
        creOracle = _creOracle;
    }
}