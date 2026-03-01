# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Carmen Sandiego On-Chain is a decentralized mystery game built for the Chainlink Convergence Hackathon. Players track Carmen across multiple blockchains, decrypt AI-generated clues, and capture her on-chain. The system uses Chainlink VRF v2.5 for randomness, Chainlink CRE (Compute Runtime Environment) for oracle-driven game logic, and ECIES encryption for private clue delivery.

## Repository Structure

Three independent sub-projects share a root `.env`:

| Directory | Purpose | Stack |
|-----------|---------|-------|
| `contracts/` | Solidity smart contracts | Hardhat, Solidity 0.8.24, TypeChain, Ethers.js |
| `frontend/` | Game UI | React 18, Vite, Zustand, Privy Auth, Ethers.js v6 |
| `cre-workflows/` | Chainlink CRE workflows | TypeScript compiled to WASM via Bun |

## Commands

### Smart Contracts (`contracts/`)

```bash
cd contracts && npm install
npm run compile                        # compile Solidity
npm run test                           # run all tests (local Hardhat, no .env needed)
npx hardhat test test/GameMaster.test.ts  # single test file
npm run test:coverage                  # coverage report
npm run deploy:all                     # full multi-chain deployment
npm run deploy:sepolia                 # GameMaster + MissionNFT + Proxy
npm run deploy:arbitrum-sepolia        # CityNode Tokyo
npm run deploy:base-sepolia            # CityNode Paris
npm run verify -- --network sepolia <ADDRESS> <ARGS...>
```

### Frontend (`frontend/`)

```bash
cd frontend && npm install
npm run dev                            # dev server on http://localhost:5173
npm run lint                           # ESLint
npm run test                           # Vitest watch mode
npm run test:run                       # single run (CI)
npm run build                          # production build
```

### CRE Workflows (`cre-workflows/`)

