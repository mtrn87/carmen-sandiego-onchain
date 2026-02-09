// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {IVRFCoordinatorV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";

/**
 * @title VRFCoordinatorV2PlusMock
 * @notice Lightweight VRF v2.5 mock for local Hardhat testing.
 *         Does NOT depend on OpenZeppelin 4.x.
 *         Only implements what's needed for GameMaster E2E tests.
 */
contract VRFCoordinatorV2PlusMock is IVRFCoordinatorV2Plus {
    // --- Events ---
    event SubscriptionCreated(uint256 indexed subId, address owner);
    event RandomWordsRequested(uint256 indexed requestId, uint256 indexed subId);
    event RandomWordsFulfilled(uint256 indexed requestId, bool success);

    // --- Subscription ---
    struct Subscription {
        address owner;
        uint96 balance;
        uint96 nativeBalance;
        uint64 reqCount;
        mapping(address => bool) consumers;
        address[] consumerList;
    }

    uint256 private _nextSubId = 1;
    uint256 private _nextRequestId = 1;
    mapping(uint256 => Subscription) private _subscriptions;

    // --- Request tracking ---
    struct Request {
        uint256 subId;
        address consumer;
        uint32 callbackGasLimit;
        uint32 numWords;
    }
    mapping(uint256 => Request) private _requests;

    // --- Constructor (accepts same params as Chainlink mock for compatibility) ---
    constructor(uint96, uint96, int256) {}

    // ============================================================
    //                   SUBSCRIPTION MANAGEMENT
    // ============================================================

    function createSubscription() external override returns (uint256 subId) {
        subId = _nextSubId++;
        _subscriptions[subId].owner = msg.sender;
        emit SubscriptionCreated(subId, msg.sender);
    }

    function addConsumer(uint256 subId, address consumer) external override {
        require(_subscriptions[subId].owner == msg.sender, "Not sub owner");
        require(!_subscriptions[subId].consumers[consumer], "Already added");
        _subscriptions[subId].consumers[consumer] = true;
        _subscriptions[subId].consumerList.push(consumer);
    }

    function removeConsumer(uint256 subId, address consumer) external override {
        require(_subscriptions[subId].owner == msg.sender, "Not sub owner");
        _subscriptions[subId].consumers[consumer] = false;
    }

    function fundSubscription(uint256 subId, uint96 amount) external {
        _subscriptions[subId].balance += amount;
    }

    function fundSubscriptionWithNative(uint256 subId) external payable override {
        _subscriptions[subId].nativeBalance += uint96(msg.value);
    }

    function cancelSubscription(uint256 subId, address) external override {
        require(_subscriptions[subId].owner == msg.sender, "Not sub owner");
        delete _subscriptions[subId];
    }

    function getSubscription(uint256 subId)
        external
        view
        override
        returns (uint96 balance, uint96 nativeBalance, uint64 reqCount, address owner, address[] memory consumers)
    {
        Subscription storage sub = _subscriptions[subId];
        return (sub.balance, sub.nativeBalance, sub.reqCount, sub.owner, sub.consumerList);
    }

    function pendingRequestExists(uint256) external pure override returns (bool) {
        return false;
    }

    function getActiveSubscriptionIds(uint256, uint256) external pure override returns (uint256[] memory) {
        return new uint256[](0);
    }

    function acceptSubscriptionOwnerTransfer(uint256) external pure override {
        revert("Not implemented");
    }

    function requestSubscriptionOwnerTransfer(uint256, address) external pure override {
        revert("Not implemented");
    }

    // ============================================================
    //                   VRF REQUESTS
    // ============================================================

    function requestRandomWords(
        VRFV2PlusClient.RandomWordsRequest calldata req
    ) external override returns (uint256 requestId) {
        require(_subscriptions[req.subId].consumers[msg.sender], "Not a consumer");
        require(_subscriptions[req.subId].balance > 0, "Insufficient balance");

        requestId = _nextRequestId++;

        _requests[requestId] = Request({
            subId: req.subId,
            consumer: msg.sender,
            callbackGasLimit: req.callbackGasLimit,
            numWords: req.numWords
        });

        _subscriptions[req.subId].reqCount++;

        emit RandomWordsRequested(requestId, req.subId);
    }

    // ============================================================
    //                   FULFILL (TEST CONTROL)
    // ============================================================

    /**
     * @notice Fulfill a VRF request with specific random words (for test control).
     * @param requestId The request to fulfill.
     * @param consumer The consumer contract address.
     * @param words The "random" words to deliver.
     */
    function fulfillRandomWordsWithOverride(
        uint256 requestId,
        address consumer,
        uint256[] memory words
    ) external {
        Request memory req = _requests[requestId];
        require(req.consumer != address(0), "Request not found");
        require(req.consumer == consumer, "Wrong consumer");

        // Call the consumer's rawFulfillRandomWords
        (bool success, ) = consumer.call(
            abi.encodeWithSignature(
                "rawFulfillRandomWords(uint256,uint256[])",
                requestId,
                words
            )
        );

        emit RandomWordsFulfilled(requestId, success);
        require(success, "Fulfillment failed");

        delete _requests[requestId];
    }

    /**
     * @notice Fulfill with auto-generated pseudo-random words (convenience).
     */
    function fulfillRandomWords(uint256 requestId, address consumer) external {
        Request memory req = _requests[requestId];
        uint256[] memory words = new uint256[](req.numWords);
        for (uint32 i = 0; i < req.numWords; i++) {
            words[i] = uint256(keccak256(abi.encodePacked(requestId, i, block.timestamp)));
        }
        this.fulfillRandomWordsWithOverride(requestId, consumer, words);
    }
}
