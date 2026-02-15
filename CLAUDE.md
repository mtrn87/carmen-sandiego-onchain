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

## Common Commands

### Smart Contracts (`contracts/`)

```bash
cd contracts
npm run compile              # Compile Solidity
npm run test                 # Run all tests (Chai + Ethers)
npm run test:coverage        # Coverage report
npx hardhat test test/GameMaster.test.ts  # Single test file
npm run deploy:all           # Full multi-chain deployment
npm run deploy:sepolia       # Deploy GameMaster only
npm run deploy:arbitrum-sepolia  # Deploy CityNode (Tokyo)
```

### Frontend (`frontend/`)

```bash
cd frontend
npm run dev        # Vite dev server
npm run build      # Production build
npm run lint       # ESLint (flat config)
npm run test       # Vitest watch mode
npm run test:run   # Vitest single run
```

### CRE Workflows (`cre-workflows/`)

Each workflow (generate-briefing, mission-start, carmen-moves) is independent TypeScript compiled to WASM. See `cre-workflows/project.yaml` for target configuration.

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
