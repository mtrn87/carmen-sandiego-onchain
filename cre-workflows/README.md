# CRE Workflows — Decentralized Game Engine

> 7 TypeScript workflows compiled to WASM and executed inside the Chainlink DON.
> No centralized server. No backend. The game brain lives on-chain.

**[Back to Main README](../README.md)** | **[Documentation Index](../docs/INDEX.md)**

---

## Architecture Overview

Each workflow is an independent TypeScript module that:

1. **Compiles to WASM** via the CRE CLI
2. **Deploys to a DON** (Decentralized Oracle Network)
3. **Executes in parallel** across multiple independent Chainlink nodes
4. **Reaches consensus** — all nodes must produce identical output
5. **Delivers signed reports** on-chain via KeystoneForwarder

```
On-Chain Event (Sepolia)
        |
        v
  CRE DON (N nodes)
  ┌──────────────────────────────┐
  │  WASM Workflow Execution     │
  │  ┌────────────────────────┐  │
  │  │ EVMClient.callContract │  │  <-- reads on-chain state
  │  │ HTTPClient.sendRequest │  │  <-- calls Groq LLaMA (AI)
  │  │ ECIES secp256k1        │  │  <-- encrypts for player
  │  │ keccak256 brute-force  │  │  <-- commit-reveal crack
  │  └────────────────────────┘  │
  │         |                    │
  │  Consensus (identical output)│
  │  Threshold ECDSA signature   │
  └──────────────┬───────────────┘
                 |
                 v
  GameMasterProxy.sol (verifies signature)
        |
        v
  GameMaster / PlayerRegistry / MissionNFT
```

---

## The 7 Workflows

### 1. `generate-briefing` — AI Mission Narrative

| | |
|---|---|
| **Trigger** | `MissionStarted` event (LogTrigger) |
| **CRE Capabilities** | EVMClient, HTTPClient, writeReport |
| **AI** | Groq LLaMA 3.3-70b (temperature=0 for DON consensus) |
| **Encryption** | ECIES secp256k1 (end-to-end player privacy) |
| **Data Feed** | Chainlink ETH/USD on Sepolia |

**What it does:**
When a player starts a mission, this workflow reads the mission state from on-chain, calls the Groq LLaMA API via `HTTPClient.sendRequest()` to generate a unique noir-style briefing, reads the live ETH/USD price from Chainlink Data Feed via `EVMClient.callContract()`, encrypts the briefing with the player's secp256k1 public key (ECIES), and delivers the encrypted result on-chain via a threshold-signed report.

**Key code pattern — synchronous AI inside CRE WASM:**
```typescript
// main.ts:322-355 — Groq call using CRE's blocking .result() pattern
function callGroqForBriefing(sendRequester: HTTPSendRequester, params: GroqParams): string {
  const resp = sendRequester.sendRequest({
    url: "https://api.groq.com/openai/v1/chat/completions",
    method: "POST",
    headers: { "Authorization": `Bearer ${params.apiKey}` },
    body: toBase64(JSON.stringify({
      model: params.model,
      temperature: 0,  // deterministic — required for DON consensus
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    })),
  }).result()  // blocks synchronously in CRE WASM
  return JSON.parse(new TextDecoder().decode(resp.body)).choices[0].message.content
}
```

### 2. `mission-start` — Clue Engine + Commit-Reveal

| | |
|---|---|
| **Trigger** | `InvestigationSubmitted` event (LogTrigger) |
| **CRE Capabilities** | EVMClient, writeReport |
| **Encryption** | ECIES secp256k1 |

**What it does:**
When a player investigates a city, this workflow brute-forces the VRF-derived `targetHash` to determine Carmen's actual location (`keccak256(chainId, salt) == targetHash`), selects a true or false clue from the scenario pool, calculates a deterministic strength score, encrypts the clue, and delivers it on-chain. If the player found Carmen with enough clues, it also triggers capture resolution.

