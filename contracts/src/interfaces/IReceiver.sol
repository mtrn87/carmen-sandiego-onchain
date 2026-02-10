// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IReceiver is IERC165 {
    /// @notice Handles incoming keystone reports.
    /// @param metadata Report's metadata.
    /// @param report Workflow report.
    function onReport(
        bytes calldata metadata,
        bytes calldata report
    ) external;
}
