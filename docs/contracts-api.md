# Carmen Sandiego - Smart Contracts API Reference

## CityNode

**Location**: `contracts/src/CityNode.sol`
**Interface**: `contracts/src/interfaces/ICityNode.sol`
**Deployment**: One per city chain (Arbitrum Sepolia, Base Sepolia, XDC Apothem)

### Constructor

```solidity
constructor(
    string memory _cityName,
    string memory _countryCode,
    uint256 _chainId,
    uint256 _cityId,
    address _gameMaster
)
```

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| MAX_ENERGY | 10 | Maximum energy per player |
| ENERGY_REGEN_INTERVAL | 15 minutes | Time between +1 energy regen |
| NUM_LOCATIONS | 3 | Fixed locations per city |
| CLUES_PER_LOCATION | 3 | Fixed clue slots per location |
| COST_INSPECT | 1 | Energy cost for inspectLocation |
| COST_SCAN | 2 | Energy cost for scanAnomalies |
| COST_REQUEST_CLUE | 2 | Energy cost for requestClue |
| COST_FLAG_TX | 1 | Energy cost for flagTx |
| COST_REQUEST_DOSSIER | 1 | Energy cost for requestDossier |
| COST_REQUEST_CAPTURE | 3 | Energy cost for requestCapture |

### Enums

```solidity
enum ActionType { INSPECT, SCAN, REQUEST_CLUE, FLAG_TX, REQUEST_DOSSIER, REQUEST_CAPTURE }
enum ClueType { BEHAVIOR_FINGERPRINT, RELATIONSHIP, IDENTITY_COMMIT, FUNDING_TRAIL, TECHNICAL_SIGNATURE, DEAD_END }
enum AnomalyType { UNUSUAL_GAS, BURST_NONCE, PRECISE_VALUE, RECURRING_COUNTERPARTY, BRIDGE_USAGE, CREATE2_DEPLOY }
enum CaptureReasonCode { OK, INSUFFICIENT_EVIDENCE, WALLET_MISMATCH, WRONG_CITY, EXPIRED_REQUEST, INVALID_BUNDLE }
```

### Structs

```solidity
struct LocationInfo {
    string name;
    bytes32 descriptionHash;
    uint8 category;      // 0=landmark, 1=commercial, 2=transport, etc.
    uint8 fakeLevel;     // 0=real trail, 1=fake
    uint8 riskLevel;     // 0-255
}

struct TxRef {
    uint256 refId;
    bytes32 txHashLike;
    address from;
    address to;
    bytes4 methodSigLike;
    uint64 blockLike;
    uint128 valueLike;
    AnomalyType anomalyType;
}

struct SuspectWallet {
    address wallet;
    uint8 suspicionLevel;   // 0-255
    uint256[] txRefIds;     // linked anomaly refs
    uint256 tagsBitmap;     // bit flags for tags (bridge, router, feeSink, etc.)
}

struct ClueRequest {
    uint256 requestId;
    address player;
    uint8 locationIdx;
    uint8 clueIndex;
    uint64 timestamp;
    bool resolved;
}

struct CaptureRequest {
    uint256 requestId;
    address player;
    address suspectWallet;
    bytes32 evidenceBundleHash;
    uint64 timestamp;
    bool resolved;
}

struct DepartureHint {    // legacy
    bytes32 contentHash;
    string ipfsPointer;
    uint256 timestamp;
}
```

### View Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `cityInfo()` | (city, countryCode, chain, cityId) | City identity |
| `getLocations()` | LocationInfo[3] | All 3 locations |
| `getLocationMeta(uint8 idx)` | LocationInfo | Single location info |
| `getSuspicionIndex()` | (level, reasonHash) | City suspicion thermometer |
| `getAnomalyTxRefs(cursor, limit)` | TxRef[] | Paginated anomaly tx list |
| `getAnomalyTxRefById(uint256 refId)` | TxRef | Single anomaly by ID |
| `getSuspectWallets(cursor, limit)` | SuspectWallet[] | Paginated suspect list |
| `getSuspectWallet(address)` | SuspectWallet | Single suspect details |
| `getEvidenceSummary(address)` | (totalClues, bundleHash, confidence) | Player evidence progress |
| `getPlayerProgress(address)` | (inspectedBitmap, cluesFound, scansCompleted) | Player action progress |
| `getClueSchema()` | (totalClues, clueTypes[]) | Available clue types |
| `getHint(locIdx, clueIdx)` | (hintHash, hintStrength) | Hint for specific slot |
| `getEnergy(address)` | uint32 | Current energy with regen |

### Player Actions (Write)

| Function | Cost | Prerequisite | Events |
|----------|------|-------------|--------|
| `inspectLocation(uint8 idx)` | 1 | City configured | LocationInspected, EnergySpent |
| `scanAnomalies(uint8 idx)` | 2 | Location inspected | AnomalyTxLinked, SuspectWalletObserved, EnergySpent |
| `requestClue(uint8 idx, uint8 clueIndex)` | 2 | Location scanned | ClueRequested, EnergySpent |
| `flagTx(bytes32 refId)` | 1 | None | TxFlagged, EnergySpent |
| `requestDossier()` | 1 | None | DossierRequested, EnergySpent |
| `requestCapture(address wallet, bytes32 bundleHash)` | 3 | Valid wallet + evidence | CaptureRequested, EnergySpent |

### GameMaster-Only Functions (Resolve)

| Function | Events |
|----------|--------|
| `resolveClue(requestId, clueType, clueDataHash, anomalyRefId)` | ClueUnlocked or DeadEnd |
| `resolveDossier(requestId, dossierHash, confidence, nextObjectiveHintHash)` | DossierResolved |
| `resolveCapture(requestId, success, reasonCode, gmNoteHash)` | CaptureResolved |

