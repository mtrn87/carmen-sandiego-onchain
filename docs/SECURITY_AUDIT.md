# Smart Contract Security Audit Report

**Project:** Carmen Sandiego On-Chain
**Date:** 2026-03-01
**Contracts Audited:** GameMaster.sol, GameMasterProxy.sol, MissionNFT.sol, CityNode.sol, PlayerRegistry.sol, ReceiverTemplate.sol, CCIPReceiver.sol
**Solidity Version:** ^0.8.24

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 5 |
| Medium | 7 |
| Low | 8 |
| Informational | 6 |

---

## CRITICAL

### C-01: ReceiverTemplate allows forwarder to be set to address(0), bypassing sender validation

**Location:** `contracts/src/ReceiverTemplate.sol:57-58, :84-91`

**Description:** The `setForwarderAddress()` function allows the owner to set the forwarder to `address(0)`. When `s_forwarderAddress` is zero, the sender check becomes `address(0) != address(0)` which is `false`, so the `revert` is skipped. This means **anyone** can call `onReport()` and inject arbitrary actions into GameMaster via GameMasterProxy — resolving captures, delivering fake clues, minting NFTs, and manipulating game state.

```solidity
// The condition is (address(0) != address(0) && ...) which is false — revert never fires
if (s_forwarderAddress != address(0) && msg.sender != s_forwarderAddress) {
    revert InvalidSender(msg.sender, s_forwarderAddress);
}
```

**Recommendation:** Disallow setting forwarder to `address(0)`:

```solidity
function setForwarderAddress(address _forwarder) external onlyOwner {
    require(_forwarder != address(0), "Cannot set zero forwarder");
    // ...
}
```

---

## HIGH

### H-01: CRE oracle is a single point of trust

**Location:** `contracts/src/GameMaster.sol:61, :91-94`

**Description:** The `creOracle` address has unilateral power to resolve captures, deliver clues, move Carmen, set NFT URIs, deliver wallet fragments, and resolve wallet captures. No multi-sig, timelock, or secondary validation exists. If this key is compromised, an attacker has full control over every game outcome.

**Recommendation:** For production: use a multi-sig for the CRE oracle role, or implement a timelock on `setCREOracle()`. For hackathon scope this is acceptable but should be documented.

### H-02: Salt is publicly readable, allowing brute-force of Carmen's location

**Location:** `contracts/src/GameMaster.sol:45, :420-421`

**Description:** `missionSalts` is a public mapping, and `validChainIds` is a public array with only 2–6 entries. Any observer can read the salt and target hash, then compute `keccak256(abi.encodePacked(chainId, salt))` for each valid chain ID to find the match. This breaks the commit-reveal pattern — Carmen's location is public from the moment VRF fulfills.

This is by design for CRE accessibility, but it means players or MEV bots can trivially determine the correct chain.

