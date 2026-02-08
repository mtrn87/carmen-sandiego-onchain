# On-Chain Flow -- Technical Reference

This document describes every on-chain interaction in the Carmen Sandiego game, including smart contract calls, Chainlink VRF requests, CRE workflow triggers, and cross-chain state updates.

---

## Contract Addresses (Testnets)

| Contract | Chain | Role |
|----------|-------|------|
| `GameMaster.sol` | Ethereum Sepolia (11155111) | HQ -- main game orchestration |
| `CityNode.sol` | Arbitrum Sepolia (421614) | City "Tokyo" |
| `CityNode.sol` | Base Sepolia (84532) | City "Paris" |

---

## Phase 1: Mission Start

```
Player                    GameMaster (Sepolia)           VRF v2.5             CRE Workflow
  |                              |                          |                      |
  |--- startMission() --------->|                          |                      |
  |                              |                          |                      |
  |                              |-- requestRandomWords -->|                      |
  |                              |                          |                      |
  |                              |<-- fulfillRandomWords --|                      |
  |                              |   (random city index)    |                      |
  |                              |                          |                      |
  |                              |-- emit MissionStarted --------------------------------->|
  |                              |-- emit CarmenLocationSet                        |
  |                              |                                                 |
  |                              |                                         [CRE Workflow]
  |                              |                                         1. Read mission state
  |                              |                                         2. Call OpenAI (briefing)
  |                              |                                         3. Call ElevenLabs (audio)
  |                              |                                         4. Upload to IPFS
  |                              |                                                 |
  |                              |<------------- receiveClue (briefing) -----------|
  |                              |                                                 |
  |                              |                         CityNode (target chain) |
  |                              |                              |<--- EVM Write ---|
  |                              |                              | updateCarmenPresence(true)
  |                              |                              |
  |<-- read briefing clue ------|                              |
```

### What happens on-chain:

1. **`GameMaster.startMission()`** (player tx)
   - Creates a new `Mission` struct with `status = Active`
   - Records `startBlock` for the block-based timer
   - Calls `VRFCoordinatorV2_5.requestRandomWords()` to get Carmen's location
   - Emits `MissionStarted(missionId, player, startBlock)`

2. **`GameMaster.fulfillRandomWords()`** (VRF callback)
   - Receives random number from Chainlink VRF
   - Selects city: `randomWords[0] % validChainIds.length`
   - Sets `mission.targetChainId`
   - Emits `CarmenLocationSet(missionId, targetChainId)`

3. **CRE Workflow: `generateBriefing`** (triggered by MissionStarted event)
   - Reads mission state via EVM Read
   - Calls OpenAI API to generate narrative briefing
   - Calls ElevenLabs API to convert to audio
   - Uploads audio to IPFS
   - Calls `GameMaster.receiveClue()` with content hash + IPFS pointer
   - Calls `CityNode.updateCarmenPresence(missionId, true)` on target chain

---

## Phase 2: Investigation Loop

```
Player                    GameMaster (Sepolia)           CRE Workflow          CityNode
  |                              |                          |                      |
  |--- submitInvestigation() -->|                          |                      |
  |    (chainId: 421614)        |                          |                      |
  |                              |                          |                      |
  |                              |-- [wrong city?] ------->|                      |
  |                              |   emit InvestigationSubmitted                   |
  |                              |                          |                      |
  |                              |                   [CRE Workflow]                |
  |                              |                   1. EVM Read: where is Carmen? |
  |                              |                          |--- getCarmenStatus ->|
  |                              |                          |<-- true/false -------|
  |                              |                   2. VRF determines:            |
  |                              |                      - true clue (70%) or       |
  |                              |                        false lead (30%)         |
  |                              |                      - text or audio            |
  |                              |                   3. Call OpenAI                 |
  |                              |                   4. If audio: ElevenLabs       |
  |                              |                   5. Upload to IPFS             |
  |                              |                          |                      |
  |                              |<--- receiveClue() ------|                      |
  |                              |                          |                      |
  |<-- read clue ---------------|                          |                      |
  |                              |                          |                      |
  |  [repeat until found        |                          |                      |
  |   or max attempts]          |                          |                      |
```

### What happens on-chain:

1. **`GameMaster.submitInvestigation(chainId)`** (player tx)
   - Validates: active mission, under MAX_INVESTIGATIONS (10), under MAX_BLOCKS (50)
   - Validates: chainId is a valid city
   - Increments `investigationsCount`
   - **If correct chain**: calls `_captureCarmen()` (see Phase 3)
   - **If wrong chain + max attempts**: calls `_failMission()`
   - **If wrong chain**: emits `InvestigationSubmitted(missionId, player, chainId)`

2. **CRE Workflow: `generateClue`** (triggered by InvestigationSubmitted event)
   - Reads Carmen's actual location via `CityNode.getCarmenStatus()` (EVM Read cross-chain)
   - Determines clue veracity (70% true / 30% false) and type (text / audio)
   - Generates appropriate clue via OpenAI
   - If audio: converts via ElevenLabs, uploads to IPFS
   - Calls `GameMaster.receiveClue()` with the clue data

### Clue Data Structure (on-chain):

```solidity
struct Clue {
    ClueType clueType;      // Text or Audio
    bytes32 contentHash;     // keccak256 of content (verification)
    string ipfsPointer;      // IPFS CID for audio
    string textContent;      // Text content for text clues
    bool isTrue;             // Points to real location?
    uint256 timestamp;       // When the clue was generated
}
```

