// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Client
 * @notice Chainlink CCIP Client library for cross-chain messaging.
 *         Defines the message structs used by the CCIP Router.
 *         Reference: https://docs.chain.link/ccip/api-reference/client
 */
library Client {
    /// @notice EVM-to-any cross-chain message structure.
    /// @dev Used by IRouterClient.ccipSend() to define the cross-chain message payload.
    struct EVM2AnyMessage {
        bytes receiver;                // abi.encode(receiverAddress) on the destination chain
        bytes data;                    // Arbitrary payload (ABI-encoded game state)
        EVMTokenAmount[] tokenAmounts; // Token transfers (empty for pure messaging)
        bytes extraArgs;               // CCIP extra args (gas limit, etc.)
        address feeToken;              // Fee token address (address(0) = native ETH/gas token)
    }

    /// @notice Token amount structure for cross-chain token transfers.
    struct EVMTokenAmount {
        address token;
        uint256 amount;
    }

    /// @notice Any-to-EVM cross-chain message received on the destination chain.
    /// @dev Passed to CCIPReceiver._ccipReceive() when a message arrives.
    struct Any2EVMMessage {
        bytes32 messageId;             // Unique CCIP message identifier
        uint64 sourceChainSelector;    // CCIP chain selector of the source chain
        bytes sender;                  // abi.encode(senderAddress) from the source chain
        bytes data;                    // The payload sent from the source chain
        EVMTokenAmount[] destTokenAmounts; // Tokens received (if any)
    }
}

/**
 * @title IRouterClient
 * @notice Chainlink CCIP Router interface for sending cross-chain messages.
 *         The Router is the on-chain entry point for CCIP messaging.
 *
 * CCIP Flow for Carmen Sandiego:
 * 1. GameMaster calls ccipSend() on the Router to broadcast Carmen's move
 * 2. CCIP DON (Decentralized Oracle Network) relays the message cross-chain
 * 3. CityNode on the destination chain receives via CCIPReceiver._ccipReceive()
 *
 * Router addresses (testnets):
 * - Sepolia:          0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59
 * - Arbitrum Sepolia:  0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165
 * - Base Sepolia:      0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93
 *
 * Chain selectors:
 * - Sepolia:          16015286601757825753
 * - Arbitrum Sepolia: 3478487238524512106
 * - Base Sepolia:     10344971235874465080
 */
interface IRouterClient {
    /// @notice Send a cross-chain message via CCIP.
    /// @param destinationChainSelector The CCIP chain selector for the destination.
    /// @param message The cross-chain message payload.
    /// @return messageId The unique CCIP message identifier for tracking.
    function ccipSend(
        uint64 destinationChainSelector,
        Client.EVM2AnyMessage memory message
    ) external payable returns (bytes32 messageId);

    /// @notice Get the fee for sending a cross-chain message.
    /// @param destinationChainSelector The CCIP chain selector for the destination.
    /// @param message The cross-chain message payload.
    /// @return fee The fee in the message's feeToken (or native if feeToken == address(0)).
    function getFee(
        uint64 destinationChainSelector,
        Client.EVM2AnyMessage memory message
    ) external view returns (uint256 fee);

    /// @notice Check if a chain is supported by the CCIP Router.
    /// @param chainSelector The CCIP chain selector to check.
    /// @return supported True if the chain is supported.
    function isChainSupported(
        uint64 chainSelector
    ) external view returns (bool supported);
}