**Handles two events:**
- `InvestigationSubmitted` — clue evaluation + optional wallet fragment delivery
- `WalletCaptureSubmitted` — wallet guess verification + capture resolution

### 3. `generate-finale` — AI Trophy + NFT Minting

| | |
|---|---|
| **Trigger** | `CarmenCaptured` event (LogTrigger) |
| **CRE Capabilities** | EVMClient, writeReport |
| **AI** | Groq LLaMA 3.3-70b (enriched template fallback) |
| **NFT** | On-chain SVG + ERC-721 metadata (data URI, no IPFS) |

**What it does:**
When Carmen is captured, generates a dynamic SVG trophy image with mission stats (reward tier, blocks used, city, clues collected), builds ERC-721 metadata as a base64 data URI, and sets the token URI on MissionNFT via `ACTION_SET_TOKEN_URI`. The NFT is fully self-contained — no IPFS, no external dependencies.

**Reward tiers:** GOLD (100+), SILVER (75+), BRONZE (50+), COPPER (<50)

### 4. `carmen-moves` — Autonomous Relocation (Cron)

| | |
|---|---|
| **Trigger** | `CronCapability` (every 3 minutes) |
| **CRE Capabilities** | CronCapability, EVMClient, writeReport |
| **Cross-chain** | CCIP broadcast via `ACTION_BROADCAST_CARMEN_MOVE` |

**What it does:**
Runs autonomously every 3 minutes — no external cron, no server. Reads all active mission IDs in a single on-chain call (`getActiveMissionIds()`), brute-forces each mission's `targetHash` to find Carmen's current city, picks a new city deterministically (using targetHash as entropy), computes `newTargetHash = keccak256(newCity, salt)`, and updates the on-chain hash. Also broadcasts the move to all CityNode contracts via CCIP.

**This is the "unstoppable game" proof:** even if the developer's infrastructure goes offline, Carmen still moves. The DON operates independently.

### 5. `player-registration` — Gasless Onboarding

| | |
|---|---|
| **Trigger** | `RegistrationRequested` event (LogTrigger) |
| **CRE Capabilities** | EVMClient, writeReport |
| **Contract** | PlayerRegistry |

**What it does:**
Validates nickname availability and registers the player. Combined with a relay/paymaster pattern, this creates a fully gasless onboarding experience — the player never spends a single wei.

### 6. `player-check` — Player Verification

| | |
|---|---|
| **Trigger** | `PlayerCheckRequested` event (LogTrigger) |
| **CRE Capabilities** | EVMClient, writeReport |
| **Contract** | PlayerRegistry |

**What it does:**
Reads player data (exists, nickname, rank) from PlayerRegistry and delivers a signed callback on-chain. Demonstrates CRE's "read-and-callback" pattern — trustless off-chain reads without a centralized backend.

### 7. `citynode-resolver` — Cross-Chain Request Resolution

| | |
|---|---|
| **Trigger** | `ClueRequested` / `DossierRequested` / `CaptureRequested` events |
| **CRE Capabilities** | EVMClient, writeReport |
| **Contracts** | CityNode (remote chains) -> GameMaster (Sepolia) |

**What it does:**
Listens for events from CityNode contracts on remote chains (Arbitrum Sepolia, Base Sepolia, XDC Apothem) and resolves them by calling the corresponding GameMaster functions on Ethereum Sepolia. Handles three event types:
- `ClueRequested` -> `resolveClueOnCity()` (action 7) + `trackPlayerClue()` (action 10)
- `DossierRequested` -> `resolveDossierOnCity()` (action 8)
- `CaptureRequested` -> `resolveCaptureOnCity()` (action 9)

---

## CRE Capabilities Used