---

## Phase 3: Capture

```
Player                    GameMaster (Sepolia)           CRE Workflow
  |                              |                          |
  |--- submitInvestigation() -->|                          |
  |    (correct chainId!)       |                          |
  |                              |                          |
  |                              |-- _captureCarmen() ---->|
  |                              |   status = Completed     |
  |                              |   calculate reward       |
  |                              |                          |
  |                              |-- emit CarmenCaptured ------------------>|
  |                              |   (missionId, player,    |               |
  |                              |    blocksUsed, reward)   |        [CRE Workflow]
  |                              |                          |        generateFinale
  |                              |                          |        1. Read full game history
  |                              |                          |        2. OpenAI: personalized ending
  |                              |                          |        3. ElevenLabs: dramatic audio
  |                              |                          |        4. Upload to IPFS
  |                              |                          |               |
  |<-- Mission Complete! -------|<--- receiveClue (finale)-|               |
```

### What happens on-chain:

1. **`GameMaster._captureCarmen(missionId)`** (internal)
   - Sets `mission.status = Completed`
   - Calculates `blocksUsed = block.number - mission.startBlock`
   - Calculates reward tier (Gold/Silver/Bronze)
   - Clears `activePlayerMission[player]` (player can start a new mission)
   - Emits `CarmenCaptured(missionId, player, blocksUsed, reward)`

2. **CRE Workflow: `generateFinale`** (triggered by CarmenCaptured event)
   - Reads full mission history (all clues, investigations, blocks used)
   - Generates personalized conclusion narrative via OpenAI
   - Creates dramatic audio via ElevenLabs
   - Delivers final clue on-chain

### Reward Calculation:

```solidity
function _calculateReward(uint256 blocksUsed) internal pure returns (uint256) {
    if (blocksUsed <= 20) return 100;   // Gold
    if (blocksUsed <= 35) return 75;    // Silver
    if (blocksUsed <= 50) return 50;    // Bronze
    return 0;                           // Failed
}
```

---

## Phase 4: Mission Failed

```
Player                    GameMaster (Sepolia)
  |                              |
  |--- submitInvestigation() -->|
  |    (10th wrong guess)       |
  |                              |
  |                              |-- _failMission()
  |                              |   status = Failed
  |                              |   clear active mission
  |                              |
  |                              |-- emit MissionFailed
  |                              |   (missionId, player)
  |                              |
  |<-- Mission Failed -----------|
```

A mission fails when:
- Player reaches **MAX_INVESTIGATIONS** (10 attempts) without finding Carmen
- Player exceeds **MAX_BLOCKS** (50 blocks) since mission start

---

## Cross-Chain State Management

CRE manages state across chains using its native **EVM Read/Write** capabilities:

```
                    CRE Workflow
                         |
          +--------------+--------------+
          |              |              |
     EVM Write      EVM Read       EVM Write
          |              |              |
          v              v              v
    GameMaster      CityNode       CityNode
    (Sepolia)       (Arbitrum)     (Base)
    - clues         - Carmen       - Carmen
    - missions        presence       presence
    - rewards
```

### State Distribution:

| Data | Location | Who Writes | Who Reads |
|------|----------|-----------|-----------|
| Mission lifecycle | GameMaster (Sepolia) | Player + CRE | Frontend + CRE |
| Clues (hash + pointer) | GameMaster (Sepolia) | CRE | Frontend |
| Carmen's presence | CityNode (per chain) | CRE | CRE (cross-chain) |
| Audio/media files | IPFS | CRE | Frontend |

---

## Event Reference

All events that CRE workflows listen to:

| Event | Contract | Emitted When | CRE Workflow Triggered |
|-------|----------|-------------|----------------------|
| `MissionStarted(missionId, player, startBlock)` | GameMaster | Player starts mission | `generateBriefing` |
| `CarmenLocationSet(missionId, chainId)` | GameMaster | VRF callback sets location | -- (internal) |
| `InvestigationSubmitted(missionId, player, chainId)` | GameMaster | Player investigates wrong city | `generateClue` |
| `ClueReceived(missionId, clueType, hash, ipfs)` | GameMaster | CRE delivers a clue | -- (frontend reads) |
| `CarmenCaptured(missionId, player, blocks, reward)` | GameMaster | Player finds Carmen | `generateFinale` |
| `MissionFailed(missionId, player)` | GameMaster | Player runs out of attempts | -- |
| `CarmenArrived(missionId)` | CityNode | CRE places Carmen on this chain | -- |
| `CarmenDeparted(missionId)` | CityNode | CRE moves Carmen away | -- |

---

## Gas Estimates

| Function | Estimated Gas | Who Pays |
|----------|-------------|----------|
| `startMission()` | ~150,000 | Player |
| `submitInvestigation()` | ~80,000 | Player |
| `receiveClue()` | ~100,000 | CRE Oracle |
| `updateCarmenPresence()` | ~50,000 | CRE Oracle |
| `fulfillRandomWords()` | ~100,000 | VRF Coordinator |

---

## Security Model

| Concern | Protection |
|---------|-----------|
| Carmen's location privacy | `targetChainId` is set by VRF callback, not exposed to players directly |
| Clue authenticity | Only `creOracle` address can call `receiveClue()` |
| Cross-chain integrity | Only `creOracle` can update `CityNode.updateCarmenPresence()` |
| Randomness fairness | VRF v2.5 provides cryptographic proof of randomness |
| Admin control | Owner (inherited from Chainlink) can update CRE oracle and city list |
