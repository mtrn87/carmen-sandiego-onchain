// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";
import {IGameMaster} from "./interfaces/IGameMaster.sol";

/**
 * @title GameMasterProxy
 * @notice Receives CRE workflow reports via KeystoneForwarder and forwards
 *         decoded actions to GameMaster.
 *         Actions: 1=receiveClue, 2=resolveCapture, 3=updateTarget
 */
contract GameMasterProxy is ReceiverTemplate {
    IGameMaster public gameMaster;

    uint8 public constant ACTION_RECEIVE_CLUE = 1;
    uint8 public constant ACTION_RESOLVE_CAPTURE = 2;
    uint8 public constant ACTION_UPDATE_TARGET = 3;

    event ActionForwarded(uint8 action, uint256 missionId);

    error UnknownAction(uint8 action);

    constructor(
        address _forwarder,
        address _gameMaster
    ) ReceiverTemplate(_forwarder) {
        gameMaster = IGameMaster(_gameMaster);
    }

    function _processReport(bytes calldata report) internal override {
        (uint8 action, bytes memory data) = abi.decode(report, (uint8, bytes));

        if (action == ACTION_RECEIVE_CLUE) {
            (uint256 missionId, uint8 clueType, bytes32 contentHash, string memory ipfsPointer) =
                abi.decode(data, (uint256, uint8, bytes32, string));
            gameMaster.receiveClue(missionId, IGameMaster.ClueType(clueType), contentHash, ipfsPointer);
            emit ActionForwarded(action, missionId);
        } else if (action == ACTION_RESOLVE_CAPTURE) {
            (uint256 missionId, uint256 revealedChainId, bytes32 salt) =
                abi.decode(data, (uint256, uint256, bytes32));
            gameMaster.resolveCapture(missionId, revealedChainId, salt);
            emit ActionForwarded(action, missionId);
        } else if (action == ACTION_UPDATE_TARGET) {
            (uint256 missionId, bytes32 newTargetHash) =
                abi.decode(data, (uint256, bytes32));
            gameMaster.updateTarget(missionId, newTargetHash);
            emit ActionForwarded(action, missionId);
        } else {
            revert UnknownAction(action);
        }
    }
}
