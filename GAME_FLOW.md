# Carmen Sandiego On-Chain — Game Flow

Complete technical breakdown of the game mechanics, on-chain interactions, CRE workflows, and cross-chain communication.

---

## Phase 1 — Login & Registration

```
Player -> Privy (Google/Wallet) -> Frontend
  |-- Generate ECIES keypair (secp256k1) -> stored in IndexedDB
  |-- Call GameMaster.registerPlayer(publicKey) -> stored on-chain
  +-- initGame() -> check for pending active mission
```

The player authenticates via Privy (embedded wallet or MetaMask). The ECIES public key is registered on-chain so that CRE can encrypt clues that only the player can decrypt.

---

## Phase 2 — Start Mission (VRF)

```
Player -> GameMaster.startMission()
  |-- Create Mission struct (status=Active, startBlock)
  |-- Request VRF v2.5 -> requestRandomWords()
  +-- VRF callback (fulfillRandomWords):
       |-- cityIndex = randomWord % validChainIds.length
       |-- salt = keccak256(randomWord, missionId)
       |-- targetHash = keccak256(targetChainId, salt)  <-- COMMIT
       |-- Store salt on-chain (for CRE to read)
       +-- emit CarmenLocationCommitted(missionId, targetHash)
```

**Key point**: the contract **never** knows where Carmen is in plaintext. It only stores the hash. This is the **commit** in the commit-reveal pattern.

---

## Phase 3 — Briefing (CRE + AI)

```
CRE Workflow: generate-briefing
  |-- Trigger: MissionStarted event
  |-- Read: player's ECIES public key, valid cities, mission data
  |-- Read: ETH/USD from Chainlink Data Feed via EVMClient.callContract()
  |-- Generate: AI briefing via Groq LLaMA 3.3-70b (temperature=0)
  |-- Fallback: enriched noir-style template from scenarios.json
  |-- ECIES encrypt(briefing, playerPublicKey)
  +-- Deliver: threshold-signed report via writeReport()
```

The frontend displays the briefing (MissionBriefing screen) and opens the interactive map.

---

## Phase 4 — Investigation (Main Loop)

This is the core gameplay loop. The player travels between cities and investigates.

### 4a. On CityNode (per city)

```
Player enters a city -> Frontend loads CityNode contract for that chain
  |-- 3 locations per city (e.g. market, port, bank)
  |-- inspectLocation(idx)      -> costs 1 energy -> marks inspected
  |-- scanAnomalies(idx)        -> costs 6 energy -> reveals suspicious txs
  |-- requestClue(idx, clueIdx) -> costs 2 energy -> async (CRE resolves)
  |-- flagTx(refId)             -> costs 1 energy -> marks suspicious tx
  |-- requestDossier()          -> costs 1 energy -> async (CRE resolves)
  +-- requestCapture(wallet, evidence) -> costs 3 energy -> async
```

**Energy**: 20 max, regenerates 1 every 15 min. Forces the player to choose actions carefully.

### 4b. Submit Investigation (GameMaster)

```
Player -> GameMaster.submitInvestigation(chainId)
  |-- Verify cooldown, max investigations (10), max blocks (200)
  |-- emit InvestigationSubmitted(missionId, player, chainId)
  +-- If limits exceeded -> _failMission()
```

### 4c. CRE Workflow: mission-start (responds to investigation)

```
CRE detects InvestigationSubmitted via LogTrigger
  |-- Read on-chain: salt, validCities, mission, playerPublicKey
  |-- Brute-force: test keccak256(city, salt) for each city
  |   +-- Find where Carmen is (without the contract knowing)
  |-- Compare: investigated chainId == Carmen's city?
  |   |-- YES -> select "true clue" from scenarios.json
  |   +-- NO  -> select "false clue" (misleading)
  |-- Calculate strength score (deterministic, based on salt)
  |-- ECIES encrypt(clue, playerPublicKey)
  |-- If correct city + already has 3+ clues:
  |   +-- Send ACTION_RESOLVE_CAPTURE (reveal chainId + salt)
  +-- Otherwise:
      +-- Send ACTION_RECEIVE_CLUE (encrypted clue)
```

CRE is the **blind arbiter** — it knows where Carmen is (brute-force of the hash) but the contract does not. The contract receives encrypted clues without knowing if they are true or false.

### 4d. Frontend receives the clue

```
Event listener: ClueReceived
  |-- Receive encryptedClue (hex of encrypted clue)
  |-- decryptClue() with private key from IndexedDB
  |-- Display ClueModal (text, audio, or image)
  +-- Update state: clues[], evidence[], terminalLines
```

---

## Phase 5 — Carmen Moves (Automation)

```
CRE Workflow: carmen-moves (Cron: every 3 min)
  |-- Read getActiveMissionIds() -> all active missions
  |-- For each mission:
  |   |-- Brute-force current city from targetHash
  |   |-- Pick new city (deterministic, avoids repeat)
  |   |-- newTargetHash = keccak256(newCity, salt)
  |   +-- Send ACTION_UPDATE_TARGET + ACTION_BROADCAST_CARMEN_MOVE
  +-- GameMaster.updateTarget() -> updates hash
      +-- CCIP broadcast to CityNodes on all chains
```

This creates **time pressure**: if the player takes too long, Carmen moves to a different city and previous clues become less useful.

---

## Phase 6 — Wallet Fragments (Evidence)