### Setup/Admin Functions (Owner Only)

| Function | Description |
|----------|-------------|
| `setupLocations(LocationInfo[3])` | Configure 3 locations |
| `addAnomalyTxRef(TxRef)` | Add anomaly transaction reference |
| `addSuspectWallet(SuspectWallet)` | Add suspect wallet |
| `setSuspicionIndex(level, reasonHash)` | Set city suspicion |
| `setHint(locIdx, clueIdx, hintHash, hintStrength)` | Set hint for slot |
| `setClueSchema(ClueType[])` | Update clue types |
| `setGameMaster(address)` | Update GM address |
| `resetPlayerProgress(address)` | Reset player for testing |
| `transferOwnership(address)` | Transfer ownership |

### Events

```solidity
// gameplay events
event LocationInspected(address indexed player, uint8 idx, bytes32 noteHash);
event AnomalyTxLinked(uint256 indexed refId, bytes32 txHashLike, address from, address to, AnomalyType anomalyType);
event SuspectWalletObserved(address indexed player, address wallet, uint256 refId);
event ClueRequested(uint256 indexed requestId, address indexed player, uint8 idx, uint8 clueIndex);
event ClueUnlocked(address indexed player, uint8 idx, uint8 clueIndex, ClueType clueType, bytes32 clueDataHash, bytes32 anomalyRefId);
event DeadEnd(address indexed player, uint8 idx, bytes32 consolationHintHash);
event TxFlagged(address indexed player, bytes32 refId);
event DossierRequested(uint256 indexed requestId, address indexed player, uint256 cityId);
event DossierResolved(uint256 indexed requestId, address indexed player, bytes32 dossierHash, uint8 confidence, bytes32 nextObjectiveHintHash);
event CaptureRequested(uint256 indexed requestId, address indexed player, address suspectWallet, bytes32 evidenceBundleHash);
event CaptureResolved(uint256 indexed requestId, address indexed player, address suspectWallet, bool success, CaptureReasonCode reasonCode, bytes32 gmNoteHash);
event EnergySpent(address indexed player, uint32 amount, uint32 remaining, ActionType actionType);

// legacy events
event CarmenArrived(uint256 indexed missionId);
event CarmenDeparted(uint256 indexed missionId);
event DepartureHintRecorded(uint256 indexed missionId, bytes32 contentHash, string ipfsPointer);
```

---

## GameMaster

**Location**: `contracts/src/GameMaster.sol`
**Interface**: `contracts/src/interfaces/IGameMaster.sol`
**Deployment**: Sepolia (11155111) - source of truth

### Existing Functionality (Preserved)

- VRF v2.5 randomness for mission start
- Commit-reveal for Carmen's location (`keccak256(chainId, salt)`)
- Mission lifecycle: start -> investigate -> receive clues -> capture
- ECIES public key registration for encrypted clue delivery
- MissionNFT minting on successful capture
- Pausable circuit breaker
- CRE integration via GameMasterProxy

### New Methods (Task #2 - Complete)

#### CityNode Resolution (CRE-only)

| Function | Description |
|----------|-------------|
| `resolveClueOnCity(address cityNode, uint256 requestId, uint8 clueType, bytes32 clueDataHash, bytes32 anomalyRefId)` | Forward clue resolution to CityNode. Emits `ClueResolvedOnCity`. |
| `resolveDossierOnCity(address cityNode, uint256 requestId, bytes32 dossierHash, uint8 confidence, bytes32 nextObjectiveHintHash)` | Forward dossier resolution. Emits `DossierResolvedOnCity`. |
| `resolveCaptureOnCity(address cityNode, uint256 requestId, bool success, uint8 reasonCode, bytes32 gmNoteHash)` | Forward capture resolution. Emits `CaptureResolvedOnCity`. |
| `trackPlayerClue(address player, bytes32 cityNodeId, bytes32 identityCommitHash)` | Track player clue progress across cities. Increments city clue count and stores identity commits. |

#### Cross-City Progress (View)

| Function | Returns | Description |
|----------|---------|-------------|
| `getPlayerGlobalProgress(address player)` | (citiesVisited, totalIdentityCommits) | Player progress across all cities |
| `playerCityClueCount[player][cityNodeId]` | uint8 | Clues found per city |
| `playerIdentityCommits[player]` | bytes32[] | Collected identity commits |

#### New State Variables

```solidity
mapping(address => mapping(bytes32 => uint8)) public playerCityClueCount;
mapping(address => bytes32[]) public playerIdentityCommits;
mapping(address => uint256) public playerCitiesVisited;
mapping(uint256 => address) public captureRequestCity;
```

#### New Events

```solidity
event ClueResolvedOnCity(address indexed cityNode, uint256 indexed requestId, uint8 clueType, bytes32 clueDataHash);
event DossierResolvedOnCity(address indexed cityNode, uint256 indexed requestId, bytes32 dossierHash, uint8 confidence);
event CaptureResolvedOnCity(address indexed cityNode, uint256 indexed requestId, bool success, uint8 reasonCode);
```

---

## MissionNFT

**Location**: `contracts/src/MissionNFT.sol`
**Deployment**: Sepolia (11155111)

ERC-721 trophy NFT minted when player successfully captures Carmen. Stores on-chain MissionRecord with missionId, player, capturedChainId, cluesCollected, blocksUsed, reward, timestamp.

---

## GameMasterProxy

**Location**: `contracts/src/GameMasterProxy.sol`
**Deployment**: Sepolia (11155111)

CRE receiver that forwards workflow reports to GameMaster. Decodes action codes:
- ACTION_RECEIVE_CLUE (1)
- ACTION_RESOLVE_CAPTURE (2)
- ACTION_UPDATE_TARGET (3)
