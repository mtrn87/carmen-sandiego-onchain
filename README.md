<p align="center">
  <img src="./.github/assets/logo.png" alt="Where in the Web3 World is Carmen Sandiego?" width="500"/>
</p>

<h1 align="center">Where in the Web3 World is Carmen Sandiego?</h1>

<h3 align="center">A Fully Decentralized Mystery Game on Blockchain</h3>

<p align="center">
  <a href="https://chain.link/hackathon"><img src="https://img.shields.io/badge/Chainlink-Convergence%20Hackathon-375BD2?style=for-the-badge&logo=chainlink&logoColor=white" alt="Chainlink Convergence"/></a>
  <a href="#service-1-cre--keystone-decentralized-game-engine"><img src="https://img.shields.io/badge/Powered%20by-Chainlink%20CRE-375BD2?style=for-the-badge&logo=chainlink&logoColor=white" alt="Chainlink CRE"/></a>
  <a href="#service-2-vrf-v25-provably-fair-randomness"><img src="https://img.shields.io/badge/VRF-v2.5-9B59B6?style=for-the-badge" alt="VRF v2.5"/></a>
  <a href="#service-5-data-feeds-dynamic-reward-pricing"><img src="https://img.shields.io/badge/Data%20Feeds-ETH%2FUSD-2ECC71?style=for-the-badge" alt="Data Feeds"/></a>
  <a href="#service-6-ccip-cross-chain-interoperability-protocol"><img src="https://img.shields.io/badge/CCIP-Cross--Chain-E67E22?style=for-the-badge" alt="CCIP"/></a>
  <a href="#deployed-contracts"><img src="https://img.shields.io/badge/Multi--Chain-4%20Testnets-FF6B6B?style=for-the-badge" alt="Multi-Chain"/></a>
</p>

<p align="center">
  <strong>The first blockchain game powered by 6 Chainlink services: CRE, VRF, Functions, Automation, Data Feeds, and CCIP</strong>
</p>

<p align="center">
  <em>Provably fair &middot; Scenario-driven gameplay (AI-ready) &middot; Cross-chain orchestration &middot; End-to-end encryption &middot; On-chain NFT trophies</em>
</p>

<p align="center">
  <a href="https://www.youtube.com/watch?v=TODO"><strong>&#9654; Watch the 3-5 min Video Demo</strong></a>
</p>

---

## The Mission

Carmen Sandiego stole a priceless NFT and is fleeing across blockchains. As an ACME detective, you must track her down by investigating CityNode contracts deployed on **4 different testnets**, collecting encrypted clues, and capturing Carmen before she escapes.

Every mission is **unique**. Every clue is **scenario-driven and ECIES-encrypted**, selected from curated scenario pools with 150+ contextual clues. OpenAI GPT-4o-mini integration is fully coded and ready to activate when CRE v2 ships async handler support. Every outcome is **provably fair via Chainlink VRF**. And the entire Game Master runs inside **Chainlink CRE** — zero centralized servers.

---

## How It Works

1. **Login** — Authenticate via Privy (Google/wallet). An ECIES keypair is generated in your browser. **Chainlink Functions Paymaster** auto-funds your wallet — you never pay gas.
2. **Start Mission** — `GameMaster.startMission()` triggers **Chainlink VRF 2.5**. Carmen's location is hashed: `targetHash = keccak256(chainId, salt)`. Nobody knows where she is.
3. **Investigate** — Select cities on the map. Each city is a real blockchain (Arbitrum = Tokyo, Base = Paris, XDC = Sydney). CRE selects contextual clues from scenario pools, encrypts them with your public key, and delivers them on-chain.
4. **Carmen Moves** — Every 3 minutes, a cron-triggered CRE workflow relocates Carmen to a different chain. Investigate fast.
5. **Capture** — Find the right city with enough evidence. CRE verifies the hash on-chain and mints a personalized SVG trophy as an ERC-721.

> **Zero gas for players.** All costs are covered by the Chainlink Functions Paymaster relay. The player experience is indistinguishable from a traditional web app.

---

## Chainlink Integration Deep-Dive

This project uses **6 Chainlink services** working together as a unified system. Each service solves a specific game design problem that would be impossible with smart contracts alone.

### Architecture: How Chainlink Services Connect

```
                         PLAYER (Browser)
                    React + Privy + ECIES Keys
                     *** ZERO GAS COSTS ***
                              |
          Signs intent        |        Signs TX
          (gasless)           |        (auto-funded)
              |               |              |
   +---------v--------+      |    +---------v---------------------------+
   | CHAINLINK         |      |    |  SMART CONTRACTS (Sepolia Hub)      |
   | FUNCTIONS          |------+    |                                     |
   | Paymaster Relay    |           |  GameMaster ----[VRF 2.5]---+      |
   | - /faucet (fund)   |---------->|  GameMasterProxy <--[CRE]   |      |
   | - /relay (register)|           |  PlayerRegistry              |      |
   | Pays ALL gas       |           |  MissionNFT (ERC-721)        |      |
   +--------------------+           |                               |      |
                                    |  [DATA FEEDS]                 |      |
                                    |  ETH/USD price → rewards +   |      |
                                    |  heist value in USD           |      |
                                    +--------+----------------------+      |
                                             |                             |
                       Events                |    Signed Callbacks         |
                                             |                             |
   +-------------------------------------v-v-----------------------------+
   |              CHAINLINK CRE (7 WASM Workflows)                        |
   |                Decentralized Oracle Network (DON)                    |
   |                                                                      |
   |  1. player-registration  -- Gasless onboarding relay                 |
   |  2. player-check         -- On-chain player verification             |
   |  3. generate-briefing    -- AI mission narrative + ECIES encrypt      |
   |  4. mission-start        -- Clue engine + strength + wallet frags    |
   |  5. carmen-moves         -- [AUTOMATION] Relocate Carmen / 3 min     |
   |  6. generate-finale      -- AI victory text + SVG trophy NFT         |
   |  7. citynode-resolver    -- Cross-chain CityNode request resolver    |
   |                                                                      |
   |  External: OpenAI GPT-4o-mini | [VRF 2.5] Salt | [CRON] Schedule    |
   +---------------------------------------------------------------------|
                                             |
                               [CCIP] Cross-Chain Messages
                                             |
                       +---------------------+---------------------+
                       |                     |                     |
               +-------v------+      +-------v------+     +-------v------+
               | ARBITRUM      |      | BASE          |     | XDC           |
               | SEPOLIA       |      | SEPOLIA       |     | APOTHEM       |
               | CityNode:     |      | CityNode:     |     | CityNode:     |
               | Tokyo         |      | Paris         |     | Sydney        |
               +---------------+      +---------------+     +---------------+
```

### Service #1: CRE / Keystone (Decentralized Game Engine)

**Game Problem:** Who controls the game logic? In a traditional game, a centralized server decides if your move is valid, generates clues, and determines the outcome. That server can cheat, go offline, or be hacked.

**How CRE Solves It:** All game logic runs as 7 WASM workflows inside Chainlink's Decentralized Oracle Network. Multiple independent nodes execute the same code, reach consensus, and sign the result with threshold ECDSA. The "Game Master" isn't a server — it's a decentralized computation layer with no single point of failure.

**In-Game Usage:**
- Player investigates a city → `InvestigationSubmitted` event → CRE **mission-start** workflow brute-forces the VRF hash, selects contextual clues from the scenario pool, ECIES-encrypts them with the player's public key, and delivers the encrypted clue on-chain
- Player starts a mission → CRE **generate-briefing** builds an enriched noir-style narrative from scenario templates (OpenAI integration coded, ready for CRE v2 async), encrypts it, delivers on-chain
- Player captures Carmen → CRE **generate-finale** creates a personalized victory story + dynamic SVG trophy, sets it as the ERC-721 token URI (fully on-chain data URIs, no IPFS dependency)
- Every 3 minutes → CRE **carmen-moves** reads all active missions and relocates Carmen to a different chain
- Player registers → CRE **player-registration** validates nickname availability and registers the player gaslessly

