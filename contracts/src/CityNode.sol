// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICityNode} from "./interfaces/ICityNode.sol";
import {CCIPReceiver} from "./CCIPReceiver.sol";
import {Client} from "./interfaces/ICCIPRouter.sol";

/**
 * @title CityNode
 * @notice Deployed on each city chain (Arbitrum Sepolia, Base Sepolia, XDC Apothem).
 *         Provides the full investigation gameplay loop: inspect locations,
 *         scan anomalies, request clues, flag transactions, request dossiers,
 *         and attempt captures. GameMaster resolves async requests via callbacks.
 *         Includes an energy system that regenerates over time.
 *
 *         Inherits CCIPReceiver to accept cross-chain messages from GameMaster
 *         via Chainlink CCIP. When GameMaster broadcasts Carmen's location update,
 *         this contract receives it and updates its internal state trustlessly.
 */
contract CityNode is ICityNode, CCIPReceiver {
    // ============================================================
    //                     CONSTANTS
    // ============================================================

    uint32 public constant MAX_ENERGY = 10;
    uint32 public constant ENERGY_REGEN_INTERVAL = 15 minutes;
    uint8 public constant NUM_LOCATIONS = 3;
    uint8 public constant CLUES_PER_LOCATION = 3;

    // action costs
    uint32 private constant COST_INSPECT = 1;
    uint32 private constant COST_SCAN = 2;
    uint32 private constant COST_REQUEST_CLUE = 2;
    uint32 private constant COST_FLAG_TX = 1;
    uint32 private constant COST_REQUEST_DOSSIER = 1;
    uint32 private constant COST_REQUEST_CAPTURE = 3;

    // ============================================================
    //                        STATE
    // ============================================================

    // --- Identity ---
    string public override cityName;
    string public countryCode;
    uint256 public override chainId;
    uint256 public cityId;

    // --- Access control ---
    address public owner;
    address public gameMaster;

    // --- Legacy: Carmen presence tracking ---
    mapping(uint256 => bool) private carmenPresence;
    mapping(uint256 => DepartureHint[]) private departureHints;

    // --- Locations (fixed 3 per city) ---
    LocationInfo[3] private locations;
    bool public locationsConfigured;

    // --- Suspicion index ---
    uint8 private suspicionLevel;
    bytes32 private suspicionReasonHash;

    // --- Anomaly tx refs ---
    TxRef[] private anomalyTxRefs;
    mapping(uint256 => uint256) private txRefIdToIndex; // refId => array index + 1 (0 = not found)

    // --- Suspect wallets ---
    address[] private suspectWalletList;
    mapping(address => SuspectWallet) private suspectWalletData;
    mapping(address => bool) private suspectWalletExists;

    // --- Energy ---
    mapping(address => uint32) private playerEnergy;
    mapping(address => uint64) private lastEnergyUpdate;
    mapping(address => bool) private energyInitialized;

    // --- Player progress ---
    // inspectedBitmap: bit i = location i inspected
    mapping(address => uint8) private playerInspectedBitmap;
    // scannedBitmap: bit i = location i scanned
    mapping(address => uint8) private playerScannedBitmap;
    mapping(address => uint8) private playerCluesFound;
    mapping(address => uint8) private playerScansCompleted;
    mapping(address => bytes32) private playerEvidenceBundleHash;
    mapping(address => uint8) private playerConfidence;

    // --- Clue requests ---
    uint256 private nextClueRequestId;
    mapping(uint256 => ClueRequest) private clueRequests;

    // --- Capture requests ---
    uint256 private nextCaptureRequestId;
    mapping(uint256 => CaptureRequest) private captureRequests;

    // --- Dossier requests ---
    uint256 private nextDossierRequestId;

    // --- Hints (location => clue => hint) ---
    mapping(uint8 => mapping(uint8 => bytes32)) private hintHashes;
    mapping(uint8 => mapping(uint8 => uint8)) private hintStrengths;

    // --- Clue schema ---
    ClueType[] private clueTypes;

    // --- Chainlink CCIP state ---
    // Tracks Carmen's location as received cross-chain from GameMaster via CCIP.
    // The CCIP Router on the destination chain calls ccipReceive(), which delegates
    // to _ccipReceive() below, updating these fields trustlessly.
    bytes32 public ccipCarmenLocationHash;                        // Latest location hash received via CCIP
    uint256 public ccipLastUpdateTimestamp;                        // Timestamp of last CCIP update
    uint64 public ccipLastSourceChain;                            // Source chain selector of last update
    uint256 public ccipMessagesReceived;                           // Total CCIP messages received
    mapping(uint64 => bool) public ccipAllowedSourceChains;       // Whitelisted source chain selectors
    mapping(address => bool) public ccipAllowedSenders;           // Whitelisted sender addresses (GameMaster)

    // --- CCIP Events ---
    event CarmenLocationUpdatedViaCCIP(uint64 indexed sourceChain, bytes32 locationHash, uint256 timestamp);
    event CCIPSourceChainAllowed(uint64 indexed chainSelector, bool allowed);
    event CCIPSenderAllowed(address indexed sender, bool allowed);

    // ============================================================
    //                      MODIFIERS
    // ============================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyGameMaster() {
        require(msg.sender == gameMaster, "Not GameMaster");
        _;
    }

    modifier hasEnergy(uint32 cost) {
        uint32 current = getEnergy(msg.sender);
        require(current >= cost, "Not enough energy");
        _;
    }

    // ============================================================
    //                     CONSTRUCTOR
    // ============================================================

    /**
     * @param _cityName Human-readable city name.
     * @param _countryCode ISO country code.
     * @param _chainId The chain ID this CityNode is deployed on.
     * @param _cityId Unique city identifier.
     * @param _gameMaster GameMaster contract address (for GM-only callbacks).
     * @param _ccipRouter CCIP Router address on this chain. Pass address(0) to disable CCIP.
     *                    Router addresses:
     *                    - Arbitrum Sepolia: 0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165
     *                    - Base Sepolia: 0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93
     */
    constructor(
        string memory _cityName,
        string memory _countryCode,
        uint256 _chainId,
        uint256 _cityId,
        address _gameMaster,
        address _ccipRouter
    ) CCIPReceiver(_ccipRouter == address(0) ? address(1) : _ccipRouter) {
        // NOTE: If _ccipRouter is address(0), we pass a placeholder (address(1))
        // to satisfy CCIPReceiver's non-zero requirement. CCIP receive will be
        // effectively disabled since no real router will call from address(1).
        cityName = _cityName;
        countryCode = _countryCode;
        chainId = _chainId;
        cityId = _cityId;
        gameMaster = _gameMaster;
        owner = msg.sender;

        nextClueRequestId = 1;
        nextCaptureRequestId = 1;
        nextDossierRequestId = 1;

        // default clue types
        clueTypes.push(ClueType.BEHAVIOR_FINGERPRINT);
        clueTypes.push(ClueType.RELATIONSHIP);
        clueTypes.push(ClueType.FUNDING_TRAIL);
    }

    // ============================================================
    //                   ENERGY SYSTEM
    // ============================================================

    /**
     * @notice Returns the current energy for a player, including passive regen.
     */
    function getEnergy(address player) public view override returns (uint32) {
        if (!energyInitialized[player]) {
            return MAX_ENERGY;
        }

        uint32 stored = playerEnergy[player];
        uint64 elapsed = uint64(block.timestamp) - lastEnergyUpdate[player];
        uint32 regenAmount = uint32(elapsed / ENERGY_REGEN_INTERVAL);
        uint32 total = stored + regenAmount;

        return total > MAX_ENERGY ? MAX_ENERGY : total;
    }

    function _spendEnergy(address player, uint32 cost, ActionType actionType) internal {
        uint32 current = getEnergy(player);
        require(current >= cost, "Not enough energy");

        if (!energyInitialized[player]) {
            energyInitialized[player] = true;
        }

        playerEnergy[player] = current - cost;
        lastEnergyUpdate[player] = uint64(block.timestamp);

        emit EnergySpent(player, cost, current - cost, actionType);
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function cityInfo()
        external
        view
        override
        returns (string memory city, string memory _countryCode, uint256 chain, uint256 _cityId)
    {
        return (cityName, countryCode, chainId, cityId);
    }

    function getLocations() external view override returns (LocationInfo[3] memory) {
        return locations;
    }

    function getLocationMeta(uint8 idx) external view override returns (LocationInfo memory) {
        require(idx < NUM_LOCATIONS, "Invalid location index");
        return locations[idx];
    }

    function getSuspicionIndex() external view override returns (uint8 level, bytes32 reasonHash) {
        return (suspicionLevel, suspicionReasonHash);
    }

    function getAnomalyTxRefs(uint256 cursor, uint256 limit)
        external
        view
        override
        returns (TxRef[] memory)
    {
        uint256 total = anomalyTxRefs.length;
        if (cursor >= total) {
            return new TxRef[](0);
        }

        uint256 remaining = total - cursor;
        uint256 count = remaining < limit ? remaining : limit;

        TxRef[] memory result = new TxRef[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = anomalyTxRefs[cursor + i];
        }
        return result;
    }

    function getAnomalyTxRefById(uint256 refId) external view override returns (TxRef memory) {
        uint256 indexPlusOne = txRefIdToIndex[refId];
        require(indexPlusOne > 0, "TxRef not found");
        return anomalyTxRefs[indexPlusOne - 1];
    }

    function getSuspectWallets(uint256 cursor, uint256 limit)
        external
        view
        override
        returns (SuspectWallet[] memory)
    {
        uint256 total = suspectWalletList.length;
        if (cursor >= total) {
            return new SuspectWallet[](0);
        }

        uint256 remaining = total - cursor;
        uint256 count = remaining < limit ? remaining : limit;

        SuspectWallet[] memory result = new SuspectWallet[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = suspectWalletData[suspectWalletList[cursor + i]];
        }
        return result;
    }

    function getSuspectWallet(address wallet) external view override returns (SuspectWallet memory) {
        require(suspectWalletExists[wallet], "Suspect wallet not found");
        return suspectWalletData[wallet];
    }

    function getEvidenceSummary(address player)
        external
        view
        override
        returns (uint8 totalClues, bytes32 bundleHashLike, uint8 confidence)
    {
        return (playerCluesFound[player], playerEvidenceBundleHash[player], playerConfidence[player]);
    }

    function getPlayerProgress(address player)
        external
        view
        override
        returns (uint8 inspectedBitmap, uint8 cluesFound, uint8 scansCompleted)
    {
        return (playerInspectedBitmap[player], playerCluesFound[player], playerScansCompleted[player]);
    }

    function getClueSchema() external view override returns (uint8 totalClues, ClueType[] memory) {
        return (uint8(clueTypes.length), clueTypes);
    }

    function getHint(uint8 locationIdx, uint8 clueIndex)
        external
        view
        override
        returns (bytes32 hintHash, uint8 hintStrength)
    {
        require(locationIdx < NUM_LOCATIONS, "Invalid location index");
        require(clueIndex < CLUES_PER_LOCATION, "Invalid clue index");
        return (hintHashes[locationIdx][clueIndex], hintStrengths[locationIdx][clueIndex]);
    }

    // --- Legacy view functions ---

    function getCarmenStatus(uint256 missionId) external view override returns (bool) {
        return carmenPresence[missionId];
    }

    function getDepartureHints(uint256 missionId) external view override returns (DepartureHint[] memory) {
        return departureHints[missionId];
    }

    // ============================================================
    //                  PLAYER ACTIONS
    // ============================================================

    /**
     * @notice Inspect a location. Marks it as inspected for the caller.
     * @param idx Location index (0-2).
     */
    function inspectLocation(uint8 idx) external override hasEnergy(COST_INSPECT) {
        require(locationsConfigured, "City not configured");
        require(idx < NUM_LOCATIONS, "Invalid location index");

        _spendEnergy(msg.sender, COST_INSPECT, ActionType.INSPECT);

        // mark inspected via bitmap
        playerInspectedBitmap[msg.sender] |= uint8(1 << idx);

        bytes32 noteHash = keccak256(abi.encodePacked(msg.sender, idx, block.timestamp));
        emit LocationInspected(msg.sender, idx, noteHash);
    }

    /**
     * @notice Scan anomalies at a location. Requires the location to be inspected first.
     * @param idx Location index (0-2).
     */
    function scanAnomalies(uint8 idx) external override hasEnergy(COST_SCAN) {
        require(locationsConfigured, "City not configured");
        require(idx < NUM_LOCATIONS, "Invalid location index");
        require(playerInspectedBitmap[msg.sender] & uint8(1 << idx) != 0, "Inspect location first");

        _spendEnergy(msg.sender, COST_SCAN, ActionType.SCAN);

        playerScannedBitmap[msg.sender] |= uint8(1 << idx);
        playerScansCompleted[msg.sender]++;

        // emit anomaly and suspect events for seeded data if available
        if (anomalyTxRefs.length > 0) {
            // link the first anomaly ref relevant to this location
            uint256 refIdx = uint256(idx) % anomalyTxRefs.length;
            TxRef storage ref = anomalyTxRefs[refIdx];
            emit AnomalyTxLinked(ref.refId, ref.txHashLike, ref.from, ref.to, ref.anomalyType);

            if (suspectWalletList.length > 0) {
                uint256 walletIdx = uint256(idx) % suspectWalletList.length;
                emit SuspectWalletObserved(msg.sender, suspectWalletList[walletIdx], ref.refId);
            }
        }
    }

    /**
     * @notice Request a clue at a specific location and clue index.
     *         Creates an async request resolved by GameMaster.
     * @param idx Location index (0-2).
     * @param clueIndex Clue index (0-2).
     */
    function requestClue(uint8 idx, uint8 clueIndex) external override hasEnergy(COST_REQUEST_CLUE) {
        require(locationsConfigured, "City not configured");
        require(idx < NUM_LOCATIONS, "Invalid location index");
        require(clueIndex < CLUES_PER_LOCATION, "Invalid clue index");
        require(playerScannedBitmap[msg.sender] & uint8(1 << idx) != 0, "Scan location first");

        _spendEnergy(msg.sender, COST_REQUEST_CLUE, ActionType.REQUEST_CLUE);

        uint256 reqId = nextClueRequestId++;
        clueRequests[reqId] = ClueRequest({
            requestId: reqId,
            player: msg.sender,
            locationIdx: idx,
            clueIndex: clueIndex,
            timestamp: uint64(block.timestamp),
            resolved: false
        });

        emit ClueRequested(reqId, msg.sender, idx, clueIndex);
    }

    /**
     * @notice Flag a suspicious transaction reference.
     * @param refId The TxRef refId encoded as bytes32.
     */
    function flagTx(bytes32 refId) external override hasEnergy(COST_FLAG_TX) {
        _spendEnergy(msg.sender, COST_FLAG_TX, ActionType.FLAG_TX);
        emit TxFlagged(msg.sender, refId);
    }

    /**
     * @notice Request a dossier summary for this city.
     *         Creates an async request resolved by GameMaster.
     */
    function requestDossier() external override hasEnergy(COST_REQUEST_DOSSIER) {
        _spendEnergy(msg.sender, COST_REQUEST_DOSSIER, ActionType.REQUEST_DOSSIER);

        uint256 reqId = nextDossierRequestId++;
        emit DossierRequested(reqId, msg.sender, cityId);
    }

    /**
     * @notice Request a capture attempt against a suspect wallet.
     *         Creates an async request resolved by GameMaster.
     * @param suspectWallet The address of the suspected Carmen wallet.
     * @param evidenceBundleHash Hash of the evidence bundle submitted by the player.
     */
    function requestCapture(address suspectWallet, bytes32 evidenceBundleHash)
        external
        override
        hasEnergy(COST_REQUEST_CAPTURE)
    {
        require(suspectWallet != address(0), "Invalid suspect wallet");
        require(evidenceBundleHash != bytes32(0), "Invalid evidence bundle");

        _spendEnergy(msg.sender, COST_REQUEST_CAPTURE, ActionType.REQUEST_CAPTURE);

        uint256 reqId = nextCaptureRequestId++;
        captureRequests[reqId] = CaptureRequest({
            requestId: reqId,
            player: msg.sender,
            suspectWallet: suspectWallet,
            evidenceBundleHash: evidenceBundleHash,
            timestamp: uint64(block.timestamp),
            resolved: false
        });

        emit CaptureRequested(reqId, msg.sender, suspectWallet, evidenceBundleHash);
    }

    // ============================================================
    //               GM-ONLY RESOLVE FUNCTIONS
    // ============================================================

    /**
     * @notice Resolve a clue request. Called by GameMaster after off-chain evaluation.
     * @param requestId The clue request ID.
     * @param clueType The type of clue (or DEAD_END).
     * @param clueDataHash Hash of the clue data.
     * @param anomalyRefId Related anomaly reference ID (bytes32-encoded).
     */
    function resolveClue(
        uint256 requestId,
        uint8 clueType,
        bytes32 clueDataHash,
        bytes32 anomalyRefId
    ) external override onlyGameMaster {
        ClueRequest storage req = clueRequests[requestId];
        require(req.requestId == requestId && requestId > 0, "Invalid request");
        require(!req.resolved, "Already resolved");

        req.resolved = true;

        ClueType ct = ClueType(clueType);

        if (ct == ClueType.DEAD_END) {
            emit DeadEnd(req.player, req.locationIdx, clueDataHash);
        } else {
            playerCluesFound[req.player]++;
            // update evidence bundle hash incrementally
            playerEvidenceBundleHash[req.player] = keccak256(
                abi.encodePacked(playerEvidenceBundleHash[req.player], clueDataHash)
            );
            emit ClueUnlocked(req.player, req.locationIdx, req.clueIndex, ct, clueDataHash, anomalyRefId);
        }
    }

    /**
     * @notice Resolve a dossier request. Called by GameMaster.
     * @param requestId The dossier request ID.
     * @param dossierHash Hash of the dossier content.
     * @param confidence Confidence level (0-100).
     * @param nextObjectiveHintHash Hash of the next objective hint.
     */
    function resolveDossier(
        uint256 requestId,
        bytes32 dossierHash,
        uint8 confidence,
        bytes32 nextObjectiveHintHash
    ) external override onlyGameMaster {
        // dossier requests are fire-and-forget; just emit
        emit DossierResolved(requestId, msg.sender, dossierHash, confidence, nextObjectiveHintHash);
    }

    /**
     * @notice Resolve a capture request. Called by GameMaster.
     * @param requestId The capture request ID.
     * @param success Whether the capture was successful.
     * @param reasonCode Reason code for the result.
     * @param gmNoteHash Hash of the GM's note about the resolution.
     */
    function resolveCapture(
        uint256 requestId,
        bool success,
        uint8 reasonCode,
        bytes32 gmNoteHash
    ) external override onlyGameMaster {
        CaptureRequest storage req = captureRequests[requestId];
        require(req.requestId == requestId && requestId > 0, "Invalid request");
        require(!req.resolved, "Already resolved");

        req.resolved = true;

        CaptureReasonCode rc = CaptureReasonCode(reasonCode);
        emit CaptureResolved(requestId, req.player, req.suspectWallet, success, rc, gmNoteHash);
    }

    // ============================================================
    //                  LEGACY CRE FUNCTIONS
    // ============================================================

    /**
     * @notice Called by CRE workflow to update Carmen's presence on this chain.
     * @param missionId The mission ID.
     * @param isPresent Whether Carmen is hiding on this chain.
     */
    function updateCarmenPresence(uint256 missionId, bool isPresent) external override onlyGameMaster {
        bool wasPresentBefore = carmenPresence[missionId];
        carmenPresence[missionId] = isPresent;

        if (isPresent && !wasPresentBefore) {
            emit CarmenArrived(missionId);
        } else if (!isPresent && wasPresentBefore) {
            emit CarmenDeparted(missionId);
        }
    }

    /**
     * @notice Called by CRE workflow when Carmen leaves this city.
     * @param missionId The mission ID.
     * @param contentHash Hash of hint content.
     * @param ipfsPointer IPFS CID for hint payload.
     */
    function recordDepartureHint(
        uint256 missionId,
        bytes32 contentHash,
        string calldata ipfsPointer
    ) external override onlyGameMaster {
        require(contentHash != bytes32(0), "Invalid hint");
        require(bytes(ipfsPointer).length > 0, "Invalid hint");

        departureHints[missionId].push(
            DepartureHint({
                contentHash: contentHash,
                ipfsPointer: ipfsPointer,
                timestamp: block.timestamp
            })
        );

        emit DepartureHintRecorded(missionId, contentHash, ipfsPointer);
    }

    // ============================================================
    //           CHAINLINK CCIP -- CROSS-CHAIN RECEIVER
    // ============================================================
    //
    // When GameMaster broadcasts Carmen's location update via CCIP:
    // 1. CCIP DON relays the message from Sepolia to this chain
    // 2. The CCIP Router on this chain calls ccipReceive() (from CCIPReceiver base)
    // 3. ccipReceive() validates the Router and delegates to _ccipReceive() below
    // 4. _ccipReceive() decodes the payload and updates Carmen's location hash
    //
    // This enables trustless cross-chain game state sync without any off-chain relay.
    //

    /**
     * @notice Handle incoming CCIP messages from GameMaster.
     *         Decodes the payload to extract Carmen's location hash and timestamp,
     *         then updates this CityNode's internal state.
     * @param message The decoded CCIP message from the source chain.
     */
    function _ccipReceive(Client.Any2EVMMessage calldata message) internal override {
        // Validate source chain is allowed
        require(ccipAllowedSourceChains[message.sourceChainSelector], "Source chain not allowed");

        // Validate sender is allowed (decode sender address from bytes)
        address sender = abi.decode(message.sender, (address));
        require(ccipAllowedSenders[sender], "Sender not allowed");

        // Decode the Carmen move payload
        (bytes32 locationHash, uint256 timestamp) = abi.decode(message.data, (bytes32, uint256));

        // Update internal state
        ccipCarmenLocationHash = locationHash;
        ccipLastUpdateTimestamp = timestamp;
        ccipLastSourceChain = message.sourceChainSelector;
        ccipMessagesReceived++;

        emit CarmenLocationUpdatedViaCCIP(message.sourceChainSelector, locationHash, timestamp);
    }

    /**
     * @notice Get the current CCIP sync status for this CityNode.
     * @return locationHash The latest Carmen location hash received via CCIP.
     * @return lastUpdate Timestamp of the last CCIP update.
     * @return sourceChain The source chain selector of the last update.
     * @return messagesReceived Total number of CCIP messages received.
     */
    function getCCIPSyncStatus()
        external
        view
        returns (bytes32 locationHash, uint256 lastUpdate, uint64 sourceChain, uint256 messagesReceived)
    {
        return (ccipCarmenLocationHash, ccipLastUpdateTimestamp, ccipLastSourceChain, ccipMessagesReceived);
    }

    // ============================================================
    //                  SETUP / ADMIN FUNCTIONS
    // ============================================================

    /**
     * @notice Configure the 3 locations for this city. Can only be called once per setup cycle.
     * @param _locations Array of 3 LocationInfo structs.
     */
    function setupLocations(LocationInfo[3] calldata _locations) external override onlyOwner {
        for (uint8 i = 0; i < NUM_LOCATIONS; i++) {
            require(bytes(_locations[i].name).length > 0, "Empty location name");
            locations[i] = _locations[i];
        }
        locationsConfigured = true;
    }

    /**
     * @notice Add an anomaly transaction reference to the city.
     * @param txRef The TxRef struct.
     */
    function addAnomalyTxRef(TxRef calldata txRef) external override onlyOwner {
        require(txRefIdToIndex[txRef.refId] == 0, "Duplicate refId");
        anomalyTxRefs.push(txRef);
        txRefIdToIndex[txRef.refId] = anomalyTxRefs.length; // store index + 1
        emit AnomalyTxLinked(txRef.refId, txRef.txHashLike, txRef.from, txRef.to, txRef.anomalyType);
    }

    /**
     * @notice Add a suspect wallet to the city.
     * @param suspect The SuspectWallet struct.
     */
    function addSuspectWallet(SuspectWallet calldata suspect) external override onlyOwner {
        require(suspect.wallet != address(0), "Invalid wallet");
        require(!suspectWalletExists[suspect.wallet], "Duplicate wallet");

        suspectWalletList.push(suspect.wallet);
        suspectWalletData[suspect.wallet] = suspect;
        suspectWalletExists[suspect.wallet] = true;
    }

    /**
     * @notice Set the global suspicion index for this city.
     * @param level Suspicion level (0-255).
     * @param reasonHash Hash of the reason text.
     */
    function setSuspicionIndex(uint8 level, bytes32 reasonHash) external override onlyOwner {
        suspicionLevel = level;
        suspicionReasonHash = reasonHash;
    }

    /**
     * @notice Set a hint for a specific location and clue slot.
     * @param locationIdx Location index (0-2).
     * @param clueIndex Clue index (0-2).
     * @param _hintHash Hash of the hint content.
     * @param _hintStrength Strength of the hint (0-255).
     */
    function setHint(uint8 locationIdx, uint8 clueIndex, bytes32 _hintHash, uint8 _hintStrength) external onlyOwner {
        require(locationIdx < NUM_LOCATIONS, "Invalid location index");
        require(clueIndex < CLUES_PER_LOCATION, "Invalid clue index");
        hintHashes[locationIdx][clueIndex] = _hintHash;
        hintStrengths[locationIdx][clueIndex] = _hintStrength;
    }

    /**
     * @notice Update the clue schema (types of clues available at this city).
     * @param _clueTypes Array of ClueType values.
     */
    function setClueSchema(ClueType[] calldata _clueTypes) external onlyOwner {
        delete clueTypes;
        for (uint256 i = 0; i < _clueTypes.length; i++) {
            clueTypes.push(_clueTypes[i]);
        }
    }

    /**
     * @notice Set the GameMaster address.
     */
    function setGameMaster(address _gameMaster) external onlyOwner {
        gameMaster = _gameMaster;
    }

    /**
     * @notice Transfer ownership.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    /**
     * @notice Reset a player's progress (for testing / new rounds).
     */
    function resetPlayerProgress(address player) external onlyOwner {
        playerInspectedBitmap[player] = 0;
        playerScannedBitmap[player] = 0;
        playerCluesFound[player] = 0;
        playerScansCompleted[player] = 0;
        playerEvidenceBundleHash[player] = bytes32(0);
        playerConfidence[player] = 0;
        energyInitialized[player] = false;
        playerEnergy[player] = 0;
        lastEnergyUpdate[player] = 0;
    }

    /**
     * @notice Allow or disallow a source chain for CCIP messages.
     *         Sepolia chain selector: 16015286601757825753
     * @param chainSelector The CCIP chain selector to allow/disallow.
     * @param allowed Whether to allow messages from this chain.
     */
    function setCCIPAllowedSourceChain(uint64 chainSelector, bool allowed) external onlyOwner {
        ccipAllowedSourceChains[chainSelector] = allowed;
        emit CCIPSourceChainAllowed(chainSelector, allowed);
    }

    /**
     * @notice Allow or disallow a sender address for CCIP messages.
     *         This should be set to the GameMaster contract address on Sepolia.
     * @param sender The sender address to allow/disallow.
     * @param allowed Whether to allow messages from this sender.
     */
    function setCCIPAllowedSender(address sender, bool allowed) external onlyOwner {
        ccipAllowedSenders[sender] = allowed;
        emit CCIPSenderAllowed(sender, allowed);
    }
}