| Capability | Workflows | Purpose |
|------------|-----------|---------|
| **EVMClient.callContract** | All 7 | Read on-chain state (missions, players, cities, Data Feed) |
| **HTTPClient.sendRequest** | generate-briefing, generate-finale | Call Groq LLaMA 3.3-70b for AI content generation |
| **writeReport** | All 7 | Deliver threshold-signed results on-chain via KeystoneForwarder |
| **CronCapability** | carmen-moves | Autonomous scheduled execution (every 3 min) |
| **LogTrigger** | 6 workflows | React to on-chain EVM events |
| **consensusIdenticalAggregation** | generate-briefing | Ensure AI output is identical across all DON nodes |

---

## Determinism for DON Consensus

All DON nodes must produce **identical output** for consensus. This is ensured by:

- **`temperature: 0`** on all LLM calls — deterministic AI output
- **`@noble/curves v1.x`** for ECIES — pinned because v2.x breaks CRE WASM
- **Deterministic ECIES**: ephemeral key derived from VRF salt via HKDF (no randomness in WASM)
- **Scenario-based clue pools** with deterministic strength scoring from salt entropy
- **All randomness from VRF salt** — on-chain, verifiable, same for all nodes

---

## Prerequisites

- [Bun](https://bun.sh/docs/installation) — package manager and runtime
- [CRE CLI](https://docs.chain.link/cre) — `cre` command
- `.env` at cre-workflows root with `CRE_ETH_PRIVATE_KEY` (dummy key OK for simulation)

---

## Setup

Each workflow is self-contained with its own `package.json`:

```bash
cd cre-workflows

# Install dependencies for each workflow
for dir in generate-briefing mission-start generate-finale carmen-moves player-registration player-check citynode-resolver; do
  (cd $dir && bun install)
done
```

---

## Simulation

### Single Workflow

```bash
# From cre-workflows/ directory
cre workflow simulate ./generate-briefing -T staging-settings -e .env --non-interactive \
  --trigger-index 0 --evm-tx-hash 0x3fba49f92846035e3c65e703af12b9755c168287b9ada2f4e9cb749bb0019f0c --evm-event-index 1

cre workflow simulate ./mission-start -T staging-settings -e .env --non-interactive \
  --trigger-index 0 --evm-tx-hash 0xafe53d52de5ced22ae861f84e37b5fb13323b20cc6973f45f6be3628c23f3f13 --evm-event-index 0

cre workflow simulate ./generate-finale -T staging-settings -e .env --non-interactive \
  --trigger-index 0 --evm-tx-hash 0xb88e671b9b63cd67fd06c1ebb61cbb63e30e919c61f882f26cd74eb941512494 --evm-event-index 1

cre workflow simulate ./carmen-moves -T staging-settings -e .env --non-interactive \
  --trigger-index 0

cre workflow simulate ./player-registration -T staging-settings -e .env --non-interactive \
  --trigger-index 0 --evm-tx-hash 0x19f9aa5b53dd277ccf5e064bf18e155125890dd71137117f9edacf3ca9899ee4 --evm-event-index 0

cre workflow simulate ./player-check -T staging-settings -e .env --non-interactive \
  --trigger-index 0 --evm-tx-hash 0x6aecf68f4ffdbe2b3f0281ad3e8a30d52eec9f414f614c297f80be066a4a4038 --evm-event-index 0
```

### All Workflows (Batch)

```bash
bash simulate-all.sh
```

Runs all 6 simulated workflows, saves timestamped logs to `logs/`, and prints a summary.

### Simulation Results (10 Consecutive Runs)

All workflows compiled to WASM and simulated successfully:

| Date | Result | Log |
|------|--------|-----|
| Mar 4, 20:28 | 6/6 PASSED | [SUMMARY](logs/20260304_202823_SUMMARY.log) |
| Mar 4, 20:09 | 6/6 PASSED | [SUMMARY](logs/20260304_200948_SUMMARY.log) |
| Mar 4, 19:52 | 6/6 PASSED | [SUMMARY](logs/20260304_195207_SUMMARY.log) |
| Mar 3, 20:58 | 6/6 PASSED | [SUMMARY](logs/20260303_205807_SUMMARY.log) |
| Mar 3, 20:49 | 6/6 PASSED | [SUMMARY](logs/20260303_204904_SUMMARY.log) |

---

## Transaction Hashes (Sepolia)

These real Sepolia transactions are used as simulation inputs:

| Workflow | TX Hash | Event |
|----------|---------|-------|
| generate-briefing | [`0x3fba49...019f0c`](https://sepolia.etherscan.io/tx/0x3fba49f92846035e3c65e703af12b9755c168287b9ada2f4e9cb749bb0019f0c) | MissionStarted (log idx 1) |
| mission-start | [`0xafe53d...3f3f13`](https://sepolia.etherscan.io/tx/0xafe53d52de5ced22ae861f84e37b5fb13323b20cc6973f45f6be3628c23f3f13) | InvestigationSubmitted (log idx 0) |
| generate-finale | [`0xb88e67...512494`](https://sepolia.etherscan.io/tx/0xb88e671b9b63cd67fd06c1ebb61cbb63e30e919c61f882f26cd74eb941512494) | CarmenCaptured (log idx 1) |
| player-registration | [`0x19f9aa...99ee4`](https://sepolia.etherscan.io/tx/0x19f9aa5b53dd277ccf5e064bf18e155125890dd71137117f9edacf3ca9899ee4) | RegistrationRequested (log idx 0) |
| player-check | [`0x6aecf6...a4038`](https://sepolia.etherscan.io/tx/0x6aecf68f4ffdbe2b3f0281ad3e8a30d52eec9f414f614c297f80be066a4a4038) | PlayerCheckRequested (log idx 0) |
| carmen-moves | N/A (Cron trigger) | CronCapability — reads getActiveMissionIds() |

---

## Deploy

```bash
# Deploy to staging (requires CRE early access)
cre workflow deploy ./generate-briefing -T staging-settings

# Deploy to production
cre workflow deploy ./generate-briefing -T production-settings
```

> CRE deploy requires early access — request at https://cre.chain.link/request-access

---

## Configuration

### `project.yaml` (root)

Shared RPC endpoints for all workflows:

```yaml
staging-settings:
  rpcs:
    - chain-name: ethereum-testnet-sepolia
      url: https://ethereum-sepolia-rpc.publicnode.com
```

### `workflow.yaml` (per workflow)

Workflow name and artifact paths:

```yaml
staging-settings:
  user-workflow:
    workflow-name: "carmen-briefing-staging"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path: "./config.staging.json"
    secrets-path: ""
```

### `config.staging.json` (per workflow)

Runtime parameters — contract addresses, gas limits, API keys:

```json
{
  "chainSelectorName": "ethereum-testnet-sepolia",
  "gameMasterAddress": "0x826B5aCBE085C30C9F34A287D1fE543e2EAC56ce",
  "proxyAddress": "0xcbFD04229AB18f65F70242e676c292aE35188a4A",
  "gasLimit": "500000",
  "openaiApiKey": "YOUR_GROQ_API_KEY",
  "openaiModel": "llama-3.3-70b-versatile"
}
```

### `secrets.yaml` (root)

Shared secrets referenced via `secrets-path` in `workflow.yaml`.

---

## CRE Gotchas & Lessons Learned

These issues are undocumented in the CRE docs. We discovered them through trial and error:

| Issue | Solution |
|-------|----------|
| `@noble/curves v2.x` crashes WASM compiler | Pin to v1.x (`curves@1.8.2`, `ciphers@1.2.1`, `hashes@1.7.2`) |
| `evmClient.readContract` doesn't exist | Use `evmClient.callContract(runtime, { call: encodeCallMsg({...}), blockNumber: LATEST_BLOCK_NUMBER }).result().data` |
| `evmClient.writeContract` doesn't exist | Use `writeReport()` — CRE only writes via signed reports |
| Named tuples in `parseAbi` crash WASM | Use unnamed tuples: `(address,string,...)` not `tuple(address wallet,...)` |
| `export { fn1, fn2 }` breaks build | Only `export async function main()` is allowed |
| `btoa()` unavailable in Javy/WASM | Implement custom Base64 encoder (see `toBase64()`) |
| Cross-workflow imports fail | Each workflow must be self-contained (e.g., duplicate `ecies.ts`) |
| CRE bundler resolves from workflow folder | `node_modules` must be inside each workflow directory |
| No randomness in WASM | ECIES ephemeral key derived deterministically from VRF salt via HKDF |
| AI must be deterministic | `temperature: 0` on all LLM calls for DON consensus |

---

## Project Structure

```
cre-workflows/
  project.yaml                  # Shared RPC configuration
  secrets.yaml                  # Shared secrets
  simulate-all.sh               # Batch simulation runner
  logs/                         # Timestamped simulation evidence
  data/
    scenarios.json              # Game scenarios (clue pools, city data)
  src/
    prompts.ts                  # AI prompt templates
    tts.ts                      # Text-to-speech integration (future)
  scripts/
    generate-ai-clues.ts        # Offline AI clue generation tool
  generate-briefing/            # Workflow 1: AI briefing + Data Feed + ECIES
    main.ts                     # Entry point (696 lines)
    ecies.ts                    # ECIES encryption (encrypt-only copy)
    workflow.yaml
    config.staging.json
    config.production.json
    package.json
  mission-start/                # Workflow 2: Clue engine + commit-reveal
    main.ts                     # Entry point (765 lines)
    ecies.ts                    # ECIES encryption (full version)
    workflow.yaml
    config.staging.json
    config.production.json
    package.json
  generate-finale/              # Workflow 3: AI trophy + NFT metadata
    main.ts                     # Entry point (654 lines)
    workflow.yaml
    config.staging.json
    config.production.json
    package.json
  carmen-moves/                 # Workflow 4: Cron-based relocation
    main.ts                     # Entry point (370 lines)
    workflow.yaml
    config.staging.json
    config.production.json
    package.json
  player-registration/          # Workflow 5: Gasless onboarding
    main.ts                     # Entry point (199 lines)
    workflow.yaml
    config.staging.json
    package.json
  player-check/                 # Workflow 6: Player verification
    main.ts                     # Entry point (180 lines)
    workflow.yaml
    config.staging.json
    package.json
  citynode-resolver/            # Workflow 7: Cross-chain request resolver
    main.ts                     # Entry point (574 lines)
    workflow.yaml
    config.staging.json
    package.json
```

---

## Deployed Contract Addresses (Sepolia)

| Contract | Address | Used by |
|----------|---------|---------|
| GameMaster | `0x826B5aCBE085C30C9F34A287D1fE543e2EAC56ce` | Workflows 1-4, 7 |
| GameMasterProxy | `0xcbFD04229AB18f65F70242e676c292aE35188a4A` | All (report receiver) |
| PlayerRegistry | `0x9c0C0C6126e6E53a4fbd186674156420a356B69A` | Workflows 5-6 |
| MissionNFT | `0x61F7fb92862e10d5290C16fC07Ea90fF260aee20` | Workflow 3 |
| KeystoneForwarder | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` | All (signature verification) |
| ETH/USD Data Feed | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | Workflow 1 |

---

## Total Lines of CRE Code

```
generate-briefing/main.ts     696 lines
mission-start/main.ts         765 lines
generate-finale/main.ts       654 lines
carmen-moves/main.ts           370 lines
citynode-resolver/main.ts      574 lines
player-registration/main.ts   199 lines
player-check/main.ts          180 lines
ecies.ts (x2)                 ~140 lines
─────────────────────────────────────
Total                        ~3,578 lines of CRE workflow code
```