When the player finds the correct city, they also receive **wallet fragments** of Carmen's address:

```
CRE -> GameMaster.receiveWalletFragment(missionId, startIndex, length, ...)
  |-- Reveals pieces of the hex address (e.g. positions 5-10 of 40 chars)
  |-- Bitmap prevents overlap
  +-- With 3+ fragments -> player can attempt submitWalletCapture(address)
```

The player reconstructs Carmen's wallet address from the fragments and submits for capture.

---

## Phase 7 — Capture

Two capture paths:

### 7a. Automatic capture (3+ clues + correct city)

```
mission-start workflow detects:
  cluesReceived >= 3 AND correct investigation
  +-- Send ACTION_RESOLVE_CAPTURE(missionId, revealedChainId, salt)
```

### 7b. Wallet capture (3+ fragments)

```
Player -> submitWalletCapture(reconstructedAddress)
  +-- CRE -> resolveWalletCapture(missionId, wallet, chainId, salt)
```

Both paths lead to the **REVEAL**:

```
GameMaster.resolveCapture():
  |-- VERIFY: keccak256(revealedChainId, salt) == targetHash  <-- REVEAL
  |-- If valid -> _captureCarmen():
  |   |-- mission.status = Completed
  |   |-- Calculate reward based on blocks used
  |   |-- Query ETH/USD price feed (Chainlink Data Feed)
  |   |-- Mint MissionNFT (ERC-721 trophy)
  |   +-- emit CarmenCaptured(missionId, player, blocksUsed, reward)
  +-- If hash mismatch -> revert "Invalid reveal"
```

---

## Phase 8 — NFT Trophy (Finale)

```
CRE Workflow: generate-finale
  |-- Trigger: CarmenCaptured event
  |-- Read: mission data, clues, evidence, salt
  |-- Brute-force -> determine capture city name
  |-- Calculate tier: Gold/Silver/Bronze/Copper
  |-- Generate SVG trophy + ERC-721 metadata JSON (on-chain data URI)
  +-- Send ACTION_SET_TOKEN_URI -> MissionNFT.setTokenURI()
```

The NFT is 100% on-chain (SVG + JSON as data URI), no IPFS.

---

## Phase 9 — Cross-Chain (CCIP)

```
GameMaster.broadcastCarmenMoveToAll(locationHash)
  |-- Send via CCIP Router to each CityNode on different chains
  +-- CityNode._ccipReceive() -> updates ccipCarmenLocationHash
```

Synchronizes game state between Sepolia <-> Arbitrum Sepolia <-> Base Sepolia <-> XDC Apothem.

---

## Summary Diagram

```
PLAYER                 CONTRACTS (Sepolia)         CRE (DON)              CROSS-CHAIN
  |                         |                         |                      |
  |-- register ----------> registerPlayer()          |                      |
  |-- start mission -----> startMission()            |                      |
  |                         |-- VRF request ------->  |                      |
  |                         <-- VRF callback ------   |                      |
  |                         |  (commit hash)          |                      |
  |                         |                    generate-briefing           |
  |                         |                    (AI + Data Feed + ECIES)    |
  |                         |                         |                      |
  |-- investigate city ---> submitInvestigation()     |                      |
  |                         |  emit event ---------> mission-start          |
  |                         |                    |-- brute-force hash        |
  |                         |                    |-- true/false clue         |
  |                         |                    |-- ECIES encrypt           |
  |                         <-- receiveClue() ---+                          |
  <-- decrypt clue ---------+                                               |
  |                         |                    carmen-moves (cron 3min)    |
  |                         <-- updateTarget() --+                          |
  |                         |-- CCIP broadcast --------------------------> CityNodes
  |                         |                                               |
  |-- (3+ clues + correct) |                    mission-start               |
  |                         <-- resolveCapture() +  (REVEAL)                |
  |                         |-- verify hash                                 |
  |                         |-- mint NFT                                    |
  |                         |  emit CarmenCaptured                          |
  |                         |                    generate-finale             |
  |                         <-- setTokenURI() --+  (SVG + metadata)         |
  <-- MISSION COMPLETE! ---+                                                |
```

---

## Chainlink Services Used

| Service | Where | Purpose |
|---------|-------|---------|
| **VRF v2.5** | `startMission()` | Verifiable randomness for Carmen's initial location |
| **CRE/Keystone** | 7 workflows | Decentralized game logic (briefing, clues, moves, finale, registration, verification, cross-chain) |
| **Automation (Cron)** | `carmen-moves` | Periodic Carmen relocation every 3 min |
| **Data Feeds** | `generate-briefing`, `resolveCapture()` | ETH/USD price read inside CRE WASM + reward calculation |
| **CCIP** | `broadcastCarmenMoveToAll()` | Cross-chain state sync to CityNodes |

---

## Contracts

| Contract | Chain | Role |
|----------|-------|------|
| **GameMaster** | Sepolia | Main game engine, commit-reveal, VRF, CCIP sender |
| **GameMasterProxy** | Sepolia | CRE report receiver, routes 11 action types |
| **MissionNFT** | Sepolia | ERC-721 trophy NFTs with on-chain SVG metadata |
| **PlayerRegistry** | Sepolia | Player registration + verification |
| **CityNode** | Arbitrum / Base / XDC | Per-city investigation gameplay, energy system, CCIP receiver |
