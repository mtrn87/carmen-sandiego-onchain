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
| `cre-workflows/` | Chainlink CRE workflows | TypeScript compiled to WASM |

## Steps to Run

### Smart Contracts (`contracts/`)

**Prerequisites:** Node.js 20+, root `.env` configured (copy `.env.example` and fill in values).

```bash
# 1. Install dependencies
cd contracts && npm install

# 2. Compile Solidity contracts
npm run compile

# 3. Run tests (local Hardhat network, no .env needed)
npm run test

# 4. Run a single test file
npx hardhat test test/GameMaster.test.ts

# 5. Generate coverage report
npm run test:coverage

# 6. Deploy to testnets (requires funded wallet + RPC URLs in root .env)
npm run deploy:sepolia             # GameMaster + MissionNFT + Proxy on Sepolia
npm run deploy:arbitrum-sepolia    # CityNode (Tokyo) on Arbitrum Sepolia
npm run deploy:base-sepolia        # CityNode (Paris) on Base Sepolia
npm run deploy:all                 # Full multi-chain deployment (all above)

# 7. Verify contracts on block explorer
npm run verify -- --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS...>
```

### Frontend (`frontend/`)

**Prerequisites:** Node.js 20+, contracts deployed, `frontend/.env` with `VITE_`-prefixed contract addresses and RPC URLs.

```bash
# 1. Install dependencies
cd frontend && npm install

# 2. Start dev server (http://localhost:5173)
npm run dev

# 3. Run linter
npm run lint

# 4. Run tests (watch mode)
npm run test

# 5. Run tests (single run, CI-friendly)
npm run test:run

# 6. Production build
npm run build

# 7. Preview production build locally
npm run preview
```

### CRE Workflows (`cre-workflows/`)

**Prerequisites:** [Bun](https://bun.sh/docs/installation) installed, [CRE CLI](https://docs.chain.link/cre) installed, root `.env` with `CRE_ETH_PRIVATE_KEY` (funded wallet required for chain-write simulation, dummy key OK otherwise).

Four independent workflows: `generate-briefing`, `mission-start`, `carmen-moves`, `generate-finale`. Each has its own `package.json`, `workflow.yaml`, and config files.

```bash
# 1. Install dependencies for a workflow
cd cre-workflows/<workflow-name> && bun install

# Example:
cd cre-workflows/generate-briefing && bun install

# 2. Simulate a workflow locally (run from cre-workflows/ root)
cd cre-workflows
cre workflow simulate ./<workflow-name> --target=staging-settings

# Example:
cre workflow simulate ./generate-briefing --target=staging-settings

# 3. Deploy a workflow to staging
cre workflow deploy ./<workflow-name> --target=staging-settings

# 4. Deploy a workflow to production
cre workflow deploy ./<workflow-name> --target=production-settings
```

**Workflow overview:**

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `generate-briefing` | `MissionStarted` event | Generates encrypted briefing clue for new mission |
| `mission-start` | `MissionStarted` event | Initializes mission parameters on CityNodes |
| `carmen-moves` | Periodic / event-driven | Moves Carmen between chains mid-mission |
| `generate-finale` | `CarmenCaptured` event | Generates AI trophy NFT metadata + image |

## Multi-Chain Architecture

```
Sepolia (11155111)           Arbitrum Sepolia (421614)
┌──────────────────┐         ┌──────────────────┐
│   GameMaster     │         │  CityNode Tokyo  │
│   MissionNFT     │         └──────────────────┘
│   GameMasterProxy│
└──────────────────┘         Base Sepolia (84532)
        │                    ┌──────────────────┐
        │  CRE oracle        │  CityNode Paris  │
        │  writes clues      └──────────────────┘
        │
        │                    XDC Apothem (51)
        │                    ┌──────────────────┐
        │                    │  CityNode London │
        └────────────────────└──────────────────┘
```

**GameMaster** (Sepolia) is the source of truth: manages missions, VRF randomness, clue storage, and player registration. **CityNode** contracts on each chain track Carmen's presence per-mission. **GameMasterProxy** manages CRE oracle address updates.

### Key Contract Patterns

- **Commit-reveal**: Carmen's location stored as hash, revealed on capture
- **`onlyCRE()` modifier**: Gates functions callable only by the KeystoneForwarder oracle
- **VRF v2.5**: GameMaster extends `VRFConsumerBaseV2Plus`; `fulfillRandomWords` callback processes randomness
- **Pausable**: Circuit breaker inherited from OpenZeppelin
- **ECIES encryption**: Clues encrypted with player's secp256k1 public key

### Game Flow

1. Player registers ECIES public key via `registerPlayer()`
2. `startMission()` → VRF request → random mission parameters
3. CRE workflow triggers on `MissionStarted` event → generates briefing → encrypts with player key → calls `receiveClueCRE()`
4. Player calls `submitInvestigation(missionId, chainId)` to investigate cities
5. CRE responds with clues per investigation
6. Player calls `captureCarmen(missionId, proof)` to win → MissionNFT minted

## Frontend Architecture

- **State**: Zustand store (`gameStore.js`) — auth, mission, player, real-time event state
- **Auth**: Privy SDK for wallet + social login
- **Contracts**: `contractService.js` wraps all ethers.js v6 calls and event listeners
- **Encryption**: `utils/ecies.js` handles key generation and clue decryption client-side using `@noble/curves`
- **Styling**: CSS Modules with cyber/neon theme (cyan `#00ffff`, glitch effects)

## CRE Workflow Constraints

- **No async/await** in WASM handlers (CRE v1 limitation) — use sync `buildEnrichedBriefing` fallback
- **`@noble/*` libraries must be pinned to v1.x** — v2.x breaks CRE WASM compilation
- Each workflow is self-contained; no cross-imports between workflows
- AI integration (OpenAI, ElevenLabs) is coded but behind async barrier until CRE v2

## Environment Variables

Root `.env.example` contains all required variables: RPC URLs for 7+ networks, wallet private key, Chainlink VRF config, CRE settings, AI API keys (OpenAI, ElevenLabs), IPFS/Pinata keys, and deployed contract addresses (auto-populated by `deploy-all.ts`).

Frontend uses `VITE_`-prefixed vars in `frontend/.env.example` for contract addresses and RPC URLs.

## Testing

- **Contracts**: Hardhat + Chai + Ethers with role-based signer testing. Tests in `contracts/test/`. Uses mock VRF coordinator.
- **Frontend**: Vitest + Testing Library (jsdom). Tests co-located in `__tests__/` directories. Setup in `frontend/src/test/setup.js`.

## Tooling

- Node.js 20+ required (22 recommended)
- Solidity source in `contracts/src/` (not default `contracts/`)
- Hardhat config uses custom paths: `sources: "src/"`, `artifacts: "artifacts/"`
- Frontend uses Vite with Web3 polyfills (`globalThis`, `process.env`) in `vite.config.js`
