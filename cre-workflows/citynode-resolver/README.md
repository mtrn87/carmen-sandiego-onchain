# CRE Workflow: citynode-resolver

Resolves cross-chain CityNode requests by listening for events on remote chains and calling GameMaster resolution functions on Sepolia.

## Events Handled

| Event | Source Chain | Resolution Function | Description |
|-------|-------------|-------------------|-------------|
| `ClueRequested` | Arbitrum/Base/XDC | `resolveClueOnCity()` | Player requested a clue at a CityNode location |
| `DossierRequested` | Arbitrum/Base/XDC | `resolveDossierOnCity()` | Player requested a suspect dossier |
| `CaptureRequested` | Arbitrum/Base/XDC | `resolveCaptureOnCity()` | Player attempted to capture Carmen |

## Data Flow

```
CityNode (Arbitrum)                GameMaster (Sepolia)
  │                                     │
  ├─ requestClue() ──────┐              │
  │                       │              │
  │  ClueRequested event  │              │
  │       │               │              │
  │       └───── CRE DON ─┘              │
  │              │                        │
  │              ├─ Read mission salt     │
  │              ├─ Read target hash      │
  │              ├─ Generate clue         │
  │              ├─ ECIES encrypt         │
  │              │                        │
  │              └─ resolveClueOnCity() ──┤
  │                                       │
  │  ClueUnlocked event ◄──── CCIP ──────┤
  │       │                               │
  └── Frontend receives ◄────────────────┘
```

## Deploy

```bash
bun install
cre workflow simulate ./citynode-resolver --target=staging-settings
cre workflow deploy ./citynode-resolver --target=staging-settings
```

## Prerequisites

- CityNode contracts deployed on Arbitrum Sepolia, Base Sepolia, and/or XDC Apothem
- GameMaster and GameMasterProxy deployed on Sepolia
- Multi-chain LogTrigger configured in CRE DON for each source chain
- CCIP enabled between Sepolia and CityNode chains for resolution callbacks
