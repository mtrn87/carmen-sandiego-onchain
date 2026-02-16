# Carmen Sandiego - Frontend Architecture

## Tech Stack

- **React 18** with Vite (dev server + bundler)
- **Zustand** for state management
- **Ethers.js v6** for blockchain interaction
- **Privy** for wallet + social auth
- **CSS Modules** with cyber/neon theme (cyan `#00ffff`, glitch effects)

## Component Hierarchy

```
App.jsx
├── LoginPage.jsx (Privy auth)
└── GamePage.jsx (main game container)
    ├── InteractiveMap.jsx (world map with city markers)
    │   └── Click city → enters CityView
    ├── CityView.jsx (city exploration)
    │   ├── Top bar (city name, chain, energy display)
    │   ├── Tab navigation: Overview | Contracts | Evidence
    │   ├── LocationDetail.jsx (selected location)
    │   │   ├── Location info (name, category, risk)
    │   │   ├── Clue slots (3 slots with status)
    │   │   ├── Hints display
    │   │   └── Action buttons (Inspect, Scan, Request Clue)
    │   ├── EvidencePanel.jsx (evidence tab)
    │   │   ├── Stats bar (clues, suspects, tx refs, confidence)
    │   │   ├── Clue cards (type icon, strength, data)
    │   │   ├── Dead end cards
    │   │   ├── Flagged TxRefs
    │   │   ├── DOSSIER button (gold/amber)
    │   │   └── Dossier modal (summary, hypotheses, gaps, next objective)
    │   └── EnergyDisplay.jsx (energy bar + regen timer)
    ├── TerminalSidebar.jsx (event log terminal)
    │   ├── Scrolling event lines (colored by type)
    │   └── CAPTURE button (below terminal)
    ├── CaptureMode.jsx (full-screen overlay)
    │   ├── Dark overlay with scanlines
    │   ├── Suspect wallet list (search + filter)
    │   ├── Wallet detail modal
    │   ├── Attempt Capture button (pulsing)
    │   └── Result display (success/fail + reason)
    ├── MissionBriefing.jsx (intro screen)
    ├── MissionOutcome.jsx (victory/defeat modal)
    ├── MissionPlotModal.jsx (mission details)
    ├── NicknameModal.jsx (player alias)
    └── DevMenu.jsx (debug panel)
```

## UI Components (Shared)

| Component | Description |
|-----------|-------------|
| `NeonButton.jsx` | Styled button with glow effects |
| `GlitchText.jsx` | Text with glitch animation |
| `CyberGrid.jsx` | Background grid pattern |
| `TypeWriter.jsx` | Typewriter text animation |

## Zustand Store (`gameStore.js`)

### State Shape

```javascript
{
  // auth
  walletAddress: null,
  isRegistered: false,
  playerNickname: '',

  // mission (legacy)
  missionId: null,
  missionStatus: null,
  missionPlot: null,
  clues: [],
  missionEvents: [],

  // gameplay (new)
  currentCityId: null,          // selected city chainId
  currentCityInfo: null,        // cityInfo() result
  cityLocations: [],            // getLocations() result
  cityAnomalyTxRefs: [],       // getAnomalyTxRefs() result
  citySuspectWallets: [],      // getSuspectWallets() result
  currentLocationIdx: null,     // selected location index
  cityEvidence: [],             // collected clues for this city
  cityViewTab: 'overview',      // 'overview' | 'contracts' | 'evidence'

  // energy
  energy: { current: 10, max: 10, nextRegenAt: 0 },

  // capture
  captureMode: false,
  captureState: 'ready',        // 'ready' | 'pending' | 'success' | 'fail'
  captureResult: null,

  // dossier
  showDossierModal: false,
  dossierData: null,

  // ui
  terminalLines: [],
  gameplayLoading: false,
  tourStep: null,
}
```

### Key Actions

| Action | Description |
|--------|-------------|
| `selectCity(chainId)` | Enter city, load CityNode data |
| `backToMap()` | Return to world map |
| `selectLocation(idx)` | Select a location within city |
| `setCityViewTab(tab)` | Switch city view tab |
| `gameplayInspectLocation(idx)` | Inspect location (tx) |
| `gameplayScanAnomalies(idx)` | Scan for anomalies (tx) |
| `gameplayRequestClue(idx, clueIndex)` | Request clue (tx + GM resolve) |
| `gameplayFlagTx(refId)` | Flag transaction (tx) |
| `gameplayRequestDossier()` | Request dossier (tx + GM resolve) |
| `gameplayRequestCapture(wallet)` | Attempt capture (tx + GM resolve) |
| `toggleCaptureMode()` | Toggle capture overlay |
| `addTerminalLine(line)` | Add event to terminal |

## Contract Service (`contractService.js`)

### Configuration

```javascript
GAME_MASTER_ADDRESS   // Sepolia (from env)
CITY_NODE_ADDRESSES   // Per chain (from env)
CITY_NODE_RPC_URLS    // Per chain (with fallbacks)
CITY_MAP              // Static city metadata
```

### CityNode Gameplay Methods

