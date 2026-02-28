// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Client, IRouterClient} from "./interfaces/ICCIPRouter.sol";

/**
 * @title CCIPReceiver
 * @notice Base contract for receiving cross-chain messages via Chainlink CCIP.
 *         Contracts that need to receive CCIP messages inherit from this and
 *         override _ccipReceive().
 *
 *         Reference: https://docs.chain.link/ccip/api-reference/ccip-receiver
 *
 * CCIP Message Flow:
 * 1. Source chain contract calls Router.ccipSend()
 * 2. CCIP DON picks up the message and relays it
 * 3. Destination Router calls ccipReceive() on this contract
 * 4. ccipReceive() validates the Router caller and delegates to _ccipReceive()
 */
abstract contract CCIPReceiver {
    /// @notice The CCIP Router address on this chain.
    address internal immutable i_ccipRouter;

    error InvalidRouter(address router);

    /// @param router The CCIP Router address for this chain.
    constructor(address router) {
        if (router == address(0)) revert InvalidRouter(address(0));
        i_ccipRouter = router;
    }

    /// @notice Entry point called by the CCIP Router when a message arrives.
    /// @dev Only the Router can call this function. Delegates to _ccipReceive().
    /// @param message The decoded cross-chain message.
    function ccipReceive(Client.Any2EVMMessage calldata message) external {
        if (msg.sender != i_ccipRouter) revert InvalidRouter(msg.sender);
        _ccipReceive(message);
    }

    /// @notice Override this function to handle incoming CCIP messages.
    /// @param message The decoded cross-chain message with payload and metadata.
    function _ccipReceive(Client.Any2EVMMessage calldata message) internal virtual;

    /// @notice Returns the CCIP Router address.
    function getCCIPRouter() public view returns (address) {
        return i_ccipRouter;
    }

    /// @notice IERC165 support for CCIP Router compatibility check.
    function supportsInterface(bytes4 interfaceId) public pure virtual returns (bool) {
        return interfaceId == type(CCIPReceiver).interfaceId || interfaceId == 0x01ffc9a7;
    }
}