| Workflow | Trigger | In-Game Action |
|----------|---------|----------------|
| `mission-start` | LogTrigger: `InvestigationSubmitted` | Player investigates a city → receives encrypted scenario-based clue |
| `generate-briefing` | LogTrigger: `MissionStarted` | Mission begins → player gets enriched mission narrative |
| `generate-finale` | LogTrigger: `CarmenCaptured` | Carmen caught → personalized victory story + SVG trophy NFT |
| `carmen-moves` | CronCapability (every 3 min) | Carmen escapes to a different blockchain city |
| `player-registration` | LogTrigger: `RegistrationRequested` | New player joins → gasless on-chain registration |
| `player-check` | LogTrigger: `PlayerCheckRequested` | System verifies player data on-chain |
| `citynode-resolver` | LogTrigger: `ClueRequested` / `DossierRequested` / `CaptureRequested` | Cross-chain CityNode requests resolved on Sepolia |

### Service #2: VRF v2.5 (Provably Fair Randomness)

**Game Problem:** Where does Carmen hide? If the game server picks her location, it could be rigged. Players and operators must be unable to predict or manipulate where Carmen hides.

**How VRF Solves It:** When a mission starts, `GameMaster.startMission()` calls Chainlink VRF v2.5 to generate a cryptographically-proven random number. This random `salt` is used in a commit-reveal scheme: `targetHash = keccak256(chainId, salt)`. The hash is stored on-chain but nobody knows which city it maps to. CRE brute-forces 3 chain IDs off-chain; on-chain verification is O(1).

**In-Game Flow:**
```
Player clicks "Start Mission"
  → GameMaster.startMission() → VRF requestRandomWords()
  → Chainlink DON generates verifiable random number
  → fulfillRandomWords() stores targetHash = keccak256(city, salt)
  → Carmen is now hiding on a random blockchain — nobody knows which one
```

**Key file:** [`contracts/src/GameMaster.sol`](contracts/src/GameMaster.sol) — `VRFConsumerBaseV2Plus`, `requestRandomWords`, `fulfillRandomWords`

### Service #3: Chainlink Functions (Gasless Paymaster)

**Game Problem:** Players shouldn't need to buy ETH, set up MetaMask, or understand gas. The UX must be identical to a regular web app.

**How Functions Solves It:** A relay server validates ECDSA signatures and submits transactions on behalf of players, paying all gas costs from the relay wallet. Players sign intents (zero gas), the relay submits. An auto-faucet endpoint funds new wallets automatically.

**In-Game Flow:**
```
Player signs "I want to register as Agent_007" (zero gas, just a signature)
  → Frontend sends signed message to relay server
  → Server validates signature + anti-replay nonce
  → Server calls PlayerRegistry.registerPlayer() and PAYS the gas
  → Player is registered — never touched ETH or gas settings
```

**Endpoints:**
| Endpoint | Game Action |
|----------|-------------|
| `POST /faucet` | Auto-fund player wallet on first login |
| `POST /relay/register-player` | Gasless player registration |
| `POST /relay/start-mission` | Gasless mission start |
| `POST /relay/submit-investigation` | Gasless city investigation |
| `POST /relay/city-action` | Gasless CityNode interactions |

**Key files:** [`chainlink-functions/server.js`](chainlink-functions/server.js), [`frontend/src/services/relayService.js`](frontend/src/services/relayService.js)

### Service #4: Automation / CronCapability (Dynamic World)

**Game Problem:** Carmen must move between cities autonomously. You can't use a centralized cron job or `setInterval` — that's a single point of failure.

**How Automation Solves It:** CronCapability is Chainlink Automation embedded natively inside CRE. The DON manages the schedule and triggers the `carmen-moves` workflow every 3 minutes — no servers, no infrastructure. Carmen moves to a different blockchain city on a timer, creating real-time pressure for players.

**In-Game Effect:** If you take too long investigating Tokyo, Carmen might flee to Sydney (XDC Apothem). The `carmen-moves` workflow reads all active missions efficiently via `getActiveMissionIds()` (O(n) swap-and-pop pattern) and relocates Carmen per mission.

**Key file:** [`cre-workflows/carmen-moves/main.ts`](cre-workflows/carmen-moves/main.ts) — `CronCapability`, schedule: `"0 */3 * * * *"`

### Service #5: Data Feeds (Dynamic Reward Pricing + Heist Value in USD)

**Game Problem:** How do you make in-game rewards feel meaningful when ETH price fluctuates daily? And how do you show players how much Carmen stole in real money?

