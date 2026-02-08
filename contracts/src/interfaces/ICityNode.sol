// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICityNode {
    // --- Events ---
    event CarmenArrived(uint256 indexed missionId);
    event CarmenDeparted(uint256 indexed missionId);
    event CityInvestigated(uint256 indexed missionId, address indexed player);

    // --- Functions ---
    function updateCarmenPresence(uint256 missionId, bool isPresent) external;
    function getCarmenStatus(uint256 missionId) external view returns (bool);
    function cityName() external view returns (string memory);
    function chainId() external view returns (uint256);
}