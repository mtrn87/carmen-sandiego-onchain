// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";
import {IGameMaster} from "./interfaces/IGameMaster.sol";

/**
 * @title GameMasterProxy
 * @notice Receives CRE workflow reports via KeystoneForwarder and forwards
 *         decoded actions to GameMaster.
 *         Actions: 1=receiveClue, 2=resolveCapture, 3=updateTarget,
 *                  4=receiveWalletFragment, 5=resolveWalletCapture,
 *                  6=setMissionTokenURI, 7=resolveClueOnCity,
 *                  8=resolveDossierOnCity, 9=resolveCaptureOnCity
 */
contract GameMasterProxy is ReceiverTemplate {
    IGameMaster public gameMaster;

    uint8 public constant ACTION_RECEIVE_CLUE = 1;
    uint8 public constant ACTION_RESOLVE_CAPTURE = 2;
    uint8 public constant ACTION_UPDATE_TARGET = 3;
    uint8 public constant ACTION_RECEIVE_WALLET_FRAGMENT = 4;
    uint8 public constant ACTION_RESOLVE_WALLET_CAPTURE = 5;
    uint8 public constant ACTION_SET_TOKEN_URI = 6;
    uint8 public constant ACTION_RESOLVE_CLUE_ON_CITY = 7;
    uint8 public constant ACTION_RESOLVE_DOSSIER_ON_CITY = 8;
    uint8 public constant ACTION_RESOLVE_CAPTURE_ON_CITY = 9;

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
            (uint256 missionId, uint8 clueType, bytes32 contentHash, string memory ipfsPointer, uint8 strength) =
                abi.decode(data, (uint256, uint8, bytes32, string, uint8));
            gameMaster.receiveClue(missionId, IGameMaster.ClueType(clueType), contentHash, ipfsPointer, strength);
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
        } else if (action == ACTION_RECEIVE_WALLET_FRAGMENT) {
            (uint256 missionId, uint8 startIndex, uint8 length, bytes32 contentHash, string memory ipfsPointer) =
                abi.decode(data, (uint256, uint8, uint8, bytes32, string));
            gameMaster.receiveWalletFragment(missionId, startIndex, length, contentHash, ipfsPointer);
            emit ActionForwarded(action, missionId);
        } else if (action == ACTION_RESOLVE_WALLET_CAPTURE) {
            (uint256 missionId, address submittedWallet, uint256 revealedChainId, bytes32 salt) =
                abi.decode(data, (uint256, address, uint256, bytes32));
            gameMaster.resolveWalletCapture(missionId, submittedWallet, revealedChainId, salt);
            emit ActionForwarded(action, missionId);
        } else if (action == ACTION_SET_TOKEN_URI) {
            (uint256 missionId, string memory uri) =
                abi.decode(data, (uint256, string));
            gameMaster.setMissionTokenURI(missionId, uri);
            emit ActionForwarded(action, missionId);
        } else if (action == ACTION_RESOLVE_CLUE_ON_CITY) {
            (address cityNode, uint256 requestId, uint8 clueType, bytes32 clueDataHash, bytes32 anomalyRefId) =
                abi.decode(data, (address, uint256, uint8, bytes32, bytes32));
            gameMaster.resolveClueOnCity(cityNode, requestId, clueType, clueDataHash, anomalyRefId);
            emit ActionForwarded(action, requestId);
        } else if (action == ACTION_RESOLVE_DOSSIER_ON_CITY) {
            (address cityNode, uint256 requestId, bytes32 dossierHash, uint8 confidence, bytes32 nextObjectiveHintHash) =
                abi.decode(data, (address, uint256, bytes32, uint8, bytes32));
            gameMaster.resolveDossierOnCity(cityNode, requestId, dossierHash, confidence, nextObjectiveHintHash);
            emit ActionForwarded(action, requestId);
        } else if (action == ACTION_RESOLVE_CAPTURE_ON_CITY) {
            (address cityNode, uint256 requestId, bool success, uint8 reasonCode, bytes32 gmNoteHash) =
                abi.decode(data, (address, uint256, bool, uint8, bytes32));
            gameMaster.resolveCaptureOnCity(cityNode, requestId, success, reasonCode, gmNoteHash);
            emit ActionForwarded(action, requestId);
        } else {
            revert UnknownAction(action);
        }
    }
}
