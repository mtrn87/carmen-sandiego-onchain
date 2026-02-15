# Carmen Sandiego - Seed Data Structure

## Overview

Each "case" (season/mission) requires seeding 3 cities with locations, anomaly transactions, and suspect wallets. The seed script populates CityNode contracts with this data.

## Case Structure

```
Case "Carmen #001"
├── City 1: Dubai (Arbitrum Sepolia, 421614) — HAS Carmen's trail
│   ├── Location 0: Burj Khalifa (landmark, REAL trail)
│   │   ├── Clue 1: BEHAVIOR_FINGERPRINT
│   │   ├── Clue 2: RELATIONSHIP
│   │   └── Clue 3: IDENTITY_COMMIT
│   ├── Location 1: Dubai Mall (commercial, FAKE)
│   │   └── DeadEnd + hint: "bridge activity to the east"
│   └── Location 2: Dubai Airport (transport, FAKE)
│       └── DeadEnd + hint: "departure records unclear"
│
├── City 2: Tokyo (Base Sepolia, 84532) — NO trail
│   ├── Location 0: Shibuya Crossing (FAKE)
│   ├── Location 1: Tokyo Tower (FAKE)
│   └── Location 2: Akihabara Market (FAKE)
│       └── Consolation hints pointing toward Dubai
│
└── City 3: Paris (XDC Apothem, 51) — PARTIAL trail
    ├── Location 0: Eiffel Tower (FAKE)
    ├── Location 1: Louvre Museum (REAL partial)
    │   ├── Clue 1: FUNDING_TRAIL
    │   ├── Clue 2: TECHNICAL_SIGNATURE
    │   └── Clue 3: DeadEnd
    └── Location 2: Charles de Gaulle Airport (FAKE)
```

## Location Categories

| Value | Category | Description |
|-------|----------|-------------|
| 0 | Landmark | Tourist/iconic locations |
| 1 | Commercial | Shops, malls, markets |
| 2 | Transport | Airports, stations, ports |
| 3 | Government | Embassies, offices |
| 4 | Financial | Banks, exchanges |
| 5 | Technology | Data centers, tech hubs |

## Anomaly TxRef Structure

Each city gets 2-5 anomaly transaction references:

```javascript
{
  refId: 1,                           // unique within city
  txHashLike: "0xabc123...",          // fictional tx hash
  from: "0x1111...1111",             // source address
  to: "0x2222...2222",               // destination address
  methodSigLike: "0xa9059cbb",       // transfer() selector
  blockLike: 52884300,               // fictional block number
  valueLike: 1500000000000000000n,    // 1.5 ETH in wei
  anomalyType: 0,                    // UNUSUAL_GAS
}
```

### Anomaly Types for Seeding

| Type | When to Use |
|------|-------------|
| UNUSUAL_GAS (0) | Carmen's wallet always uses specific gas multiples |
| BURST_NONCE (1) | 3 txs in rapid succession |
| PRECISE_VALUE (2) | Values ending in specific pattern |
| RECURRING_COUNTERPARTY (3) | Same FeeSink/Router interaction |
| BRIDGE_USAGE (4) | Cross-chain bridge activity |
| CREATE2_DEPLOY (5) | Deterministic deployment pattern |

## Suspect Wallet Structure

Each city gets 1-4 suspect wallets:

```javascript
{
  wallet: "0xCarmenOps...7f2a",       // suspect address
  suspicionLevel: 87,                  // 0-255
  txRefIds: [1, 3],                   // linked anomaly ref IDs
  tagsBitmap: 0b00000011,            // bit flags for tags
}
```

### Tags Bitmap

| Bit | Tag |
|-----|-----|
| 0 | Bridge User |
| 1 | High Value |
| 2 | Deployer |
| 3 | Mixer |
| 4 | Fee Recipient |
| 5 | Router User |
| 6 | Smart Wallet |
| 7 | CEX Funded |

## Clue Data Design

### Clue #1: BEHAVIOR_FINGERPRINT (broad)
- "Gas prices always in multiples of 7 gwei"
- "Transactions cluster in 7-12 minute windows"
- "Values always end with 0x...BEEF"

### Clue #2: RELATIONSHIP (medium)
- "Interacts with FeeSink address 0xB3..."
- "Uses specific DEX Router on Arbitrum"
- "Recurring bridge to Base Sepolia"

### Clue #3: IDENTITY_COMMIT (strong)
- `keccak256(carmenWallet, caseSalt)` — identity commitment
- Player compares this hash during capture
- Never reveals the full address on-chain

### DeadEnd Hints
- "No trail here, but notice bridge activity to the east"
- "Departure records show movement but destination unclear"
- "Not a smart wallet — look for EOA patterns instead"

## Carmen Wallet (Test)

For local/testnet testing:
- Generate a random address as Carmen's wallet
- Create `caseSalt = keccak256("carmen-case-001")`
- Identity commit = `keccak256(abi.encodePacked(carmenWallet, caseSalt))`

## How to Create New Cases

1. Choose 3 cities and assign trail status (1 real, 1 partial, 1 fake)
2. Create 3 locations per city with categories and fake levels
3. Design clues: #1 broad, #2 medium, #3 identity commit (for real trail)
4. Create anomaly txRefs (2-5 per city) with appropriate types
5. Create suspect wallets (1-4 per city) with suspicion levels
6. Generate Carmen wallet + case salt + identity commits
7. Set hints for each location/clue slot
8. Set suspicion indices per city (0=none, 1-2=noise, 3=strong)

## Seed Script Usage

```bash
cd contracts
npx hardhat run scripts/seed-case.ts --network <network>
```

The script reads city configuration and populates each CityNode via:
- `setupLocations(LocationInfo[3])`
- `addAnomalyTxRef(TxRef)` (per ref)
- `addSuspectWallet(SuspectWallet)` (per wallet)
- `setSuspicionIndex(level, reasonHash)`
- `setHint(locIdx, clueIdx, hintHash, hintStrength)` (per hint)
