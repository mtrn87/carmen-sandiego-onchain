# Developer Setup Guide

Step-by-step guide to set up and run Carmen Sandiego On-Chain locally.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Repository Structure](#repository-structure)
3. [Environment Variables](#environment-variables)
4. [Smart Contracts Setup](#smart-contracts-setup)
5. [Frontend Setup](#frontend-setup)
6. [CRE Workflows](#cre-workflows)
7. [Testnet Deployment](#testnet-deployment)
8. [Verification](#verification)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Version | Installation |
|------|---------|-------------|
| **Node.js** | 20+ (22 recommended) | [nodejs.org](https://nodejs.org/) |
| **npm** | 10+ (comes with Node.js) | — |
| **Bun** | Latest | `curl -fsSL https://bun.sh/install \| bash` |
| **Chainlink CRE CLI** | Latest | [CRE CLI Docs](https://docs.chain.link/cre) |
| **Git** | 2.30+ | [git-scm.com](https://git-scm.com/) |

### Testnet Requirements (for deployment)

- **Sepolia ETH** — [Sepolia Faucet](https://sepoliafaucet.com/) or [Alchemy Faucet](https://www.alchemy.com/faucets/ethereum-sepolia)
- **Arbitrum Sepolia ETH** — [Arbitrum Faucet](https://www.alchemy.com/faucets/arbitrum-sepolia)
- **Base Sepolia ETH** — [Base Faucet](https://www.alchemy.com/faucets/base-sepolia)
- **XDC Apothem XDC** — [XDC Faucet](https://faucet.apothem.network/)

> **Note:** For local development and testing, no testnet funds are needed. Hardhat tests run on a local in-memory chain.

---

## Repository Structure

The project has three independent sub-projects sharing a root `.env`:

```
carmen-sandiego-onchain/
├── .env                    # Root environment variables (shared)
├── .env.example            # Template for root env vars
├── contracts/              # Solidity smart contracts (Hardhat)
│   ├── src/                # Contract source files
│   ├── test/               # Test files (400+ tests)
│   ├── scripts/            # Deploy & utility scripts
│   └── package.json
├── frontend/               # React application (Vite)
│   ├── src/
│   ├── .env.example        # Template for frontend env vars
│   └── package.json
├── cre-workflows/          # Chainlink CRE workflows (TypeScript → WASM)
│   ├── mission-start/
│   ├── generate-briefing/
│   ├── generate-finale/
│   ├── carmen-moves/
│   ├── player-registration/
│   ├── player-check/
│   └── project.yaml
└── README.md
```

---

## Environment Variables

### Root `.env` (used by contracts and CRE workflows)

Copy `.env.example` to `.env` at the project root:

```bash
cp .env.example .env
```

| Variable | Description | Required For |
|----------|-------------|-------------|
| `SEPOLIA_RPC_URL` | Ethereum Sepolia RPC endpoint (Alchemy/Infura) | Contracts deploy, CRE |
| `ARBITRUM_SEPOLIA_RPC_URL` | Arbitrum Sepolia RPC endpoint | CityNode deploy |
| `BASE_SEPOLIA_RPC_URL` | Base Sepolia RPC endpoint | CityNode deploy |
| `XDC_APOTHEM_RPC_URL` | XDC Apothem RPC endpoint | CityNode deploy |
| `POLYGON_AMOY_RPC_URL` | Polygon Amoy RPC endpoint | CityNode deploy (future) |
| `BNB_TESTNET_RPC_URL` | BNB Testnet RPC endpoint | CityNode deploy (future) |
| `WORLDCHAIN_SEPOLIA_RPC_URL` | Worldchain Sepolia RPC endpoint | CityNode deploy (future) |
| `PRIVATE_KEY` | Deployer wallet private key (without `0x` prefix) | All deployments |
| `ETHERSCAN_API_KEY` | Etherscan API key for contract verification | Verification |
| `ARBISCAN_API_KEY` | Arbiscan API key for Arbitrum verification | Verification |
| `BASESCAN_API_KEY` | BaseScan API key for Base verification | Verification |
| `VRF_SUBSCRIPTION_ID` | Chainlink VRF v2.5 subscription ID | GameMaster deploy |
| `VRF_COORDINATOR_SEPOLIA` | VRF Coordinator contract address on Sepolia | GameMaster deploy |
| `VRF_KEY_HASH_SEPOLIA` | VRF key hash for Sepolia | GameMaster deploy |
| `KEYSTONE_FORWARDER_SEPOLIA` | Chainlink CRE KeystoneForwarder address | Proxy deploy |
| `OPENAI_API_KEY` | OpenAI API key for AI-generated content | CRE workflows (optional) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key for voice | CRE workflows (optional) |
| `PINATA_API_KEY` | Pinata IPFS API key | NFT metadata (optional) |
| `PINATA_SECRET_KEY` | Pinata IPFS secret key | NFT metadata (optional) |
| `VITE_WALLET_CONNECT_PROJECT_ID` | WalletConnect project ID | Frontend wallet connect |

### Frontend `.env` (used by Vite)

Copy `frontend/.env.example` to `frontend/.env`:

```bash
cp frontend/.env.example frontend/.env
```

| Variable | Description |
|----------|-------------|
| `VITE_GAME_MASTER_ADDRESS` | GameMaster contract address (Sepolia) |
| `VITE_GAME_MASTER_PROXY_ADDRESS` | GameMasterProxy contract address (Sepolia) |
| `VITE_MISSION_NFT_ADDRESS` | MissionNFT contract address (Sepolia) |
| `VITE_CITYNODE_ARBITRUM_SEPOLIA_ADDRESS` | CityNode address on Arbitrum Sepolia |
| `VITE_ARBITRUM_SEPOLIA_RPC_URL` | Arbitrum Sepolia RPC URL |
| `VITE_CITYNODE_BASE_SEPOLIA_ADDRESS` | CityNode address on Base Sepolia |
| `VITE_BASE_SEPOLIA_RPC_URL` | Base Sepolia RPC URL |
| `VITE_CITYNODE_XDC_APOTHEM_ADDRESS` | CityNode address on XDC Apothem |
| `VITE_XDC_APOTHEM_RPC_URL` | XDC Apothem RPC URL |
| `VITE_RELAYER_URL` | Paymaster relay server URL (default: `http://localhost:3001`) |
| `VITE_MOCK_MODE` | When `true`, CityNode functions return mock data instead of calling real contracts |

> **Tip:** The `deploy-all.ts` script auto-writes both `.env` files with deployed contract addresses after a successful deployment.

---

## Smart Contracts Setup

### Install dependencies

```bash
cd contracts
npm install
```

### Compile contracts

```bash
npm run compile
```

### Run tests (local, no .env needed)

```bash
# All tests (400+ tests)
npm run test

# Single test file
npx hardhat test test/GameMaster.test.ts

# With coverage report
npm run test:coverage
```

> Tests use local Hardhat network with mock contracts (VRF, Aggregator, CCIP Router). No testnet connection or `.env` required.

### Available npm scripts

| Script | Command | Description |
|--------|---------|-------------|
| `compile` | `hardhat compile` | Compile all Solidity contracts |
| `test` | `hardhat test` | Run all tests on local Hardhat network |
| `test:coverage` | `hardhat coverage` | Run tests with Solidity coverage report |
| `deploy:sepolia` | `hardhat run scripts/deploy-gamemaster.ts --network sepolia` | Deploy core contracts to Sepolia |
| `deploy:arbitrum-sepolia` | `hardhat run scripts/deploy-citynode.ts --network arbitrumSepolia` | Deploy CityNode to Arbitrum Sepolia |
| `deploy:base-sepolia` | `hardhat run scripts/deploy-citynode.ts --network baseSepolia` | Deploy CityNode to Base Sepolia |
| `deploy:all` | Runs all deploy scripts sequentially | Full multi-chain deployment |
| `verify` | `hardhat verify` | Verify contracts on Etherscan |
| `lint:sol` | `solhint 'src/**/*.sol'` | Lint Solidity files |

---

## Frontend Setup

### Install dependencies

```bash
cd frontend
npm install
```

### Configure environment

```bash
cp .env.example .env
```

Edit `frontend/.env` with your contract addresses and RPC URLs. For local development with mock data, set:

```env
VITE_MOCK_MODE=true
```

### Start dev server

```bash
npm run dev
# → http://localhost:5173
```

### Run tests

```bash
# Watch mode
npm run test

# Single run (CI)
npm run test:run
```

### Other commands

```bash
npm run lint       # ESLint
npm run build      # Production build
npm run preview    # Preview production build
```

---

## CRE Workflows

Chainlink CRE (Compute Runtime Environment) workflows are TypeScript compiled to WASM. Requires [Bun](https://bun.sh) and [CRE CLI](https://docs.chain.link/cre).

### Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `mission-start` | LogTrigger: `InvestigationSubmitted` | Core clue engine — brute-forces VRF hash, generates clues, ECIES-encrypts |
| `generate-briefing` | LogTrigger: `MissionStarted` | AI mission narrative, encrypted delivery |
| `generate-finale` | LogTrigger: `CarmenCaptured` | AI victory text + SVG trophy NFT |
| `carmen-moves` | CronCapability (every 3 min) | Relocates Carmen to a different chain |
| `player-registration` | LogTrigger: `RegistrationRequested` | Gasless player registration relay |
| `player-check` | LogTrigger: `PlayerCheckRequested` | On-chain player data verification |

### Build and simulate a workflow

```bash
cd cre-workflows/mission-start
bun install

# Build TypeScript → WASM
cre workflow build

# Simulate locally (requires RPC access to Sepolia)
cre workflow simulate

# Simulate with specific target
cre workflow simulate --target=staging-settings
```

### Deploy to CRE network

```bash
cd cre-workflows/mission-start
cre workflow deploy --target=staging-settings
```

### Workflow configuration

Each workflow has `config.staging.json` and `config.production.json` files pointing to deployed contract addresses:

```json
{
  "chainSelectorName": "ethereum-testnet-sepolia",
  "gameMasterAddress": "0x...",
  "proxyAddress": "0x...",
  "gasLimit": "500000"
}
```

> After running `deploy-all.ts`, these config files are auto-generated with the correct addresses.

### CRE constraints

- **No async/await** in WASM handlers (CRE v1 limitation). Use sync fallbacks and `.result()` for blocking EVM reads.
- **`@noble/*` libraries must be pinned to v1.x** — v2.x breaks CRE WASM compilation.
- Each workflow is self-contained; no cross-imports between workflows.

---

## Testnet Deployment

### Full multi-chain deployment

This deploys all contracts across 4 testnets and auto-writes `.env` files:

```bash
cd contracts

# Ensure root .env is configured with PRIVATE_KEY and RPC URLs
npm run deploy:all
```

`deploy-all.ts` will:
1. Deploy GameMaster, MissionNFT, GameMasterProxy, PlayerRegistry on **Sepolia**
2. Set up VRF subscription and add GameMaster as consumer
3. Deploy CityNode contracts on **Arbitrum Sepolia**, **Base Sepolia**, **XDC Apothem**
4. Auto-write root `.env` and `frontend/.env` with deployed addresses
5. Generate CRE workflow `config.staging.json` / `config.production.json` files

### Deploy individual chains

```bash
# Core contracts on Sepolia
npm run deploy:sepolia

# CityNode on Arbitrum Sepolia
npm run deploy:arbitrum-sepolia

# CityNode on Base Sepolia
npm run deploy:base-sepolia

# CityNode on XDC Apothem
npx hardhat run scripts/deploy-citynode.ts --network xdcApothem
```

### Post-deployment setup

```bash
# Configure CityNode connections and game parameters
npx hardhat run scripts/configure-citynodes.ts --network sepolia

# Seed CityNodes with anomaly data and suspects
npx hardhat run scripts/seed-citynodes.ts --network sepolia

# Set valid chain IDs for cross-chain gameplay
npx hardhat run scripts/update-valid-chains.ts --network sepolia
```

### Contract verification

```bash
# Verify on Etherscan (Sepolia)
npm run verify -- --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS...>

# Verify on Arbiscan
npm run verify -- --network arbitrumSepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS...>

# Verify on BaseScan
npm run verify -- --network baseSepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS...>
```

### Supported networks

| Network | Chain ID | Hardhat name | Use |
|---------|----------|-------------|-----|
| Ethereum Sepolia | 11155111 | `sepolia` | Hub (GameMaster, MissionNFT, Proxy, Registry) |
| Arbitrum Sepolia | 421614 | `arbitrumSepolia` | CityNode (Tokyo, Ottawa) |
| Base Sepolia | 84532 | `baseSepolia` | CityNode (Paris, Rome) |
| XDC Apothem | 51 | `xdcApothem` | CityNode (Sydney, Nairobi, Rio) |
| Polygon Amoy | 80002 | `polygonAmoy` | CityNode (Santiago — future) |
| BNB Testnet | 97 | `bnbTestnet` | CityNode (London — future) |
| Hardhat Local | 31337 | `localhost` | Local testing |

---

## Verification

After setup, verify everything works:

### 1. Contracts compile and tests pass

```bash
cd contracts
npm run compile && npm run test
# Expected: 400+ passing tests
```

### 2. Frontend builds successfully

```bash
cd frontend
npm run build
# Expected: Build completes with no errors
```

### 3. Frontend tests pass

```bash
cd frontend
npm run test:run
# Expected: 59+ passing tests
```

### 4. CRE workflow builds

```bash
cd cre-workflows/mission-start
bun install && cre workflow build
# Expected: WASM output generated
```

---

## Troubleshooting

### `npm install` fails in `contracts/`

**Cause:** Missing Node.js 20+ or npm version mismatch.

**Fix:**
```bash
node -v  # Must be 20+
npm -v   # Must be 10+
```

### Hardhat tests fail with "Cannot connect to network"

**Cause:** Tests should NOT require network access. If tests are trying to connect, the `.env` might be misconfigured.

**Fix:** Contract tests run on a local Hardhat network by default. Ensure you're running `npm run test` (not a testnet-specific command).

### Frontend `npm run dev` shows blank page

**Cause:** Missing or invalid environment variables.

**Fix:**
1. Ensure `frontend/.env` exists and has valid contract addresses
2. Set `VITE_MOCK_MODE=true` for local development without deployed contracts
3. Check browser console for specific errors

### `ECIES key mismatch` errors

**Cause:** Browser ECIES keys (IndexedDB) don't match on-chain registered public key. This happens when IndexedDB is cleared or a different browser is used.

**Fix:** Clear `localStorage` and `IndexedDB` storage for the app, then log in again. The app will auto-generate new keys and re-register.

### Privy wallet address mismatch

**Cause:** Privy may return an embedded wallet address different from the active MetaMask account.

**Fix:** This is handled automatically. The app uses `signer.getAddress()` as the authoritative address. If you see warnings about address mismatch, they are informational and the app will correct itself.

### `@noble/*` v2.x breaks CRE compilation

**Cause:** CRE WASM compiler is incompatible with `@noble/curves` v2+.

**Fix:** Pin all `@noble/*` packages to v1.x in CRE workflow `package.json` files:
```json
{
  "@noble/curves": "^1.8.2",
  "@noble/ciphers": "^1.2.1",
  "@noble/hashes": "^1.7.2"
}
```

### CRE workflow simulation fails

**Cause:** Missing Bun, CRE CLI, or RPC access.

**Fix:**
1. Ensure Bun is installed: `bun --version`
2. Ensure CRE CLI is installed: `cre --version`
3. Ensure `SEPOLIA_RPC_URL` in root `.env` is valid and accessible
4. Run `bun install` in the workflow directory before simulating

### `Cannot find module 'ethers'` in tests

**Cause:** Dependencies not installed.

**Fix:**
```bash
cd frontend && npm install
# or
cd contracts && npm install
```

### Transaction reverts with "Insufficient funds"

**Cause:** Deployer wallet doesn't have enough testnet ETH on the target chain.

**Fix:** Get testnet tokens from the faucets listed in [Prerequisites](#testnet-requirements-for-deployment).

### CityNode returns mock data instead of real data

**Cause:** `VITE_MOCK_MODE=true` in `frontend/.env` or `isCityNodeConfigured(chainId)` returns false.

**Fix:** Set `VITE_MOCK_MODE=false` and ensure CityNode contract addresses are configured in `frontend/.env` for each chain.

### `deploy-all.ts` fails mid-deployment

**Cause:** Insufficient funds on one of the chains or RPC timeout.

**Fix:**
1. Check balances: `npx hardhat run scripts/check-balances.ts`
2. Deploy chains individually to isolate the issue
3. The script is idempotent — re-running skips already-deployed contracts

### Scripted routes for testing

For deterministic demo/testing behavior, enable a scripted route:

```js
// In browser console
localStorage.setItem('carmen_scripted_route', 'route_a')
```

This makes clue strength, Carmen's wallet, and capture city deterministic. Use `route_a` for hackathon demos. Remove with:

```js
localStorage.removeItem('carmen_scripted_route')
```
