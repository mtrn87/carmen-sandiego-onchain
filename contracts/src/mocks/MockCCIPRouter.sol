// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Client, IRouterClient} from "../interfaces/ICCIPRouter.sol";

/**
 * @title MockCCIPRouter
 * @notice Minimal mock for Chainlink CCIP Router. Used in Hardhat tests.
 */
contract MockCCIPRouter is IRouterClient {
    uint256 public constant MOCK_FEE = 0.01 ether;
    uint256 public messagesSent;
    bytes32 public lastMessageId;

    function ccipSend(
        uint64 /* destinationChainSelector */,
        Client.EVM2AnyMessage memory /* message */
    ) external payable override returns (bytes32 messageId) {
        messagesSent++;
        messageId = keccak256(abi.encodePacked(messagesSent, block.timestamp));
        lastMessageId = messageId;
        return messageId;
    }

    function getFee(
        uint64 /* destinationChainSelector */,
        Client.EVM2AnyMessage memory /* message */
    ) external pure override returns (uint256 fee) {
        return MOCK_FEE;
    }

    function isChainSupported(uint64 /* chainSelector */) external pure override returns (bool) {
        return true;
    }
}