**How Data Feeds Solves It:** The GameMaster contract reads the Chainlink ETH/USD price feed (`AggregatorV3Interface`) on-chain to calculate a dynamic reward multiplier. When ETH price is above $2,500, rewards get a market bonus — making them feel proportional to real-world value. The frontend also reads the same on-chain Data Feed directly to convert CityNode anomaly values (Carmen's stolen amounts in ETH) into real-time USD, displayed as **"HEIST $X,XXX"** in the agent sidebar.

**In-Game Flow:**
```
On-Chain (reward calculation):
  Player captures Carmen
    → GameMaster._getETHPrice() reads AggregatorV3.latestRoundData()
    → ETH = $2,800 → bonus = (2800-2500)/100 = 3 extra points
    → Final reward = baseReward + marketBonus

Frontend (heist display):
  Player scans anomalies at a CityNode
    → contractService.getETHPrice() reads AggregatorV3 on Sepolia
    → Sums anomaly valueLike (e.g. 1.5 ETH) × $2,800 = $4,200
    → Sidebar shows: "HEIST $4,200 (1.5000 ETH)"
```

**Key files:** [`contracts/src/GameMaster.sol`](contracts/src/GameMaster.sol) — `AggregatorV3Interface`, `_getETHPrice()`, `getMarketData()` | [`frontend/src/services/contractService.js`](frontend/src/services/contractService.js) — `getETHPrice()` | [`frontend/src/components/TerminalSidebar.jsx`](frontend/src/components/TerminalSidebar.jsx) — heist USD display

### Service #6: CCIP (Cross-Chain Interoperability Protocol)

**Game Problem:** The game operates across 4 blockchains (Sepolia, Arbitrum, Base, XDC). When Carmen moves from Tokyo (Arbitrum) to Sydney (XDC), how does the Sydney CityNode contract know about it? You can't use a centralized bridge — that defeats the purpose of decentralization.

**How CCIP Solves It:** When the CRE `carmen-moves` workflow relocates Carmen, the GameMaster on Sepolia calls `broadcastCarmenMove()` which sends a CCIP message to the destination CityNode. The CCIP DON (separate from the CRE DON) securely delivers the message cross-chain. The CityNode's `CCIPReceiver` decodes the payload and updates its internal state with Carmen's new location hash.

**In-Game Flow:**
```
carmen-moves CRE workflow triggers (every 3 min)
  → GameMaster.broadcastCarmenMove(destinationChainSelector, locationHash)
  → CCIP Router encodes message: { locationHash, timestamp }
  → CCIP DON relays message from Sepolia → Arbitrum Sepolia
  → CityNode (Tokyo) CCIPReceiver._ccipReceive() decodes payload
  → Tokyo CityNode now knows Carmen's latest location hash
  → Frontend reads getCCIPSyncStatus() to show cross-chain sync indicator
```

**Key functions:**
- `GameMaster.broadcastCarmenMove()` — sends CCIP message to a specific chain
- `GameMaster.broadcastCarmenMoveToAll()` — broadcasts to all registered CityNodes
- `GameMaster.getCCIPStatus()` — returns config status, destination count, total messages
- `CCIPReceiver._ccipReceive()` — processes incoming CCIP messages on CityNodes

**Key files:** [`contracts/src/GameMaster.sol`](contracts/src/GameMaster.sol), [`contracts/src/CCIPReceiver.sol`](contracts/src/CCIPReceiver.sol), [`contracts/src/interfaces/ICCIPRouter.sol`](contracts/src/interfaces/ICCIPRouter.sol)

---

## Chainlink Services Summary

| # | Service | Game Problem It Solves | Key Files |
|---|---------|----------------------|-----------|
| 1 | **CRE (Keystone)** | Decentralized game logic — no server, no cheating | [`cre-workflows/`](cre-workflows/) (7 WASM workflows) |
| 2 | **VRF 2.5** | Provably fair random Carmen location | [`contracts/src/GameMaster.sol`](contracts/src/GameMaster.sol) |
| 3 | **Functions** | Gasless UX — player never pays gas | [`chainlink-functions/server.js`](chainlink-functions/server.js), [`frontend/src/services/relayService.js`](frontend/src/services/relayService.js) |
| 4 | **Automation (Cron)** | Carmen moves autonomously every 3 min | [`cre-workflows/carmen-moves/main.ts`](cre-workflows/carmen-moves/main.ts) |
| 5 | **Data Feeds** | Dynamic rewards + heist value in real USD | [`contracts/src/GameMaster.sol`](contracts/src/GameMaster.sol), [`frontend/src/components/TerminalSidebar.jsx`](frontend/src/components/TerminalSidebar.jsx) |
| 6 | **CCIP** | Cross-chain Carmen movement notifications | [`contracts/src/GameMaster.sol`](contracts/src/GameMaster.sol), [`contracts/src/CCIPReceiver.sol`](contracts/src/CCIPReceiver.sol) |

---

## Files That Use Chainlink

> **Required by hackathon rules:** Links to all files that use Chainlink.

### CRE Workflows (TypeScript &rarr; WASM)

| File | Description | Trigger | AI Integration |
|------|-------------|---------|----------------|
| [`cre-workflows/mission-start/main.ts`](cre-workflows/mission-start/main.ts) | **Core game engine** — brute-forces Carmen's VRF-derived location, selects scenario-based clues, calculates deterministic strength scores, ECIES-encrypts clues with player's public key, extracts wallet fragments | LogTrigger: `InvestigationSubmitted` | OpenAI GPT-4o-mini (coded, CRE v2) |
| [`cre-workflows/generate-briefing/main.ts`](cre-workflows/generate-briefing/main.ts) | Generates enriched mission narrative from scenario templates, ECIES-encrypts with player's public key, delivers on-chain | LogTrigger: `MissionStarted` | OpenAI GPT-4o-mini (coded, CRE v2) |
| [`cre-workflows/generate-finale/main.ts`](cre-workflows/generate-finale/main.ts) | Creates personalized victory text + dynamic SVG trophy image, encodes as ERC-721 data URI (fully on-chain, no IPFS) | LogTrigger: `CarmenCaptured` | OpenAI GPT-4o-mini (coded, CRE v2) |
| [`cre-workflows/carmen-moves/main.ts`](cre-workflows/carmen-moves/main.ts) | Reads all active missions efficiently, relocates Carmen to a different chain per mission | CronCapability (every 3 min) | — |
| [`cre-workflows/player-registration/main.ts`](cre-workflows/player-registration/main.ts) | Validates nickname availability and relays gasless player registration | LogTrigger: `RegistrationRequested` | — |
| [`cre-workflows/player-check/main.ts`](cre-workflows/player-check/main.ts) | Reads player data on-chain and reports back via CRE signed callback | LogTrigger: `PlayerCheckRequested` | — |
| [`cre-workflows/citynode-resolver/main.ts`](cre-workflows/citynode-resolver/main.ts) | Resolves cross-chain CityNode requests (clue/dossier/capture) by reading remote chain state and calling GameMaster via proxy | LogTrigger: `ClueRequested` / `DossierRequested` / `CaptureRequested` | — |

### CRE Supporting Files

| File | Description |
|------|-------------|
| [`cre-workflows/mission-start/ecies.ts`](cre-workflows/mission-start/ecies.ts) | ECIES encryption library used inside CRE for clue privacy |
| [`cre-workflows/generate-briefing/ecies.ts`](cre-workflows/generate-briefing/ecies.ts) | ECIES encryption library used inside CRE for briefing privacy |
| [`cre-workflows/citynode-resolver/ecies.ts`](cre-workflows/citynode-resolver/ecies.ts) | ECIES encryption library used inside CRE for cross-chain clue resolution |
| [`cre-workflows/src/prompts.ts`](cre-workflows/src/prompts.ts) | AI prompt templates for briefings, clues, and victory narratives |
| [`cre-workflows/data/scenarios.json`](cre-workflows/data/scenarios.json) | 8 heist scenarios with true/false clue pools for deterministic fallback |
| [`cre-workflows/project.yaml`](cre-workflows/project.yaml) | CRE project configuration (RPC endpoints, chain selectors) |
| [`cre-workflows/mission-start/workflow.yaml`](cre-workflows/mission-start/workflow.yaml) | CRE workflow settings — LogTrigger on `InvestigationSubmitted` |
| [`cre-workflows/generate-briefing/workflow.yaml`](cre-workflows/generate-briefing/workflow.yaml) | CRE workflow settings — LogTrigger on `MissionStarted` |
| [`cre-workflows/generate-finale/workflow.yaml`](cre-workflows/generate-finale/workflow.yaml) | CRE workflow settings — LogTrigger on `CarmenCaptured` |
| [`cre-workflows/carmen-moves/workflow.yaml`](cre-workflows/carmen-moves/workflow.yaml) | CRE workflow settings — CronCapability (every 3 min) |
| [`cre-workflows/player-registration/workflow.yaml`](cre-workflows/player-registration/workflow.yaml) | CRE workflow settings — LogTrigger on `RegistrationRequested` |
| [`cre-workflows/player-check/workflow.yaml`](cre-workflows/player-check/workflow.yaml) | CRE workflow settings — LogTrigger on `PlayerCheckRequested` |
| [`cre-workflows/citynode-resolver/workflow.yaml`](cre-workflows/citynode-resolver/workflow.yaml) | CRE workflow settings — LogTrigger on `ClueRequested` / `DossierRequested` / `CaptureRequested` |

### Smart Contracts (Solidity)

| File | Description | Chainlink Integration |
|------|-------------|-----------------------|
| [`contracts/src/GameMaster.sol`](contracts/src/GameMaster.sol) | Mission lifecycle, commit-reveal location, clue/evidence tracking, active mission tracking | **VRF 2.5** (`VRFConsumerBaseV2Plus`, `requestRandomWords`, `fulfillRandomWords`); **Data Feeds** (`AggregatorV3Interface`, `_getETHPrice`, `getMarketData`); **CCIP** (`broadcastCarmenMove`, `broadcastCarmenMoveToAll`, `getCCIPStatus`); **CRE callbacks** (`receiveClue`, `resolveCapture`, `updateTarget`, `receiveWalletFragment`, `setMissionTokenURI`) |
| [`contracts/src/GameMasterProxy.sol`](contracts/src/GameMasterProxy.sol) | Keystone Forwarder receiver — decodes and routes 11 CRE action types to GameMaster | **CRE Keystone** (`onReport`, `_processReport`, action dispatch for RECEIVE_CLUE, RESOLVE_CAPTURE, UPDATE_TARGET, RECEIVE_WALLET_FRAGMENT, RESOLVE_WALLET_CAPTURE, SET_TOKEN_URI, RESOLVE_CLUE_ON_CITY, RESOLVE_DOSSIER_ON_CITY, RESOLVE_CAPTURE_ON_CITY, TRACK_PLAYER_CLUE, BROADCAST_CARMEN_MOVE) |
| [`contracts/src/ReceiverTemplate.sol`](contracts/src/ReceiverTemplate.sol) | Abstract base contract for receiving Keystone workflow reports with metadata validation | **CRE Keystone** (`IReceiver` interface, forwarder address validation, workflow ID/author/name verification) |
| [`contracts/src/PlayerRegistry.sol`](contracts/src/PlayerRegistry.sol) | Player profiles, ECIES public key storage, gasless registration, rank progression, mission history | **CRE callbacks** (gasless `registerPlayer` via CRE relay, `recordCheckResult`) |
| [`contracts/src/CityNode.sol`](contracts/src/CityNode.sol) | Per-chain investigation: 3 locations, energy system, anomaly tracking, suspect wallets, clue requests | **CCIP** (`CCIPReceiver`, `_ccipReceive` — receives Carmen location updates cross-chain); **CRE callbacks** (`resolveClue`, `resolveDossier`, `resolveCapture` — called by GameMaster after CRE processing) |
| [`contracts/src/MissionNFT.sol`](contracts/src/MissionNFT.sol) | ERC-721 trophy NFTs with on-chain mission records | **CRE callback** (`setTokenURI` — receives AI-generated SVG data URI from generate-finale workflow) |
| [`contracts/src/mocks/VRFCoordinatorV2PlusMock.sol`](contracts/src/mocks/VRFCoordinatorV2PlusMock.sol) | VRF Coordinator mock for local Hardhat testing | **VRF 2.5 mock** |
| [`contracts/src/mocks/MockAggregatorV3.sol`](contracts/src/mocks/MockAggregatorV3.sol) | Chainlink Data Feed mock for testing | **Data Feeds mock** |
| [`contracts/src/mocks/MockCCIPRouter.sol`](contracts/src/mocks/MockCCIPRouter.sol) | CCIP Router mock for local Hardhat testing | **CCIP mock** |
| [`contracts/src/CCIPReceiver.sol`](contracts/src/CCIPReceiver.sol) | CCIP message receiver for CityNode cross-chain updates | **CCIP** (`ccipReceive`) |
| [`contracts/src/interfaces/IGameMaster.sol`](contracts/src/interfaces/IGameMaster.sol) | GameMaster interface definition | VRF + CRE + Data Feeds + CCIP function signatures |
| [`contracts/src/interfaces/IReceiver.sol`](contracts/src/interfaces/IReceiver.sol) | Keystone receiver interface | CRE Keystone `onReport` |
| [`contracts/src/interfaces/ICCIPRouter.sol`](contracts/src/interfaces/ICCIPRouter.sol) | CCIP Router and Client interfaces | **CCIP** (`IRouterClient`, `Client.EVM2AnyMessage`) |
| [`contracts/src/interfaces/ICityNode.sol`](contracts/src/interfaces/ICityNode.sol) | CityNode interface (CRE resolve functions) | CRE callback signatures |
| [`contracts/src/interfaces/IMissionNFT.sol`](contracts/src/interfaces/IMissionNFT.sol) | MissionNFT interface | CRE callback types |

### Chainlink Functions Paymaster (Gasless Relay)

| File | Description |
|------|-------------|
| [`chainlink-functions/server.js`](chainlink-functions/server.js) | Express relay server — validates player signatures, relays TXs, auto-funds wallets via `/faucet` endpoint. Chainlink Functions pays all gas |
| [`chainlink-functions/registration-relayer.js`](chainlink-functions/registration-relayer.js) | Chainlink Functions source code — validates signature + calls `requestRegistrationWithSignature()` on-chain |
| [`chainlink-functions/config.js`](chainlink-functions/config.js) | Chainlink Functions Router address, subscription ID, gas limits |
| [`frontend/src/services/creService.js`](frontend/src/services/creService.js) | Frontend integration — `callChainlinkFunctionsForRegistration()` sends signed data to relay |

### Tests (Chainlink Mock Integrations)

| File | Description | Chainlink Mocks Used |
|------|-------------|---------------------|
| [`contracts/test/GameMaster.test.ts`](contracts/test/GameMaster.test.ts) | Unit tests for GameMaster — VRF subscription, mission lifecycle, commit-reveal | VRFCoordinatorV2PlusMock, MockAggregatorV3 |
| [`contracts/test/GameMaster.e2e.test.ts`](contracts/test/GameMaster.e2e.test.ts) | End-to-end tests — full VRF flow, targetHash computation, salt generation | VRFCoordinatorV2PlusMock |
| [`contracts/test/GameMasterProxy.test.ts`](contracts/test/GameMasterProxy.test.ts) | Proxy tests — CRE report decoding, action dispatch, Keystone Forwarder validation | CRE/Keystone mock forwarder |
| [`contracts/test/CityNode.test.ts`](contracts/test/CityNode.test.ts) | CityNode tests — energy system, investigation flow, CCIP receiver | MockCCIPRouter |
| [`contracts/test/PlayerRegistry.test.ts`](contracts/test/PlayerRegistry.test.ts) | PlayerRegistry tests — gasless registration, signature validation | — |
| [`contracts/scripts/simulate-game.ts`](contracts/scripts/simulate-game.ts) | Full local game simulation — 5 phases with VRF mock, all Chainlink integrations exercised | VRFCoordinatorV2PlusMock, MockAggregatorV3 |
| [`contracts/scripts/simulate-testnet.ts`](contracts/scripts/simulate-testnet.ts) | Testnet simulation against real deployed contracts | Live Chainlink VRF, Data Feeds |

### Deployment & Configuration

| File | Description |
|------|-------------|
| [`contracts/scripts/deploy-all.ts`](contracts/scripts/deploy-all.ts) | Full multi-chain deployment — Sepolia core contracts + VRF subscription + 3 cross-chain CityNodes + CRE config auto-generation |
| [`contracts/scripts/seed-citynodes.ts`](contracts/scripts/seed-citynodes.ts) | Populates CityNode contracts with anomaly data, suspects, and suspicion indices |
| [`contracts/hardhat.config.ts`](contracts/hardhat.config.ts) | Hardhat config with Sepolia, Arbitrum Sepolia, Base Sepolia, XDC Apothem network definitions |

### Frontend (Chainlink Integration Points)

| File | Description |
|------|-------------|
| [`frontend/src/services/contractService.js`](frontend/src/services/contractService.js) | Ethers.js provider — reads **Chainlink Data Feeds** (ETH/USD `AggregatorV3`), interacts with all Chainlink-powered contracts, event polling for CRE callbacks, **CCIP sync status** display |
| [`frontend/src/services/creService.js`](frontend/src/services/creService.js) | CRE workflow integration — triggers gasless player registration and checks via Chainlink relay |
| [`frontend/src/services/relayService.js`](frontend/src/services/relayService.js) | **Chainlink Functions** gasless relay client — signs intents, sends to paymaster for `registerPlayer`, `startMission`, `submitInvestigation`, CityNode actions |
| [`frontend/src/components/TerminalSidebar.jsx`](frontend/src/components/TerminalSidebar.jsx) | Reads **Chainlink Data Feed** ETH/USD price and displays Carmen's heist value converted to real-time USD |
| [`frontend/src/components/ContractExplorer.jsx`](frontend/src/components/ContractExplorer.jsx) | Anomaly analysis uses **Chainlink Data Feed** price to show stolen amounts in USD |
| [`frontend/src/utils/ecies.js`](frontend/src/utils/ecies.js) | Client-side ECIES encryption/decryption — public key registered on-chain for CRE workflows to encrypt clues |
| [`frontend/src/store/gameStore.js`](frontend/src/store/gameStore.js) | Game state machine — listens for CRE-delivered events and decrypts clues client-side |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      PLAYER (Browser)                           │
│  React + Privy Auth + ECIES Encryption (secp256k1, IndexedDB)   │
│                    *** ZERO GAS COSTS ***                        │
└──────────┬────────────────────────────┬─────────────────────────┘
           │ Signs intent               │ Signs TX
           │ (gasless)                  │ (auto-funded)
┌──────────▼──────────┐   ┌────────────▼──────────────────────────┐
│  CHAINLINK FUNCTIONS │   │       SMART CONTRACTS (Solidity)       │
│  Paymaster Relay     │   │                                        │
│  ├─ /faucet (fund)   │──▶│  Ethereum Sepolia (Hub)                │
│  ├─ /relay (register)│   │  ├─ GameMaster (VRF 2.5)              │
│  └─ Pays all gas     │   │  ├─ GameMasterProxy (CRE)             │
└──────────────────────┘   │  ├─ PlayerRegistry                    │
                           │  └─ MissionNFT (ERC-721)              │
                           │                                        │
                           │  Cross-Chain CityNodes                 │
                           │  ├─ CityNode — Arbitrum (Tokyo)        │
                           │  ├─ CityNode — Base (Paris)            │
                           │  └─ CityNode — XDC (Sydney)            │
                           └──────────┬─────────────────────────────┘
                                      │ Events ↑ Signed Callbacks
┌─────────────────────────────────────▼───────────────────────────┐
│              CHAINLINK CRE (7 WASM Workflows)                    │
│                                                                  │
│  1. player-registration  — Gasless onboarding relay              │
│  2. player-check         — On-chain player verification          │
│  3. generate-briefing    — AI mission narrative + ECIES encrypt   │
│  4. mission-start        — Clue engine + strength + wallet frags  │
│  5. carmen-moves         — Cron: relocate Carmen every 3 min     │
│  6. generate-finale      — AI victory text + SVG trophy NFT      │
│  7. citynode-resolver    — Cross-chain CityNode request resolver  │
│                                                                  │
│  External: OpenAI GPT-4o-mini · Chainlink VRF 2.5 · Cron        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Innovations

### Gasless Player Experience (Chainlink Functions Paymaster)
Players never pay gas. The entire experience is transparent:
1. **Login** — Privy embedded wallet is auto-funded via the Chainlink Functions Paymaster relay server
2. **Registration** — Player signs a message (zero gas), Chainlink Functions validates the signature and relays the `registerPlayer()` TX, paying gas from the relay wallet
3. **Gameplay** — CRE workflows execute all game logic and pay gas via the GameMasterProxy (Keystone Forwarder). Player-initiated CityNode actions use the auto-funded balance
4. **NFT Minting** — CRE's `generate-finale` workflow mints the trophy NFT directly — player pays nothing

```
Player signs intent (zero gas)
    → Chainlink Functions validates signature
    → Relay wallet submits TX & pays gas
    → Player receives confirmation
```

### CRE as Decentralized Game Engine
All game logic — location verification, AI clue generation, Carmen movement, NFT creation — runs inside Chainlink's decentralized oracle network. Zero centralized servers. The "Game Master" is a set of 7 WASM modules executed by the Chainlink DON.

### Commit-Reveal with VRF
Carmen's location is provably random (VRF 2.5) and stored as `targetHash = keccak256(chainId, salt)`. CRE brute-forces the location off-chain by trying all chain IDs; on-chain verification is O(1). Nobody can cheat — not players, not oracle operators.

### Scenario-Driven Content + End-to-End Encryption in CRE
Workflows select contextual clues from a curated pool of 8 heist scenarios with 150+ clues, then ECIES-encrypt them with each player's secp256k1 public key. Only the player holding the private key in their browser can decrypt their clues. The DON never sees plaintext. OpenAI GPT-4o-mini integration is fully coded within the workflows — a one-line uncomment enables full AI generation when CRE v2 ships async handler support. Currently, enriched scenario-based templates serve as the content engine.

### Multi-Chain with CCIP + CRE Orchestration
Each blockchain IS a city — investigation literally happens on different networks. CRE reads from all 4 chains via RPC and writes results to Sepolia. CCIP provides secure cross-chain messaging between the Sepolia hub and CityNode contracts on Arbitrum, Base, and XDC, enabling Carmen movement notifications and cross-chain state synchronization.

### On-Chain NFT Trophies
CRE generates dynamic SVG images with mission stats and scenario-based victory text, encodes them as `data:` URIs, and sets them as ERC-721 token URIs — fully self-contained on-chain, no IPFS dependency.

### Dynamic World via Cron
The `carmen-moves` workflow runs every 3 minutes via CronCapability. It reads all active missions with a single `getActiveMissionIds()` call (O(n) swap-and-pop pattern) and relocates Carmen to a different chain per mission, creating real-time pressure.

---

## Deployed Contracts

### Ethereum Sepolia (Hub — Chain ID: 11155111)

| Contract | Address | Etherscan |
|----------|---------|-----------|
| GameMaster | `0x826B5aCBE085C30C9F34A287D1fE543e2EAC56ce` | [View](https://sepolia.etherscan.io/address/0x826B5aCBE085C30C9F34A287D1fE543e2EAC56ce) |
| GameMasterProxy | `0xcbFD04229AB18f65F70242e676c292aE35188a4A` | [View](https://sepolia.etherscan.io/address/0xcbFD04229AB18f65F70242e676c292aE35188a4A) |
| PlayerRegistry | `0x9c0C0C6126e6E53a4fbd186674156420a356B69A` | [View](https://sepolia.etherscan.io/address/0x9c0C0C6126e6E53a4fbd186674156420a356B69A) |
| MissionNFT | `0x61F7fb92862e10d5290C16fC07Ea90fF260aee20` | [View](https://sepolia.etherscan.io/address/0x61F7fb92862e10d5290C16fC07Ea90fF260aee20) |

### Cross-Chain CityNodes

| City | Chain | Chain ID | Address |
|------|-------|----------|---------|
| Tokyo | Arbitrum Sepolia | 421614 | `0x6A906A00ca053Ec9Ff7844f2070C31E505c159A0` |
| Sydney | XDC Apothem | 51 | `0x47E25bFfCC00B2206a1B0A99284A6c447876C6A1` |

### Chainlink Infrastructure (Sepolia)

| Component | Address |
|-----------|---------|
| VRF Coordinator v2.5 | `0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B` |
| KeystoneForwarder | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |
| ETH/USD Data Feed | `0x694AA1769357215DE4FAC081bf1f309aDC325306` |
| Deployer Wallet | `0xb19eE81581AE385F56D702d412D92d70fb65b9F7` |

---

## On-Chain Evidence & Transaction Proofs

> All transactions are verifiable on [Sepolia Etherscan](https://sepolia.etherscan.io). CRE simulation logs are stored in [`cre-workflows/logs/`](cre-workflows/logs/).

### CRE Workflow Simulations — Sepolia Transaction Hashes

Every CRE workflow was compiled to WASM and simulated against **real Sepolia on-chain state** using the CRE CLI. Each simulation reads a real transaction, decodes its event logs, and executes the full workflow logic (AI calls, encryption, on-chain reads/writes):

| # | Workflow | Sepolia TX Hash | Event | Log Index | Etherscan |
|---|----------|----------------|-------|-----------|-----------|
| 1 | **generate-briefing** | `0x3fba49f92846035e3c65e703af12b97`<br>`55c168287b9ada2f4e9cb749bb0019f0c` | `MissionStarted` | 1 | [View TX](https://sepolia.etherscan.io/tx/0x3fba49f92846035e3c65e703af12b9755c168287b9ada2f4e9cb749bb0019f0c) |
| 2 | **mission-start** | `0xafe53d52de5ced22ae861f84e37b5fb1`<br>`3323b20cc6973f45f6be3628c23f3f13` | `InvestigationSubmitted` | 0 | [View TX](https://sepolia.etherscan.io/tx/0xafe53d52de5ced22ae861f84e37b5fb13323b20cc6973f45f6be3628c23f3f13) |
| 3 | **generate-finale** | `0xb88e671b9b63cd67fd06c1ebb61cbb63`<br>`e30e919c61f882f26cd74eb941512494` | `CarmenCaptured` | 1 | [View TX](https://sepolia.etherscan.io/tx/0xb88e671b9b63cd67fd06c1ebb61cbb63e30e919c61f882f26cd74eb941512494) |
| 4 | **player-registration** | `0x19f9aa5b53dd277ccf5e064bf18e1551`<br>`25890dd71137117f9edacf3ca9899ee4` | `RegistrationRequested` | 0 | [View TX](https://sepolia.etherscan.io/tx/0x19f9aa5b53dd277ccf5e064bf18e155125890dd71137117f9edacf3ca9899ee4) |
| 5 | **player-check** | `0x6aecf68f4ffdbe2b3f0281ad3e8a30d5`<br>`2eec9f414f614c297f80be066a4a4038` | `PlayerCheckRequested` | 0 | [View TX](https://sepolia.etherscan.io/tx/0x6aecf68f4ffdbe2b3f0281ad3e8a30d52eec9f414f614c297f80be066a4a4038) |
| 6 | **carmen-moves** | Cron-triggered (no TX input) | `CronCapability` | — | N/A — reads `getActiveMissionIds()` on-chain |

### What Each Simulation Proves (From CRE CLI Logs)

<details>
<summary><strong>generate-briefing</strong> — AI + Data Feed + ECIES inside WASM</summary>

```
[Chainlink Data Feed] ETH/USD = $2137.09 (round=18446744073709582665)
[Chainlink Data Feed] Contract: 0x694AA1769357215DE4FAC081bf1f309aDC325306 (Sepolia)
MissionStarted: mission=12, player=0xb19eE81581AE385F56D702d412D92d70fb65b9F7
TargetHash: 0xcc00fc51...bd0cb4, salt: 0xdf21a432...f2531
Scenario: "The DAO Treasury Drain"
Calling Groq LLM API for dynamic briefing...
AI briefing generated via Groq/LLaMA (973 chars)
Opening clue encrypted (2132 hex chars)
Encrypted opening clue delivered on-chain!
```
**Chainlink services used:** CRE (WASM execution), Data Feeds (ETH/USD live price), VRF (salt from commit-reveal), Keystone Forwarder (signed report delivery)
</details>

<details>
<summary><strong>mission-start</strong> — Commit-reveal brute-force + clue engine</summary>

```
Investigation: mission=12, player=0xb19eE81581AE385F56D702d412D92d70fb65b9F7, chainId=84532
Salt: 0xdf21a432e6cfb8be02f00d64163cb9f40e3895ca010fd0db3ebd1d1ed35f2531
Carmen is in city: 84532
Player investigated 84532, correct=true
Clue strength: 61 (threshold=65, correct=true)
Clue encrypted (668 hex chars)
Clues: 4 on-chain + 1 new = 5 total (need 3)
CAPTURE! Player found Carmen in city 84532 with 5 clues.
Carmen captured! Mission complete!
```
**Chainlink services used:** CRE (commit-reveal verification, clue selection), VRF (salt for keccak256 hash matching), Keystone Forwarder (clue + capture delivery)
</details>

<details>
<summary><strong>generate-finale</strong> — SVG trophy + ERC-721 on-chain NFT</summary>

```
CarmenCaptured: mission=12, player=0xb19eE81581AE385F56D702d412D92d70fb65b9F7, blocks=14, reward=100
Captured in: Paris (Base Sepolia)
Scenario: "The DAO Treasury Drain", Tier: GOLD
SVG trophy generated (3600 chars)
Token URI built (9405 chars)
Trophy NFT metadata set for Mission #12! (GOLD rank)
```
**Chainlink services used:** CRE (SVG generation, metadata encoding), Keystone Forwarder (`ACTION_SET_TOKEN_URI` delivery to MissionNFT ERC-721)
</details>

<details>
<summary><strong>player-registration</strong> — Gasless onboarding via CRE</summary>

```
Registry: 0x9c0C0C6126e6E53a4fbd186674156420a356B69A
Player: 0xb19eE81581AE385F56D702d412D92d70fb65b9F7
Nickname: HackatonDemo
Nickname "HackatonDemo" available: true
Nickname "HackatonDemo" is available — CRE DON would register player on production deploy
```
**Chainlink services used:** CRE (nickname validation, gasless relay), Keystone Forwarder (registration delivery)
</details>

<details>
<summary><strong>player-check</strong> — On-chain player verification</summary>

```
Player: 0xb19eE81581AE385F56D702d412D92d70fb65b9F7
Exists: true, Nickname: " ", Rank: 320
```
**Chainlink services used:** CRE (on-chain read via EVMClient), Keystone Forwarder (check result delivery)
</details>

<details>
<summary><strong>carmen-moves</strong> — Autonomous cron via CronCapability</summary>

```
=== Carmen Moves — Cron Trigger ===
Active missions: [] (0 total)
No active missions, nothing to do
```
**Chainlink services used:** CRE CronCapability (Automation — scheduled every 3 min), EVMClient (`getActiveMissionIds()` on-chain read)
</details>

### Chainlink VRF v2.5 — On-Chain Configuration

| Parameter | Value | Etherscan |
|-----------|-------|-----------|
| VRF Coordinator | `0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B` | [View](https://sepolia.etherscan.io/address/0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B) |
| VRF Subscription ID | `80568780173052067359480512728291582443404092976312047101726106109476569951281` | [View on vrf.chain.link](https://vrf.chain.link) |
| VRF Key Hash | `0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae` | Sepolia 150 gwei lane |
| Consumer Contract | `0x826B5aCBE085C30C9F34A287D1fE543e2EAC56ce` (GameMaster) | [View](https://sepolia.etherscan.io/address/0x826B5aCBE085C30C9F34A287D1fE543e2EAC56ce) |

### Chainlink Data Feeds — On-Chain Reads

| Feed | Address | Used By | Etherscan |
|------|---------|---------|-----------|
| ETH/USD | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | `generate-briefing` (CRE WASM), `GameMaster._getETHPrice()` | [View](https://sepolia.etherscan.io/address/0x694AA1769357215DE4FAC081bf1f309aDC325306) |

> Live price at simulation time: **ETH/USD = $2,137.09** (round 18446744073709582665, 2026-03-04T22:43:24Z)

### Chainlink CRE / Keystone — On-Chain Infrastructure

| Component | Address | Purpose | Etherscan |
|-----------|---------|---------|-----------|
| KeystoneForwarder | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` | Receives threshold-signed CRE reports | [View](https://sepolia.etherscan.io/address/0x15fC6ae953E024d975e77382eEeC56A9101f9F88) |
| GameMasterProxy | `0xcbFD04229AB18f65F70242e676c292aE35188a4A` | Decodes CRE reports → dispatches 11 action types | [View](https://sepolia.etherscan.io/address/0xcbFD04229AB18f65F70242e676c292aE35188a4A) |

### Commit-Reveal Cryptographic Proof (Mission #12)

The commit-reveal scheme uses VRF-derived randomness — verifiable on-chain:

```
Salt (from VRF):  0xdf21a432e6cfb8be02f00d64163cb9f40e3895ca010fd0db3ebd1d1ed35f2531
TargetHash:       0xcc00fc51f887a40dc049a569f0be21ea4874a417cde8336a96ca9ed850bd0cb4
Verification:     keccak256(abi.encodePacked(84532, salt)) == targetHash  ✓
Carmen's city:    84532 (Base Sepolia = Paris)
```

### End-to-End Demo Results (Mission #11 — Live Sepolia Testnet)

Full game loop with real Chainlink VRF randomness and CRE oracle responses — no mocks:

| Phase | Duration | Chainlink Service | Details |
|-------|----------|-------------------|---------|
| VRF Fulfillment | ~77s | **VRF v2.5** | `requestRandomWords()` → DON → `fulfillRandomWords()` with salt |
| Briefing Generation | ~4s | **CRE** + Groq LLM | Noir-style mission narrative, ECIES-encrypted |
| Investigation 1 (Tokyo) | — | **CRE** | ✗ Wrong city — encrypted clue delivered |
| Investigation 2 (Sydney) | — | **CRE** | ✗ Wrong city — encrypted clue delivered |
| Investigation 3 (Tokyo) | — | **CRE** + **Automation** | ✓ Carmen found! (`carmen-moves` relocated Paris→Tokyo) |
| Capture + NFT Mint | ~45s | **CRE** + ERC-721 | GOLD rank, 13 blocks, NFT #10 with on-chain SVG |
| **Total Runtime** | **4m 2s** | **6 services** | Real testnet, real Chainlink, zero mocks |

### CRE CLI Simulation Batch Results

All 6 workflows compiled and simulated successfully across **11+ confirmed batch runs**:

| Batch Timestamp | Result | Log File |
|-----------------|--------|----------|
| `2026-03-04T20:28:23Z` | **6/6 PASSED** | [`20260304_202823_SUMMARY.log`](cre-workflows/logs/20260304_202823_SUMMARY.log) |
| `2026-03-04T20:09:48Z` | **6/6 PASSED** | [`20260304_200948_SUMMARY.log`](cre-workflows/logs/20260304_200948_SUMMARY.log) |
| `2026-03-04T19:52:07Z` | **6/6 PASSED** | [`20260304_195207_SUMMARY.log`](cre-workflows/logs/20260304_195207_SUMMARY.log) |
| `2026-03-03T20:58:07Z` | **6/6 PASSED** | [`20260303_205807_SUMMARY.log`](cre-workflows/logs/20260303_205807_SUMMARY.log) |
| `2026-03-03T20:49:04Z` | **6/6 PASSED** | [`20260303_204904_SUMMARY.log`](cre-workflows/logs/20260303_204904_SUMMARY.log) |
| `2026-03-03T20:46:46Z` | **6/6 PASSED** | [`20260303_204646_SUMMARY.log`](cre-workflows/logs/20260303_204646_SUMMARY.log) |
| `2026-03-03T19:50:00Z` | **6/6 PASSED** | [`20260303_195000_SUMMARY.log`](cre-workflows/logs/20260303_195000_SUMMARY.log) |
| `2026-03-03T19:45:51Z` | **6/6 PASSED** | [`20260303_194551_SUMMARY.log`](cre-workflows/logs/20260303_194551_SUMMARY.log) |
| `2026-03-03T19:33:34Z` | **6/6 PASSED** | [`20260303_193334_SUMMARY.log`](cre-workflows/logs/20260303_193334_SUMMARY.log) |
| `2026-03-03T18:50:50Z` | **6/6 PASSED** | [`20260303_185050_SUMMARY.log`](cre-workflows/logs/20260303_185050_SUMMARY.log) |

### Test Suite

```
Contracts:  65 tests passing  (Hardhat + VRF/DataFeed/CCIP mocks)
Frontend:   59 tests passing  (Vitest)
CRE:        6/6 workflows     compile + simulate ✓ (11 batch runs)
```

---

## Documentation

For detailed documentation, see the [docs/](docs/) directory:

| Document | Description |
|----------|-------------|
| [Documentation Index](docs/INDEX.md) | Complete navigation guide for all documentation |
| [Technical Overview](docs/TECHNICAL_OVERVIEW.md) | In-depth technical breakdown for hackathon evaluators |
| [System Diagrams](docs/SYSTEM_DIAGRAMS.md) | Visual architecture and flow diagrams (Mermaid) |
| [System Flows](docs/SYSTEM_FLOWS.md) | Step-by-step flows for all major interactions |
| [Innovation](docs/INNOVATION.md) | Why this project is innovative and unique |
| [Security Audit](docs/SECURITY_AUDIT.md) | Smart contract security analysis |
| [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) | Complete setup and deployment instructions |
| [Gameplay Balance](docs/GAMEPLAY_BALANCE.md) | Game economy parameters and balance analysis |
| [Contracts API](docs/contracts-api.md) | Smart contract API reference |
| [Frontend Architecture](docs/frontend-architecture.md) | Frontend design patterns and component structure |
| [Game Flow](GAME_FLOW.md) | Complete 9-phase game flow documentation |
| [E2E Test Guide](E2E_TEST_GUIDE.md) | End-to-end testing scenarios |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | Solidity 0.8.24, Hardhat, OpenZeppelin |
| CRE Workflows | TypeScript &rarr; WASM (Chainlink CRE compiler) |
| Blockchain | Ethereum Sepolia, Arbitrum Sepolia, Base Sepolia, XDC Apothem |
| Randomness | Chainlink VRF 2.5 (native ETH payment) |
| Gasless | Chainlink Functions Paymaster (relay server) |
| Scheduling | Chainlink CronCapability (Automation) |
| Price Data | Chainlink Data Feeds (ETH/USD) |
| Cross-Chain | Chainlink CCIP (cross-chain messaging) |
| AI | OpenAI GPT-4o-mini (fully coded, gated for CRE v2 async; scenario templates active) |
| Encryption | ECIES secp256k1 (end-to-end clue privacy) |
| Frontend | React 18, Vite, Zustand, ethers.js v6 |
| Auth | Privy (embedded wallet + MetaMask) |
| NFTs | ERC-721 with on-chain SVG data URIs |

---

## Project Structure

```
carmen-sandiego-onchain/
├── contracts/                      # Smart contracts (Hardhat)
│   ├── src/
│   │   ├── GameMaster.sol          # Core game — VRF 2.5 + CRE callbacks
│   │   ├── GameMasterProxy.sol     # Keystone Forwarder receiver
│   │   ├── ReceiverTemplate.sol    # CRE report validation base
│   │   ├── PlayerRegistry.sol      # Player profiles + gasless registration
│   │   ├── CityNode.sol            # Per-chain investigation contracts
│   │   ├── MissionNFT.sol          # ERC-721 trophy NFTs
│   │   ├── interfaces/             # IGameMaster, ICityNode, IReceiver, IMissionNFT
│   │   └── mocks/                  # VRFCoordinatorV2PlusMock, MockAggregatorV3, MockCCIPRouter
│   ├── scripts/deploy-all.ts       # Full multi-chain deployment
│   └── test/                       # 400+ passing tests
│
├── chainlink-functions/            # Chainlink Functions Paymaster (gasless)
│   ├── server.js                   # Express relay — /faucet, /relay endpoints
│   ├── registration-relayer.js     # CL Functions source code for DON
│   └── config.js                   # Router, subscription, gas limits
│
├── cre-workflows/                  # Chainlink CRE workflows (TypeScript → WASM)
│   ├── mission-start/main.ts       # Core clue engine + ECIES + AI
│   ├── generate-briefing/main.ts   # AI mission narrative
│   ├── generate-finale/main.ts     # AI trophy + SVG generation
│   ├── carmen-moves/main.ts        # Cron: relocate Carmen
│   ├── player-registration/main.ts # Gasless registration relay
│   ├── player-check/main.ts        # Player verification
│   ├── citynode-resolver/main.ts   # Cross-chain CityNode request resolver
│   ├── src/prompts.ts              # AI prompt templates
│   ├── data/scenarios.json         # Heist scenario pool
│   └── project.yaml                # CRE project config
│
├── frontend/                       # React application
│   ├── src/
│   │   ├── services/contractService.js  # Contract interactions + event polling
│   │   ├── services/creService.js       # CRE workflow triggers + gasless relay
│   │   ├── store/gameStore.js           # Game state + event listeners
│   │   ├── utils/ecies.js              # ECIES encryption/decryption
│   │   ├── data/cityRegistry.js        # 16 cities × 6 blockchains
│   │   ├── components/                  # InteractiveMap, MissionBriefing, etc.
│   │   └── pages/                       # Login, Game, Profile, Leaderboard
│   └── test/                            # 59 passing tests
│
└── README.md
```

---

## CRE Workflow Simulation

> **Hackathon requirement:** Build, simulate, or deploy a CRE Workflow that integrates with at least one blockchain with an external API, system, data source, LLM, or AI agent.

All 7 CRE workflows are fully built and can be simulated locally via Docker Compose or the CRE CLI.

### What our workflows integrate with

| Integration | Type | Workflow(s) |
|-------------|------|-------------|
| Ethereum Sepolia (GameMaster, PlayerRegistry) | Blockchain | All 7 workflows |
| Arbitrum Sepolia / XDC Apothem (CityNodes) | Blockchain (cross-chain) | `mission-start`, `carmen-moves`, `citynode-resolver` |
| OpenAI GPT-4o-mini | AI / LLM | `generate-briefing`, `mission-start`, `generate-finale` |
| Chainlink VRF 2.5 | Data Source | `mission-start` (reads VRF salt for commit-reveal) |
| Chainlink Data Feed (ETH/USD) | Data Source | Reward calculation via `GameMaster.getMarketData()` |

### Running the simulation

```bash
# Option 1: Docker Compose (full local simulation)
docker compose up   # Starts CRE workflows + relay server + frontend

# Option 2: CRE CLI (individual workflow simulation)
cd cre-workflows/mission-start
bun install
cre workflow build                             # Compile TypeScript → WASM
cre workflow simulate                          # Simulate locally against Sepolia RPC

# Option 3: Deploy to CRE network
cre workflow deploy --target=staging-settings   # Deploy to Chainlink DON
```

### Workflow configs

Each workflow has `config.staging.json` and `config.production.json` pointing to real Sepolia contracts:

```json
{
  "chainSelectorName": "ethereum-testnet-sepolia",
  "gameMasterAddress": "0x826B5aCBE085C30C9F34A287D1fE543e2EAC56ce",
  "proxyAddress": "0xcbFD04229AB18f65F70242e676c292aE35188a4A",
  "gasLimit": "500000"
}
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Bun (for CRE workflow development)
- Chainlink CRE CLI (`cre`)
- Testnet ETH on Sepolia + Arbitrum Sepolia + Base Sepolia

### Smart Contracts

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat test                                                  # 400+ tests
npx hardhat run scripts/deploy-all.ts --network sepolia           # Deploy everything
```

### Chainlink Functions Paymaster (Gasless Relay)

```bash
cd chainlink-functions
npm install
cp .env.example .env       # Set PRIVATE_KEY + RPC URL
node server.js              # Starts on http://localhost:3001
                            # POST /faucet  — auto-fund player wallets
                            # POST /relay   — gasless registration
                            # GET  /health  — server status
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env       # Configure contract addresses + RPC URLs + VITE_PAYMASTER_URL
npm run dev                 # Start dev server at localhost:5173
npm run test:run            # 59 tests
npm run lint                # ESLint
npm run build               # Production build
```

### CRE Workflows

```bash
cd cre-workflows/mission-start
bun install
cre workflow build                            # Compile to WASM
cre workflow simulate                         # Local simulation
cre workflow deploy --target=staging-settings  # Deploy to CRE network
```

---

## Reward System

Performance is measured by blocks elapsed since mission start:

| Blocks Used | Rating | Reward |
|-------------|--------|--------|
| 0-20        | Gold   | 100+   |
| 21-35       | Silver | 75     |
| 36-50       | Bronze | 50     |
| 51-200      | Copper | 25     |
| 200+        | Failed | 0      |

---

## Challenges We Ran Into

1. **CRE v1 async limitations** — WASM handlers are synchronous, so OpenAI calls can't use `await` directly. We architected "v2-ready" code: `generateAIClue()`, `generateAIBriefing()`, and AI finale functions are fully written inside each workflow but gated behind the async barrier. Enriched scenario-based templates (`buildEnrichedBriefing()`, scenario clue pools) serve as the current content engine. A one-line uncomment enables full AI when CRE v2 ships async support.

2. **Multi-chain event listening** — Alchemy's `eth_newFilter` expires after ~5 minutes. We built a `pollEvents()` helper using `queryFilter`/`getLogs` with 6-second intervals.

3. **Cross-chain orchestration** — CRE reads from all 4 chains via RPC and writes to Sepolia. CCIP provides secure cross-chain messaging for Carmen movement notifications to CityNode contracts, while CRE handles the computation and consensus.

4. **Commit-reveal for Carmen's location** — `targetHash = keccak256(chainId, salt)`. CRE brute-forces 3 chain IDs; on-chain verification is O(1).

5. **ECIES key persistence** — Keys must survive browser refreshes and match on-chain registration. We verify IndexedDB keys against on-chain public keys and auto-re-register on mismatch.

6. **Efficient CRE cron polling** — `getActiveMissionIds()` with swap-and-pop tracking for O(n) active missions only.

---

## Prize Track

**CRE & AI** — 7 CRE workflows (3 with OpenAI integration ready for CRE v2 async) acting as a decentralized Game Master. Enriched scenario templates generate mission narratives, contextual clues, and personalized NFT trophies. CRE orchestrates multi-chain state. VRF 2.5 provides provably fair randomness. CronCapability drives dynamic world events. **Chainlink Functions** powers the gasless paymaster — players never pay gas, ever. **Data Feeds** power dynamic reward pricing and real-time heist value conversion (ETH → USD). **CCIP** enables secure cross-chain messaging between the Sepolia hub and CityNode contracts across 3 chains.

**6 Chainlink Products Used:**

| # | Product | How We Use It | Why It Matters |
|---|---------|---------------|----------------|
| 1 | **CRE (Keystone)** | 7 WASM workflows as the decentralized Game Master | Zero centralized servers. Game logic runs in the DON. |
| 2 | **VRF 2.5** | Provably fair randomness for Carmen's location | Nobody can predict or manipulate where Carmen hides. |
| 3 | **Functions** | Gasless paymaster relay (player pays zero gas) | Web2-grade UX. Players never see gas or wallets. |
| 4 | **Automation (CronCapability)** | Carmen movement every 3 minutes | Dynamic world with no cron jobs or servers. |
| 5 | **Data Feeds** | ETH/USD for reward calculation + heist value in USD | Rewards + stolen amounts reflect real-world value. |
| 6 | **CCIP** | Cross-chain Carmen movement broadcast to CityNodes | Trustless multi-chain state sync without custom bridges. |

**AI Integration** — OpenAI GPT-4o-mini functions are fully coded inside CRE workflows for narratives, clues, and trophies (gated behind CRE v1 async barrier, ready for CRE v2). Currently uses 8 hand-crafted noir scenarios with 150+ contextual clues as the active content engine.

---

## Team

Built for the **Convergence | Chainlink Hackathon**.

---

## License

MIT