**Recommendation:** Share the salt with CRE through an off-chain channel (encrypted via CRE's public key) rather than storing on-chain. If on-chain storage is required for CRE v1, document this as a known trade-off.

### H-03: `setCREOracle` allows setting to address(0)

**Location:** `contracts/src/GameMaster.sol:746-748`

**Description:** No zero-address check. Setting CRE oracle to `address(0)` permanently bricks all `onlyCRE` functions, making active missions unresolvable.

**Recommendation:** Add `require(_creOracle != address(0), "Invalid address");`.

### H-04: `resolveClueOnCity` allows CRE to call arbitrary external contract

**Location:** `contracts/src/GameMaster.sol:313-325`

**Description:** `resolveClueOnCity`, `resolveDossierOnCity`, and `resolveCaptureOnCity` accept an arbitrary `cityNode` address from the CRE. If the oracle is compromised, this becomes a gadget to call any contract. No whitelist of valid CityNode addresses exists.

**Recommendation:** Maintain a mapping of approved CityNode addresses:
```solidity
mapping(address => bool) public approvedCityNodes;
require(approvedCityNodes[cityNode], "Unapproved CityNode");
```

### H-05: No validation that CRE-submitted missionId belongs to expected player

**Location:** `contracts/src/GameMaster.sol:236-263` (receiveClue), `:441-473` (receiveWalletFragment)

**Description:** `receiveClue` and `receiveWalletFragment` only check that the mission is Active, not that the action corresponds to a legitimate investigation by the mission's player. A compromised CRE could deliver clues/fragments to any active mission.

**Recommendation:** Store which player triggered each investigation so on-chain validation can be performed, or emit player address in events for off-chain verification.

---

## MEDIUM

### M-01: `broadcastCarmenMoveToAll` silently skips underfunded destinations

**Location:** `contracts/src/GameMaster.sol:686`

**Description:** When broadcasting, if the contract runs low on ETH mid-loop, remaining destinations are silently skipped with `continue`. This creates inconsistent game state — some CityNodes updated, others not — with no error or event.

**Recommendation:** Emit an event when a destination is skipped due to insufficient funds.

### M-02: `playerScansCompleted` in CityNode can overflow uint8

**Location:** `contracts/src/CityNode.sol:374`

**Description:** `playerScansCompleted` is `uint8`, incremented without cap. A player scanning 255 times triggers Solidity 0.8 overflow revert, permanently bricking their scan ability on that CityNode.

**Recommendation:** Use `uint16` or `uint32`, or add a cap check.

### M-03: Reward returns 0 for blocks 51–200 creating a dead zone

**Location:** `contracts/src/GameMaster.sol:33, :892-897`

**Description:** `MAX_BLOCKS` is 200, but `_calculateReward` returns 0 for anything above 50 blocks. Captures between blocks 51–200 yield zero reward while the mission remains active. This creates a 150-block dead zone.

**Recommendation:** Align `MAX_BLOCKS` with reward tiers, or add a participation tier. See also `docs/GAMEPLAY_BALANCE.md` for full analysis.

### M-04: MissionNFT `_safeMint` callback could enable reentrancy

**Location:** `contracts/src/MissionNFT.sol:44`

**Description:** `_safeMint` calls `onERC721Received` on the recipient if it's a contract. This is called from `_captureCarmen`. A malicious player contract could re-enter GameMaster during the mint. Risk is low because mission status is set to `Completed` before the mint, but defense in depth is recommended.

**Recommendation:** Add a reentrancy guard on `_captureCarmen`, or use `_mint` instead of `_safeMint`.

### M-05: No events emitted on critical admin functions

**Location:** `contracts/src/GameMaster.sol:746-748, :794-796, :798-809`

**Description:** `setCREOracle`, `setInvestigationCooldown`, and `setValidChainIds` do not emit events. Monitoring tools cannot detect these security-critical configuration changes.

**Recommendation:** Add events for all admin state changes.

### M-06: Signature does not include chain ID (cross-chain replay risk)

**Location:** `contracts/src/PlayerRegistry.sol:155`

**Description:** The signed message is `keccak256(abi.encodePacked(playerAddress, nickname, nonce, address(this)))`. While `address(this)` helps, there is no `block.chainid`. If PlayerRegistry is deployed at the same address on another chain (possible with CREATE2), signatures can be replayed.

**Recommendation:** Include `block.chainid` in the hash, or use EIP-712 typed structured data signing.

### M-07: `playerIdentityCommits` array grows unboundedly

**Location:** `contracts/src/GameMaster.sol:71, :394`

**Description:** `trackPlayerClue` pushes to `playerIdentityCommits[player]` without bound. Over many missions, the getter view function could hit gas limits, creating a DoS.

**Recommendation:** Cap the array size or add pagination to the getter.

---

## LOW

### L-01: `registerPlayer` allows unlimited public key overwrites

**Location:** `contracts/src/GameMaster.sol:134-138`

**Description:** A player can call `registerPlayer` multiple times, overwriting their ECIES public key. Encrypted clues sent with the old key become undecryptable with no cooldown or confirmation.

**Recommendation:** Add a separate `updatePublicKey` function with safeguards, or emit distinct events.

### L-02: `missionFragmentCount` uint8 boundary

**Location:** `contracts/src/GameMaster.sol:469-470`

**Description:** `missionFragmentCount` is `uint8`. The fragment overlap bitmap provides a natural cap (~8 fragments for 5-char windows in 40-char address), but a buggy CRE could theoretically push toward overflow.

**Recommendation:** Use `uint16` for additional safety.

### L-03: CityNode `setClueSchema` has no length validation

**Location:** `contracts/src/CityNode.sol:710-715`

**Description:** Accepts arbitrary-length array. The `getClueSchema` function casts length to `uint8`, silently truncating above 255 entries.

**Recommendation:** Add bounds: `require(_clueTypes.length > 0 && _clueTypes.length <= 10)`.

### L-04: Locations can be reconfigured with active player progress

**Location:** `contracts/src/CityNode.sol:650-656`

**Description:** `setupLocations` can be called multiple times, overwriting locations while player progress bitmaps still reference old indices.

**Recommendation:** Prevent reconfiguration while players have active progress, or add a version counter.

### L-05: `withdrawETH` fails silently for contracts without receive/fallback

**Location:** `contracts/src/GameMaster.sol:964-969`

**Description:** Low-level `call` with value fails if recipient is a contract without a payable fallback. The `require(sent, ...)` handles this, but the behavior should be documented.

**Recommendation:** Document that `to` should be an EOA or payable contract.

### L-06: Case-sensitive nickname comparison

**Location:** `contracts/src/PlayerRegistry.sol:540-542`

**Description:** "Alice" and "alice" are treated as different nicknames, which could cause player confusion.

**Recommendation:** Normalize nicknames to lowercase before storing, or document case-sensitivity.

### L-07: `CaptureReasonCode` enum casting unchecked

**Location:** `contracts/src/CityNode.sol:539`

**Description:** `CaptureReasonCode(reasonCode)` succeeds for any uint8 value, including undefined enum values (6–255). Solidity 0.8 does not revert on out-of-range enum casts from integers.

**Recommendation:** Add range check: `require(reasonCode <= uint8(CaptureReasonCode.INVALID_BUNDLE))`.

### L-08: `getAverageBlocksPerMission` is a DoS vector

**Location:** `contracts/src/PlayerRegistry.sol:466-475`

**Description:** View function iterates the entire `playerMissions` array. For players with many missions, this exceeds block gas limit or is extremely slow.

**Recommendation:** Maintain a running total to compute the average in O(1).

---

## INFORMATIONAL

### I-01: `cluesReceived` and `investigationsCount` are uint8

**Location:** `contracts/src/GameMaster.sol` (via IGameMaster.sol:15-16)

Given `MAX_INVESTIGATIONS = 10`, `uint8` is sufficient. No immediate risk but worth noting for future parameter changes.

### I-02: `CCIPReceiver.supportsInterface` uses abstract contract interfaceId

**Location:** `contracts/src/CCIPReceiver.sol:51`

Non-standard but functional. The official Chainlink implementation may compute a different ID.

### I-03: CityNode constructor uses `address(1)` as CCIP placeholder

**Location:** `contracts/src/CityNode.sol:164`

`address(1)` is the ecrecover precompile on some chains. No attack vector exists, but `address(type(uint160).max)` would be a cleaner sentinel.

### I-04: GameMaster does not check for stale price feed data

**Location:** `contracts/src/GameMaster.sol:906-912`

`_getETHPrice` ignores the `updatedAt` timestamp from `latestRoundData()`. Impact is low (only affects a small reward bonus) and the function gracefully returns 0 on error.

**Recommendation:** For production, add staleness check.

### I-05: No `Ownable2Step` in CityNode and PlayerRegistry

**Location:** `contracts/src/CityNode.sol:727-730`, `contracts/src/PlayerRegistry.sol:123`

One-step ownership transfer risks irrecoverable loss if transferred to wrong address.

**Recommendation:** Use OpenZeppelin's `Ownable2Step`.

### I-06: `playerMissions` and `playerNFTs` arrays grow unboundedly

**Location:** `contracts/src/PlayerRegistry.sol:50-51`

Same concern as M-07 but lower severity for individual player history.

---

## Positive Observations

1. **Commit-reveal pattern** for Carmen's location is correctly structured (the salt exposure in H-02 is a known CRE v1 trade-off).
2. **Swap-and-pop pattern** for `_activeMissionIds` is gas-efficient and correctly implemented.
3. **VRF integration** follows Chainlink best practices with proper callback handling.
4. **CCIP integration** correctly validates Router and implements source chain/sender whitelisting.
5. **Energy system** correctly handles passive regeneration with timestamp-based calculation.
6. **Auto-closing stale missions** in `startMission()` prevents players from getting stuck.
7. **Fragment overlap bitmap** prevents duplicate wallet fragment delivery elegantly.
8. **Solidity 0.8.24** provides built-in overflow/underflow protection.