| Method | Type | Description |
|--------|------|-------------|
| `getCityNodeInfo(chainId)` | Read | City identity and suspicion |
| `getCityNodeLocations(chainId)` | Read | 3 locations with metadata |
| `getCityNodeAnomalyTxRefs(chainId)` | Read | Anomaly transaction list |
| `getCityNodeSuspectWallets(chainId)` | Read | Suspect wallet list |
| `getCityNodeEnergy(chainId, player)` | Read | Player energy + regen |
| `getCityNodeEvidenceSummary(chainId, player)` | Read | Evidence progress |
| `getCityNodePlayerProgress(chainId, player)` | Read | Inspect/scan bitmaps |
| `cityNodeInspectLocation(chainId, idx)` | Write | Inspect a location |
| `cityNodeScanAnomalies(chainId, idx)` | Write | Scan for anomalies |
| `cityNodeRequestClue(chainId, idx, clueIdx)` | Write | Request a clue |
| `cityNodeFlagTx(chainId, refId)` | Write | Flag a tx reference |
| `cityNodeRequestDossier(chainId)` | Write | Request dossier |
| `cityNodeRequestCapture(chainId, wallet, hash)` | Write | Attempt capture |

### Multi-Chain Architecture

The frontend reads CityNode data directly from each chain via JSON-RPC:
- Tokyo: Arbitrum Sepolia RPC (421614)
- Paris: Base Sepolia RPC (84532)
- London: XDC Apothem RPC (51)

Write operations go through the user's browser wallet (Privy/MetaMask).
GameMaster operations use Sepolia.

## Terminal Event Colors

| Color | Event Types |
|-------|------------|
| `cyan` | Player actions (inspect, scan) |
| `yellow` | Alerts (anomaly linked, clue requested) |
| `green` | Success (clue unlocked, capture success) |
| `red` | Errors/failures (dead end, capture fail) |
| `magenta` | System (energy, dossier) |

## Capture Mode UX

1. Player clicks CAPTURE below terminal
2. Full-screen dark overlay with scanlines
3. Shows only: suspect wallets + search + confidence meter
4. Click wallet → detail modal (full address, tags, linked txRefs)
5. "ATTEMPT CAPTURE" button (pulsing red/orange)
6. States:
   - **READY**: Select a wallet
   - **PENDING**: Waiting for GM verdict (spinner)
   - **SUCCESS**: Carmen captured (green flash)
   - **FAIL**: Show reasonCode + GM note (red)

## Contract Integration Pattern

All CityNode read/write functions follow a **real + mock fallback** pattern:

```javascript
export async function getCityNodeInfo(chainId) {
  if (isCityNodeConfigured(chainId)) {
    try {
      const contract = getCityNodeGameplayContract(chainId)
      // ... real contract call
      return realData
    } catch (err) {
      console.warn(`Real call failed, using mock: ${err.message}`)
    }
  }
  // fallback to mock data
  return mockData
}
```

### Key Integration Utilities

| Export | Description |
|--------|-------------|
| `MAX_ENERGY` | Contract constant (10) |
| `ENERGY_REGEN_INTERVAL` | 900 seconds (15 min) |
| `CATEGORY_MAP` | uint8 → location category label |
| `ANOMALY_TYPE_MAP` | uint8 → anomaly type label |
| `TAG_BITS` | bit position → suspect wallet tag |
| `decodeTags(bitmap)` | Decodes uint256 tagsBitmap to string[] |
| `isCityNodeConfigured(chainId)` | Checks if address + RPC available |
| `ensureCityNodeNetwork(chainId)` | Switches wallet to CityNode chain |
| `CHAIN_PARAMS` | Chain params for wallet_addEthereumChain |

### Write Operations & Chain Switching

CityNode contracts live on different chains (Arbitrum Sepolia, Base Sepolia, XDC Apothem). Write operations require:
1. `ensureCityNodeNetwork(chainId)` — prompts wallet to switch chain
2. `getCityNodeWriteContract(chainId)` — creates signer-connected contract
3. Send transaction and parse events from receipt

### Async (GM-resolved) Operations

For `requestClue`, `requestDossier`, and `requestCapture`, the flow is:
1. Send transaction (emits `ClueRequested` / `DossierRequested` / `CaptureRequested`)
2. Wait for GM resolve event (`ClueUnlocked` / `DossierResolved` / `CaptureResolved`)
3. 60-second timeout with fallback to mock data

### CityNode Event Listeners

`onCityNodeEvents(chainId, playerAddress, callbacks)` subscribes to:
- `LocationInspected` → terminal update
- `ClueUnlocked` → evidence panel + terminal
- `DeadEnd` → terminal warning
- `EnergySpent` → energy display update
- `CaptureResolved` → capture mode result

Listeners are created in `selectCity()` and cleaned up in `backToMap()` / `startNewMission()`.

## Compiled ABI Files

Located at `frontend/src/abi/`:
- `CityNode.json` — 63 entries (full gameplay ABI)
- `GameMaster.json` — 75 entries (VRF + missions + CityNode integration)
- `MissionNFT.json` — 32 entries (ERC-721)

## CSS Theme Variables

```css
--cyan: #00f0ff;
--green: #00ff88;
--yellow: #ffaa00;
--red: #ff3344;
--magenta: #ff00ff;
--bg-dark: #0a0a14;
--bg-panel: #12121f;
--border: rgba(0, 240, 255, 0.15);
```