Requires [Bun](https://bun.sh) and [CRE CLI](https://docs.chain.link/cre).

```bash
cd cre-workflows/<workflow-name> && bun install
cd cre-workflows
cre workflow simulate ./<workflow-name> --target=staging-settings
cre workflow deploy ./<workflow-name> --target=staging-settings
```

Four workflows: `generate-briefing`, `mission-start`, `carmen-moves`, `generate-finale`.

## Multi-Chain Architecture

```
Sepolia (11155111)           Arbitrum Sepolia (421614)
+-----------------+          +-----------------+
| GameMaster      |          | CityNode Tokyo  |
| MissionNFT      |          +-----------------+
| GameMasterProxy |
+-----------------+          Base Sepolia (84532)
       |                     +-----------------+
       | CRE oracle          | CityNode Paris  |
       | writes clues        +-----------------+
       |
       |                     XDC Apothem (51)
       |                     +-----------------+
       |                     | CityNode London |
       +---------------------+-----------------+
```

**GameMaster** (Sepolia) is the source of truth: missions, VRF randomness, clue storage, player registration. **CityNode** contracts on each chain track Carmen's presence per-mission. **GameMasterProxy** bridges CRE oracle calls to GameMaster via KeystoneForwarder.

## Contract Architecture

### Inheritance

- `GameMaster` extends `VRFConsumerBaseV2Plus` + `Pausable` + `IGameMaster`
- `GameMasterProxy` extends `ReceiverTemplate` (Chainlink KeystoneForwarder receiver)
- `MissionNFT` is ERC-721 (`"Carmen Sandiego Mission"` / `"CARMEN"`)
- `CityNode` implements `ICityNode`

### Key Constants

- `MAX_BLOCKS = 50` (mission fails after 50 blocks)
- `MAX_INVESTIGATIONS = 10` (max investigation attempts per mission)
- `EVIDENCE_THRESHOLD = 65` (clue strength > 65 counts as evidence)
- CityNode: `MAX_ENERGY = 10`, `ENERGY_REGEN_INTERVAL = 15 min`, `NUM_LOCATIONS = 3`

### VRF Commit-Reveal Flow

1. `startMission()` requests VRF randomness
2. `fulfillRandomWords()` picks target chain via `randomWords[0] % validChainIds.length`, generates `salt = keccak256(randomWords[0], missionId)`, stores `targetHash = keccak256(chainId, salt)`
3. `resolveCapture()` (CRE-only) verifies `keccak256(revealedChainId, salt) == targetHash`

### GameMasterProxy Action Codes

CRE calls `onReport()` which decodes `(uint8 action, bytes data)`:
1=receiveClue, 2=resolveCapture, 3=updateTarget, 4=receiveWalletFragment, 5=resolveWalletCapture, 6=setMissionTokenURI

### Wallet Evidence Pattern

CRE delivers 5-char fragments of Carmen's wallet via `receiveWalletFragment()`. After 3+ fragments, player can call `resolveWalletCapture()` which derives the wallet from `deriveCarmenWallet(salt) = address(uint160(keccak256(salt, "carmen-wallet")))`.

## Frontend Architecture

### App Flow

- Two routes: `/` (LoginPage) and `/game` (GamePage)
- **LoginPage**: Privy login -> extract ETH address -> generate ECIES key pair -> auto-register on-chain if needed -> `startMissionOnChain()` -> navigate to `/game`
- **GamePage**: `initGame()` loads active mission from chain -> MissionBriefing overlay blocks until dismissed -> player explores InteractiveMap or ContractExplorer

### State Management (Zustand `gameStore.js`)

The store is the central hub. Key state groups:
- **Auth**: `walletAddress`, `isConnected`, `playerNickname`
- **Mission**: `missionId`, `missionData`, `blocksElapsed`, `missionEvents[]`
- **City discovery**: `discoveredCityIds[]`, `visitedCityIds[]`, `cityTrail[]`, `discoveryScanCount`
- **Current city**: `currentCityId`, `currentChainId`, `cityLocations[]`, `cityAnomalyTxRefs[]`, `citySuspectWallets[]`
- **Evidence**: `clues[]`, `evidence[]`, `walletFragments[]`, `walletFragmentCount`, `walletCaptureAvailable` (true when >= 3 fragments)
- **UI**: `terminalLines[]` (unified log with `{ text, color, type }`), `gas` (UI-only resource, starts 100)
- **Capture**: `captureMode`, `captureState`, `captureResult`, `captureSelectedTx`

Key patterns:
- `terminalLines` is append-only log. Colors: `cyan/green/yellow/red/muted`. Types: `system/action/alert/help`.
- Event listener unsubscribers collected in `_unsubscribers[]`, cleaned on `disconnectWallet()` or `startNewMission()`.
- `_investigateTimeoutId`: 90-second safety timeout if CRE oracle never responds.
- Progress persisted to `localStorage` keys: `carmen_investigation_progress`, `carmen_game_snapshot`, `carmen_current_mission_plot`.

### `cityId` vs `chainId` Duality

This is a critical distinction throughout the codebase:
- `cityId` = unique pool ID (e.g., `80002`, `4216141`) used for registry lookups and display
- `chainId` = real blockchain chain ID (e.g., `80002`, `421614`) used for contract calls
- Multiple cities can map to the same chain
- `resolveChainId(cityId)` in contractService handles the mapping
- Always use `currentChainId` for contract calls and `currentCityId` for display

### City Discovery Algorithm

1. Home city defaults to Santiago (`id: 80002`, Polygon Amoy) unless overridden by scripted route
2. `initDiscovery()` reveals 2 additional cities using `pickRevealedCities(missionId, scanCount, excludeIds)`
3. `revealCities()` reveals up to 3 new cities after each scan, deterministic by `(missionId, discoveryScanCount)`
4. `travelToCity()` marks current city visited, prunes older visited cities from discovered list

### Contract Service (`contractService.js`)

- Singleton `_provider` / `_signer` cached; `resetConnection()` clears them on chain switch
- `getContract()` = signer-connected GameMaster; `getReadContract()` = provider-only
- `getCityNodeGameplayContract(chainId)` = read-only CityNode via `JsonRpcProvider`
- **Mock fallback**: every CityNode function checks `isCityNodeConfigured(chainId)` first; if not configured, returns mock data with simulated delay
- `buildLocationTransactions()`: generates deterministic txs using seeded RNG, injects exactly 1 Carmen tx at `carmenLocationIdx`
- CityNode async pattern: `requestClue()` sends tx -> waits for `ClueUnlocked`/`DeadEnd` event (15s timeout -> mock fallback)

### Data Layer (`frontend/src/data/`)

- **`cityRegistry.js`**: 17 cities across 6 chains. Each city has `id`, `chainId`, `name`, `coords`, `cases[]` (3 locations per city). Exports `CITY_POOL`, `CITY_POOL_MAP`, `pickRevealedCities()`.
- **`scriptedRoutes.js`**: Deterministic test routes for demos. Activated via `localStorage.setItem('carmen_scripted_route', 'route_a')`. Each route defines `homeCityId`, `path[]`, `captureCity`, `carmenWallet`. City roles: `on_path` (strong clues), `near_path` (redirect), `off_path` (dead-end).
- **`walletPool.js`**: 25 deterministic wallet addresses. `getCarmenWallet(missionId)` picks Carmen's wallet. Used by contractService for believable transaction lists.
- **`scenarios.json`**: Pre-written mission scenarios selected by `(missionId - 1) % scenarios.length`.
- **`contractData.js`**: Legacy static case data for ContractExplorer. The new gameplay uses live CityNode data via `CityView`.

### ECIES Encryption (`utils/ecies.js`)

- Key pair stored in **IndexedDB** (`carmen-sandiego` / `keys` store)
- Private key is hex string, never leaves the browser. **No recovery mechanism if browser storage is cleared.**
- Public key = 65-byte uncompressed secp256k1, sent on-chain as `bytes`
- Cipher format: `ephemeralPubKey(65) || iv(12) || ciphertext+tag`
- Dependencies: `@noble/curves`, `@noble/ciphers`, `@noble/hashes` -- **must be pinned to v1.x**

## CRE Workflow Constraints

- **No async/await** in WASM handlers (CRE v1 limitation) -- use sync fallbacks, `.result()` for blocking EVM reads
- **`@noble/*` libraries must be pinned to v1.x** -- v2.x breaks CRE WASM compilation
- Each workflow is self-contained; no cross-imports between workflows
- Each workflow has its own `ecies.ts` copy (encrypt-only, no decrypt needed server-side)
- AI integration (OpenAI, ElevenLabs) coded but behind async barrier until CRE v2

## Testing Patterns

### Contract Tests

- Signer roles: `owner`, `player`, `creOracle`, `otherUser`
- Mock VRF: owner address acts as coordinator, manual `fulfillRandomWords` calls
- Files: `GameMaster.test.ts`, `CityNode.test.ts`, `GameMasterProxy.test.ts`, `GameMaster.e2e.test.ts`

### Frontend Tests

- Vitest + Testing Library (jsdom), config in `vite.config.js`
- Setup (`src/test/setup.js`) mocks: Canvas, HTMLMediaElement, `window.ethereum` (returns Sepolia chainId), ResizeObserver
- Mock files: `src/test/mocks/contractService.js`, `src/test/mocks/indexedDB.js`
- `fake-indexeddb` package used for ECIES key storage tests
- ethers mocked with class-style constructors:
  ```js
  vi.mock('ethers', () => ({
    ethers: {
      BrowserProvider: class { constructor() { return mockProvider } },
      Contract: class { constructor() { return mockContract } },
    },
  }))
  ```

## Deployment

`deploy-all.ts` is the master deployment script. After running `npm run deploy:all`, it auto-writes:
- Root `.env` with deployed contract addresses
- `frontend/.env` with `VITE_`-prefixed addresses and RPC URLs
- All 8 CRE `config.staging.json` / `config.production.json` files

Other scripts: `deploy-citynode.ts`, `seed-case.ts`, `simulate-game.ts`, `trigger-investigation.ts`, `export-abi.ts`.

## Environment Variables

Root `.env.example`: RPC URLs (7+ networks), wallet private key, Chainlink VRF config, CRE settings, AI API keys, IPFS/Pinata keys, deployed addresses (auto-populated by deploy).

Frontend `frontend/.env.example`: `VITE_`-prefixed contract addresses and RPC URLs. CityNode env vars: `VITE_CITYNODE_TOKYO_ADDRESS` (421614), `VITE_CITYNODE_PARIS_ADDRESS` (84532), `VITE_CITYNODE_LONDON_ADDRESS` (51), plus corresponding RPC URLs with hardcoded public fallbacks.

## Tooling

- Node.js 20+ required (22 recommended)
- Solidity source in `contracts/src/` (not default `contracts/`); Hardhat artifacts in `contracts/artifacts/`
- Hardhat loads root `.env` via `dotenv({ path: '../.env' })`
- Frontend Vite config includes Web3 polyfills: `global: 'globalThis'`, `'process.env': '{}'`
- No Buffer polyfill needed (ethers v6 + `@noble/*` v1)

## Gotchas

1. **Privy address mismatch**: Privy may return an embedded wallet address different from MetaMask active account. Both LoginPage and `initGame()` detect this and use `signer.getAddress()` as authoritative.

2. **Mission starts on LoginPage**: `startMissionOnChain()` is called in LoginPage before navigating. GamePage reads the already-active mission via `initGame()`.

3. **Scripted routes for demos**: `localStorage.setItem('carmen_scripted_route', 'route_a')` makes all clue strength, Carmen's wallet, and capture city deterministic. Use `route_a` for hackathon demo.

4. **`contractData.js` is legacy**: Contains hardcoded data for the original 4-city ContractExplorer view. New gameplay uses live CityNode data. Both coexist in the codebase.

5. **CityNode clue resolution is async**: `requestClue()` emits event -> CRE resolves -> `ClueUnlocked`/`DeadEnd` fires. Frontend waits 15s then falls back to mock. This is the only async tx pattern; inspect/scan/flag are direct reads.

6. **`onReport` in GameMasterProxy is the CRE entry point**: CRE calls `ReceiverTemplate.onReport(metadata, report)` -> validates forwarder -> `_processReport(report)` -> decodes action code -> forwards to GameMaster.

7. **Active mission tracking**: `_activeMissionIds[]` + `_activeMissionIndex[]` use swap-and-pop for O(1) removal. Used by `carmen-moves` and `mission-start` CRE workflows to poll active missions.

8. **Reward tiers**: Gold (<=20 blocks), Silver (<=35), Bronze (<=50). Rank progresses per capture: Detective Rookie -> Junior -> Senior -> Chief -> Special Agent -> Master Agent.

<!-- gitnexus:start -->
# GitNexus MCP

This project is indexed by GitNexus as **carmenSandiego** (1461 symbols, 3012 relationships, 92 execution flows).

## Always Start Here

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
