// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICityNode {
    // ============================================================
    //                        ENUMS
    // ============================================================

    enum ActionType {
        INSPECT,
        SCAN,
        REQUEST_CLUE,
        FLAG_TX,
        REQUEST_DOSSIER,
        REQUEST_CAPTURE
    }

    enum ClueType {
        BEHAVIOR_FINGERPRINT,
        RELATIONSHIP,
        IDENTITY_COMMIT,
        FUNDING_TRAIL,
        TECHNICAL_SIGNATURE,
        DEAD_END
    }

    enum AnomalyType {
        UNUSUAL_GAS,
        BURST_NONCE,
        PRECISE_VALUE,
        RECURRING_COUNTERPARTY,
        BRIDGE_USAGE,
        CREATE2_DEPLOY
    }

    enum CaptureReasonCode {
        OK,
        INSUFFICIENT_EVIDENCE,
        WALLET_MISMATCH,
        WRONG_CITY,
        EXPIRED_REQUEST,
        INVALID_BUNDLE
    }

    // ============================================================
    //                        STRUCTS
    // ============================================================

    struct LocationInfo {
        string name;
        bytes32 descriptionHash;
        uint8 category;
        uint8 fakeLevel;
        uint8 riskLevel;
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
        uint8 suspicionLevel;
        uint256[] txRefIds;
        uint256 tagsBitmap;
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

    // Legacy struct kept for backward compatibility
    struct DepartureHint {
        bytes32 contentHash;
        string ipfsPointer;
        uint256 timestamp;
    }

    // ============================================================
    //                        EVENTS
    // ============================================================

    // Legacy events
    event CarmenArrived(uint256 indexed missionId);
    event CarmenDeparted(uint256 indexed missionId);
    event CityInvestigated(uint256 indexed missionId, address indexed player);
    event DepartureHintRecorded(uint256 indexed missionId, bytes32 contentHash, string ipfsPointer);

    // Gameplay events
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

    // ============================================================
    //                    VIEW FUNCTIONS
    // ============================================================

    function cityName() external view returns (string memory);
    function chainId() external view returns (uint256);

    function cityInfo() external view returns (string memory city, string memory countryCode, uint256 chain, uint256 cityId);
    function getLocations() external view returns (LocationInfo[3] memory);
    function getLocationMeta(uint8 idx) external view returns (LocationInfo memory);
    function getSuspicionIndex() external view returns (uint8 level, bytes32 reasonHash);
    function getAnomalyTxRefs(uint256 cursor, uint256 limit) external view returns (TxRef[] memory);
    function getAnomalyTxRefById(uint256 refId) external view returns (TxRef memory);
    function getSuspectWallets(uint256 cursor, uint256 limit) external view returns (SuspectWallet[] memory);
    function getSuspectWallet(address wallet) external view returns (SuspectWallet memory);
    function getEvidenceSummary(address player) external view returns (uint8 totalClues, bytes32 bundleHashLike, uint8 confidence);
    function getPlayerProgress(address player) external view returns (uint8 inspectedBitmap, uint8 cluesFound, uint8 scansCompleted);
    function getClueSchema() external view returns (uint8 totalClues, ClueType[] memory clueTypes);
    function getHint(uint8 locationIdx, uint8 clueIndex) external view returns (bytes32 hintHash, uint8 hintStrength);
    function getEnergy(address player) external view returns (uint32);

    // Legacy view functions
    function getCarmenStatus(uint256 missionId) external view returns (bool);
    function getDepartureHints(uint256 missionId) external view returns (DepartureHint[] memory);

    // ============================================================
    //                 PLAYER ACTIONS
    // ============================================================

    function inspectLocation(uint8 idx) external;
    function scanAnomalies(uint8 idx) external;
    function requestClue(uint8 idx, uint8 clueIndex) external;
    function flagTx(bytes32 refId) external;
    function requestDossier() external;
    function requestCapture(address suspectWallet, bytes32 evidenceBundleHash) external;

    // ============================================================
    //                 GM-ONLY FUNCTIONS
    // ============================================================

    function resolveClue(uint256 requestId, uint8 clueType, bytes32 clueDataHash, bytes32 anomalyRefId) external;
    function resolveDossier(uint256 requestId, bytes32 dossierHash, uint8 confidence, bytes32 nextObjectiveHintHash) external;
    function resolveCapture(uint256 requestId, bool success, uint8 reasonCode, bytes32 gmNoteHash) external;

    // ============================================================
    //                 LEGACY CRE FUNCTIONS
    // ============================================================

    function updateCarmenPresence(uint256 missionId, bool isPresent) external;
    function recordDepartureHint(uint256 missionId, bytes32 contentHash, string calldata ipfsPointer) external;

    // ============================================================
    //                 SETUP FUNCTIONS
    // ============================================================

    function setupLocations(LocationInfo[3] calldata locations) external;
    function addAnomalyTxRef(TxRef calldata txRef) external;
    function addSuspectWallet(SuspectWallet calldata suspect) external;
    function setSuspicionIndex(uint8 level, bytes32 reasonHash) external;
}
