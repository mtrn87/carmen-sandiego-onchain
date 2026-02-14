// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICityNode {
    struct DepartureHint {
        bytes32 contentHash;
        string ipfsPointer;
        uint256 timestamp;
    }

    // --- Events ---
    event CarmenArrived(uint256 indexed missionId);
    event CarmenDeparted(uint256 indexed missionId);
    event CityInvestigated(uint256 indexed missionId, address indexed player);
    event DepartureHintRecorded(uint256 indexed missionId, bytes32 contentHash, string ipfsPointer);

    // --- Functions ---
    function updateCarmenPresence(uint256 missionId, bool isPresent) external;
    function recordDepartureHint(uint256 missionId, bytes32 contentHash, string calldata ipfsPointer) external;
    function getCarmenStatus(uint256 missionId) external view returns (bool);
    function getDepartureHints(uint256 missionId) external view returns (DepartureHint[] memory);
    function cityName() external view returns (string memory);
    function chainId() external view returns (uint256);
}