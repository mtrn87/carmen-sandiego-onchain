import { create } from 'zustand'
import {
  isPlayerRegistered,
  getPlayerOnChainPublicKey,
  getPlayerActiveMission,
  registerPlayer as registerPlayerOnChain,
  startMission as startMissionOnChain,
  submitInvestigation as submitInvestigationOnChain,
  getMission,
  getMissionClues,
  getBlocksUsed,
  getMissionEvents,
  onClueReceived,
  onCarmenCaptured,
  onCarmenMoved,
  onMissionFailed,
  onWalletFragmentReceived,
  onWalletCaseBuilt,
  onEvidenceCollected,
  onMissionStarted,
  onCarmenLocationCommitted,
  onTokenURISet,
  onClueResolvedOnCity,
  onDossierResolvedOnCity,
  onCaptureResolvedOnCity,
  onMissionNFTSet,
  onTxFlagged,
  getMissionFragmentCount,
  getMissionEvidenceCount,
  CITY_MAP,
  getCityNodeInfo,
  getCityNodeLocations,
  getCityNodeAnomalyTxRefs,
  getCityNodeSuspectWallets,
  cityNodeInspectLocation,
  cityNodeScanAnomalies,
  cityNodeRequestClue,
  cityNodeFlagTx,
  cityNodeRequestDossier,
  cityNodeRequestCapture,
  onCityNodeEvents,
  buildLocationTransactions,
  getCityNodeEnergy,
  MAX_ENERGY,
  ENERGY_REGEN_INTERVAL,
} from '../services/contractService'
import { decryptClue, getPublicKeyHex } from '../utils/ecies'
import scenariosData from '../data/scenarios.json'
import { CITY_POOL_MAP, CHAIN_DEFS, pickRevealedCities } from '../data/cityRegistry'
import { getCarmenWallet, getCarmenLocationIdx } from '../data/walletPool'
import { getActiveRoute } from '../data/scriptedRoutes'

/** Resolve a city pool ID (e.g. 511 for Nairobi) to the real on-chain chainId (e.g. 51 for XDC Apothem). */
function resolveChainId(cityPoolId) {
  const city = CITY_POOL_MAP[cityPoolId]
  return city?.chainId ?? cityPoolId
}

const MISSION_PLOT_STORAGE_KEY = 'carmen_current_mission_plot'

// Chain IDs registered as valid CityNodes in the deployed GameMaster contract
const VALID_INVESTIGATION_CHAINS = new Set([421614, 84532, 51, 80002, 97, 11155111])
const PROGRESS_STORAGE_KEY = 'carmen_investigation_progress'
const SNAPSHOT_STORAGE_KEY = 'carmen_game_snapshot'
const ABANDONED_MISSION_KEY = 'carmen_abandoned_mission'

// build a rich city descriptor from a city id
function describeCityById(cityId) {
  const city = CITY_POOL_MAP[cityId]
  if (!city) return { id: cityId, name: 'Unknown', chain: 'Unknown', chainId: null }
  const chainDef = CHAIN_DEFS[city.chainId] || {}
  return {
    id: city.id,
    name: city.name,
    chain: city.chain || chainDef.name || 'Unknown',
    chainId: city.chainId,
    flag: city.flag || '',
    locations: (city.cases || []).map((c) => c.name),
  }
}

// build a full game state snapshot for debugging / state persistence
function buildGameSnapshot(state) {
  const visibleCities = (state.discoveredCityIds || []).map((id) => {
    const desc = describeCityById(id)
    return {
      ...desc,
      isCurrent: id === state.currentCityId,
      isVisited: (state.visitedCityIds || []).includes(id),
      isHome: id === 80002,
    }
  })

  // group visible cities by chain to verify 1-per-chain rule
  const citiesByChain = {}
  visibleCities.forEach((c) => {
    const key = c.chain || 'unknown'
    if (!citiesByChain[key]) citiesByChain[key] = []
    citiesByChain[key].push(c.name)
  })

  return {
    timestamp: new Date().toISOString(),
    missionId: state.missionId || null,
    blocksElapsed: state.blocksElapsed || 0,
    // current city details
    currentCity: state.currentCityId ? describeCityById(state.currentCityId) : null,
    currentLocationIdx: state.currentLocationIdx,
    // the 3 cities visible on the map right now
    visibleCities,
    visibleCitiesByChain: citiesByChain,
    visibleCount: visibleCities.length,
    // full trail and history
    visitedCities: (state.visitedCityIds || []).map(describeCityById),
    cityTrail: (state.cityTrail || []).map(describeCityById),
    trailOrder: (state.cityTrail || []).map((id) => CITY_POOL_MAP[id]?.name || id),
    // discovery counters
    discoveryScanCount: state.discoveryScanCount || 0,
    // evidence summary
    evidenceCount: state.evidenceCount || 0,
    walletFragmentCount: state.walletFragmentCount || 0,
    walletCaptureAvailable: state.walletCaptureAvailable || false,
    clueCount: (state.clues || []).length,
  }
}

function saveProgress(state) {
  const data = {
    scannedLocations: state.scannedLocations,
    blocksElapsed: state.blocksElapsed,
    currentCityId: state.currentCityId,
    currentLocationIdx: state.currentLocationIdx,
    // per-city location states (inspected/scanned per locationIdx)
    cityLocationStates: state.cityLocations.map((loc) => ({
      inspected: loc.inspected || false,
      scanned: loc.scanned || false,
    })),
    // discovery state
    discoveredCityIds: state.discoveredCityIds,
    visitedCityIds: state.visitedCityIds,
    cityTrail: state.cityTrail,
    discoveryScanCount: state.discoveryScanCount,
    // evidence state (persisted for continue mission)
    evidence: state.evidence,
    cityEvidence: state.cityEvidence,
    walletFragments: state.walletFragments,
    walletFragmentCount: state.walletFragmentCount,
    walletCaptureAvailable: state.walletCaptureAvailable,
    evidenceCount: state.evidenceCount,
  }
  localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(data))

  // save rich snapshot alongside progress
  const snapshot = buildGameSnapshot(state)
  localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot))
  console.log('[CARMEN] game state snapshot saved:', snapshot)
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function clearProgress() {
  localStorage.removeItem(PROGRESS_STORAGE_KEY)
}

function getScenarioForMission(missionId) {
  const scenarios = scenariosData?.scenarios || []
  if (!scenarios.length) return null
  const safeMissionId = Number(missionId) > 0 ? Number(missionId) : 1
  return scenarios[(safeMissionId - 1) % scenarios.length]
}

function buildPlotFromScenario(missionId, scenario) {
  if (!scenario) return null
  return {
    missionId,
    scenarioId: scenario.id,
    title: scenario.title,
    briefing: scenario.briefing,
    cities: scenario.cities || {},
  }
}

function saveMissionPlot(plot) {
  if (!plot) return
  localStorage.setItem(MISSION_PLOT_STORAGE_KEY, JSON.stringify(plot))
}

function loadSavedMissionPlot() {
  try {
    const raw = localStorage.getItem(MISSION_PLOT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function clearSavedMissionPlot() {
  localStorage.removeItem(MISSION_PLOT_STORAGE_KEY)
}

function getLastKnownLocationFromEvents(events = []) {
  if (!Array.isArray(events) || events.length === 0) return null
  const latestInvestigation = [...events].reverse().find((e) => e?.name === 'InvestigationSubmitted')
  if (!latestInvestigation) return null

  const chainId = Number(latestInvestigation?.data?.chainId)
  if (!Number.isFinite(chainId)) return null

  const city = CITY_MAP[chainId]
  return {
    chainId,
    name: city?.name || `Chain ${chainId}`,
    chain: city?.chain || `Chain ${chainId}`,
  }
}

// ============================================================
//  City locations derived from real chain IDs
// ============================================================

const CITY_LOCATIONS = [
  {
    id: 11155111,
    name: 'New York',
    chain: 'Ethereum Sepolia',
    chainColor: '#627EEA',
    type: 'hq',
    description: 'ACME mission control where the briefing and plot originate.',
    coords: { x: 27, y: 34 },
    investigated: false,
    connections: [421614],
  },
  {
    id: 421614,
    name: 'Tokyo',
    chain: 'Arbitrum Sepolia',
    chainColor: '#28a0f0',
    type: 'staking',
    description: 'A yield staking vault on Arbitrum. An unusual amount of tokens was locked recently from an unknown address.',
    coords: { x: 78, y: 55 },
    investigated: false,
    connections: [84532, 11155111],
  },
  {
    id: 84532,
    name: 'Paris',
    chain: 'Base Sepolia',
    chainColor: '#0052ff',
    type: 'dao',
    description: 'A governance forum on Base. A proposal was submitted by a suspicious new member.',
    coords: { x: 40, y: 30 },
    investigated: false,
    connections: [51],
  },
  {
    id: 51,
    name: 'Sydney',
    chain: 'XDC Apothem',
    chainColor: '#ff6b00',
    type: 'bridge',
    description: 'A cross-chain hub on XDC. Suspect high-frequency swap patterns detected among recent activity.',
    coords: { x: 87, y: 78 },
    investigated: false,
    connections: [421614],
  },
]

// ============================================================
//  Constants
// ============================================================

const MAX_BLOCKS = 320

// ============================================================
//  Store
// ============================================================

export const useGameStore = create((set, get) => ({
  // auth
  walletAddress: null,
  isConnected: false,
  playerNickname: null,

  // gas (UI-only element)
  gas: 100,
  gasFlash: false,

  // energy (on-chain CityNode resource)
  energy: { current: MAX_ENERGY, max: MAX_ENERGY },
  energyNextRegen: null, // timestamp (ms) of next energy regen point
  _energyPollInterval: null,

  // on-chain state
  missionId: null,
  missionData: null,
  isRegistered: false,

  // game state
  rank: 0,
  rankTitle: 'Detective Rookie',
  currentMission: null,
  locations: CITY_LOCATIONS,
  clues: [],
  cityClue: {}, // keyed by cityId, each value = { id, text, type, timestamp }
  evidence: [],
  scannedLocations: [],
  isScanning: false,
  briefingDone: false,
  autoOpenHomeCity: false,
  tourActive: false,
  tourStep: 0,
  currentCase: null,
  currentPlot: null,
  showPlotModal: false,
  showLeaderboard: false,
  lastKnownLocation: null,
  terminalLines: [],
  missionNFTTokenId: null,
  isInvestigating: false,
  showClueModal: false,
  activeClue: null,
  showCityClueModal: false,
  activeCityClue: null,

  // on-chain events for ContractExplorer
  missionEvents: [],

  // mission outcome modal
  showOutcomeModal: false,
  missionOutcome: null, // { type: 'captured'|'failed', blocksUsed, reward, rewardLabel, newRank }

  // block counter
  blocksElapsed: 0,
  carmenMovedAlert: false,
  _blockPollInterval: null,

  // ── gameplay loop state ──
  currentCityId: null,      // unique city id (e.g. 512 for Rio) — used for display/CITY_MAP lookups
  currentChainId: null,     // real blockchain chainId (e.g. 51 for XDC) — used for contract calls
  currentCityInfo: null,
  cityLocations: [],
  cityAnomalyTxRefs: [],
  citySuspectWallets: [],
  cityEvidence: [],
  currentLocationIdx: null,
  startLocationIdx: null, // random starting location — first clue here is always strong
  captureMode: false,
  captureState: 'ready', // 'ready' | 'pending' | 'success' | 'fail'
  captureResult: null,
  captureSelectedTx: null, // tx selected by clicking in explorer during capture mode
  showDossierModal: false,
  dossierData: null,
  cityViewTab: 'overview', // 'overview' | 'contracts' | 'evidence'
  gameplayLoading: false,
  _cityNodeUnsub: null,

  // ── city discovery state ──
  discoveredCityIds: [],      // IDs of revealed + available cities
  visitedCityIds: [],         // IDs of already-visited cities
  cityTrail: [],              // ordered trail [id1, id2, ...]
  discoveryScanCount: 0,      // how many times the player scanned (deterministic seed)

  // carmen wallet (per-mission, deterministic from missionId)
  carmenWalletAddress: null,    // address of Carmen's wallet for this mission
  carmenLocationIdx: null,      // which locationIdx receives the Carmen tx

  // wallet evidence
  walletFragments: [],           // { startIndex, length, chars, fragmentIndex }
  walletFragmentCount: 0,
  walletCaptureAvailable: false, // true when >= 3
  evidenceCount: 0,              // on-chain evidence count (clues with strength > 65)

  // event unsubscribers
  _unsubscribers: [],

  // ============================================================
  //  Auth actions
  // ============================================================

  connectWallet: (address) =>
    set({ walletAddress: address, isConnected: true }),

  disconnectWallet: () => {
    const { _unsubscribers, _blockPollInterval } = get()
    _unsubscribers.forEach((unsub) => unsub())
    if (_blockPollInterval) clearInterval(_blockPollInterval)
    set({
      walletAddress: null,
      isConnected: false,
      playerNickname: null,
      missionId: null,
      missionData: null,
      currentPlot: null,
      showPlotModal: false,
      lastKnownLocation: null,
      isRegistered: false,
      _unsubscribers: [],
    })
  },

  setPlayerNickname: (nickname) =>
    set({ playerNickname: nickname }),

  /**
   * Restore session from localStorage on app load.
   * Called by App.jsx with data from authPersistence.loadAuthSession().
   */
  initializeWeb3AuthSession: (address, _userInfo, _addresses, nickname) =>
    set({
      walletAddress: address,
      isConnected: true,
      playerNickname: nickname,
    }),

  // ============================================================
  //  Game initialization (on-chain)
  // ============================================================

  /**
   * Initialize game state from on-chain data.
   * Call after wallet is connected.
   */
  initGame: async () => {
    const { walletAddress } = get()
    if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) return

    try {
      // Use Privy wallet address directly (no MetaMask access needed)
      const queryAddr = walletAddress
      console.log('[initGame] Using Privy wallet address:', queryAddr)

      // Check registration (read-only, no signer needed)
      const registered = await isPlayerRegistered(queryAddr)
      set({ isRegistered: registered })

      // Ensure local ECIES key matches on-chain key (re-register if mismatch)
      try {
        const localPubKey = await getPublicKeyHex()
        const onChainPubKey = await getPlayerOnChainPublicKey(queryAddr)
        if (onChainPubKey && onChainPubKey.toLowerCase() !== localPubKey.toLowerCase()) {
          console.warn('[initGame] ECIES key mismatch! Re-registering local key on-chain...')
          await registerPlayerOnChain(localPubKey)
          console.log('[initGame] ECIES key re-registered successfully')
        }
      } catch (keyErr) {
        console.warn('[initGame] Could not verify/update ECIES key:', keyErr.message)
      }

      // Check active mission (read-only, no signer needed)
      const activeMissionId = await getPlayerActiveMission(queryAddr)
      if (activeMissionId > 0n) {
        const abandonedId = localStorage.getItem(ABANDONED_MISSION_KEY)
        if (abandonedId === String(activeMissionId)) {
          console.log('[initGame] mission', activeMissionId, 'was abandoned — skipping restore')
        } else {
          // check if mission is already expired before loading full state
          const blocksUsed = await getBlocksUsed(Number(activeMissionId))
          if (blocksUsed >= MAX_BLOCKS) {
            console.log('[initGame] mission', activeMissionId, 'already expired (' + blocksUsed + ' blocks) — auto-abandoning')
            localStorage.setItem(ABANDONED_MISSION_KEY, String(activeMissionId))
          } else {
            const state = get()
            await state.loadMissionState(Number(activeMissionId))
          }
        }
      }
    } catch (error) {
      console.error('initGame error:', error)
      set((s) => ({
        terminalLines: [
          ...s.terminalLines,
          { text: `> !! ERROR: ${error.message}`, color: 'red', type: 'alert' },
        ],
      }))
    }
  },

  /**
   * Load mission state and clues from on-chain data.
   */
  loadMissionState: async (missionId) => {
    try {
      const mission = await getMission(missionId)
      const cluesOnChain = await getMissionClues(missionId)
      const blocksUsed = await getBlocksUsed(missionId)

      // Decrypt clues from on-chain data
      const decryptedClues = []
      for (const c of cluesOnChain) {
        try {
          const text = await decryptClue(c.ipfsPointer)
          decryptedClues.push({
            id: `clue-${c.timestamp}`,
            locationId: null,
            text,
            type: ['text', 'audio', 'image'][c.clueType] || 'text',
            timestamp: c.timestamp * 1000,
            decrypted: true,
          })
        } catch (err) {
          console.warn('Failed to decrypt clue:', err)
          decryptedClues.push({
            id: `clue-${c.timestamp}`,
            locationId: null,
            text: '[ENCRYPTED — decryption failed]',
            type: 'text',
            timestamp: c.timestamp * 1000,
            decrypted: false,
          })
        }
      }

      const statusMap = { 0: 'none', 1: 'active', 2: 'completed', 3: 'failed' }

      // Fetch real on-chain events for ContractExplorer
      let events = []
      try {
        events = await getMissionEvents(missionId)
      } catch (err) {
        console.warn('Failed to load mission events:', err)
      }

      // Load wallet fragments from on-chain
      let walletFragmentCount = 0
      try {
        walletFragmentCount = await getMissionFragmentCount(missionId)
      } catch (err) {
        console.warn('Failed to load wallet fragment count:', err)
      }

      // Load evidence count from on-chain
      let evidenceCount = 0
      try {
        evidenceCount = await getMissionEvidenceCount(missionId)
      } catch (err) {
        console.warn('Failed to load evidence count:', err)
      }

      // Restore persisted progress from localStorage
      const saved = loadProgress()
      const restoredState = {}
      if (saved) {
        if (saved.discoveredCityIds?.length > 0) restoredState.discoveredCityIds = saved.discoveredCityIds
        if (saved.visitedCityIds?.length > 0) restoredState.visitedCityIds = saved.visitedCityIds
        if (saved.cityTrail?.length > 0) restoredState.cityTrail = saved.cityTrail
        if (saved.discoveryScanCount > 0) restoredState.discoveryScanCount = saved.discoveryScanCount
        if (saved.scannedLocations?.length > 0) restoredState.scannedLocations = saved.scannedLocations
        if (saved.blocksElapsed > 0) restoredState.blocksElapsed = saved.blocksElapsed
        if (saved.currentCityId) restoredState.currentCityId = saved.currentCityId
        if (saved.evidence?.length > 0) restoredState.evidence = saved.evidence
        if (saved.cityEvidence?.length > 0) restoredState.cityEvidence = saved.cityEvidence
        if (saved.walletFragments?.length > 0) {
          restoredState.walletFragments = saved.walletFragments
          restoredState.walletFragmentCount = saved.walletFragmentCount || saved.walletFragments.length
          restoredState.walletCaptureAvailable = (restoredState.walletFragmentCount || 0) >= 3
        }
        if (saved.evidenceCount > 0) restoredState.evidenceCount = saved.evidenceCount
      }

      set({
        missionId,
        missionData: mission,
        missionEvents: events,
        lastKnownLocation: getLastKnownLocationFromEvents(events),
        walletFragmentCount: restoredState.walletFragmentCount ?? walletFragmentCount,
        walletCaptureAvailable: restoredState.walletCaptureAvailable ?? (walletFragmentCount >= 3),
        evidenceCount: restoredState.evidenceCount ?? evidenceCount,
        currentMission: {
          id: `mission-${missionId}`,
          title: `Mission #${missionId}`,
          description: `Track Carmen Sandiego across the blockchain. ${blocksUsed} blocks elapsed.`,
          status: statusMap[mission.status] || 'active',
        },
        clues: decryptedClues,
        blocksElapsed: blocksUsed,
        // Don't set briefingDone here — let completeBriefing handle it
        // so the user always sees the briefing screen on new sessions
        ...restoredState,
      })

      const state = get()
      state.hydrateMissionPlot(missionId)

      // Set up event listeners
      await state._setupEventListeners(missionId)
    } catch (error) {
      console.error('loadMissionState error:', error)
    }
  },

  /**
   * Set up blockchain event listeners for a mission.
   */
  _setupEventListeners: async (missionId) => {
    const { _unsubscribers, _blockPollInterval } = get()
    // Clean previous listeners
    _unsubscribers.forEach((unsub) => unsub())
    if (_blockPollInterval) clearInterval(_blockPollInterval)

    const newUnsubs = []


    try {
      const blocks = await getBlocksUsed(missionId)
      set({ blocksElapsed: blocks })
    } catch { /* ignore initial fetch error */ }

    const pollId = setInterval(async () => {
      try {
        const blocks = await getBlocksUsed(missionId)
        set({ blocksElapsed: blocks })
      } catch { /* ignore poll error */ }
    }, 12000)
    set({ _blockPollInterval: pollId })

    try {
      // Listen for new clues
      const unsubClue = await onClueReceived(missionId, async (event) => {
        set((s) => ({
          terminalLines: [
            ...s.terminalLines,
            { text: '> NEW CLUE RECEIVED from CRE workflow.', color: 'cyan', type: 'system' },
            { text: '> Decrypting with local private key...', color: 'muted', type: 'system' },
          ],
        }))

        try {
          // Clear investigation timeout — CRE responded
          const tid = get()._investigateTimeoutId
          if (tid) { clearTimeout(tid); set({ _investigateTimeoutId: null }) }

          const text = await decryptClue(event.ipfsPointer)
          const newClue = {
            id: `clue-${Date.now()}`,
            locationId: null,
            text,
            type: ['text', 'audio', 'image'][event.clueType] || 'text',
            timestamp: Date.now(),
            decrypted: true,
          }

          const cid = get().currentCityId
          // activeCityClue format for ClueModal (always rendered at GamePage level)
          const creActiveCityClue = {
            id: newClue.id,
            locationIdx: get().currentLocationIdx ?? 0,
            clueIndex: 0,
            clueType: 'BEHAVIOR_FINGERPRINT',
            data: text,
            strength: 85,
            anomalyRefId: null,
            cityId: cid,
            isDeadEnd: false,
            timestamp: Date.now(),
          }
          set((s) => ({
            isInvestigating: false,
            clues: [...s.clues, newClue],
            activeClue: newClue,
            showCityClueModal: true,
            activeCityClue: creActiveCityClue,
            cityClue: cid ? { ...s.cityClue, [cid]: newClue } : s.cityClue,
            missionEvents: [...s.missionEvents, {
              name: 'ClueReceived',
              block: 'latest',
              color: 'yellow',
              data: {
                missionId: event.missionId,
                clueType: ['Text', 'Audio', 'Image'][event.clueType] || 'Unknown',
                contentHash: `${event.contentHash.slice(0, 14)}...`,
                encrypted: 'ECIES-secp256k1',
              },
            }],
            terminalLines: [
              ...s.terminalLines,
              { text: '> CLUE DECRYPTED SUCCESSFULLY.', color: 'yellow', type: 'alert' },
            ],
          }))
        } catch (err) {
          console.error('Clue decryption failed:', err)
          const tid2 = get()._investigateTimeoutId
          if (tid2) { clearTimeout(tid2); set({ _investigateTimeoutId: null }) }
          set((s) => ({
            isInvestigating: false,
            terminalLines: [
              ...s.terminalLines,
              { text: '> !! DECRYPTION FAILED — key mismatch?', color: 'red', type: 'alert' },
            ],
          }))
        }
      })
      newUnsubs.push(unsubClue)

      // Listen for capture
      const unsubCapture = await onCarmenCaptured(missionId, (event) => {
        const rewardLabel = event.reward >= 100 ? 'GOLD' : event.reward >= 75 ? 'SILVER' : 'BRONZE'
        const newRank = get().rank + 1
        set((s) => ({
          rank: newRank,
          rankTitle: getRankTitle(newRank),
          showOutcomeModal: true,
          missionOutcome: {
            type: 'captured',
            blocksUsed: event.blocksUsed,
            reward: event.reward,
            rewardLabel,
            newRank,
            newRankTitle: getRankTitle(newRank),
          },
          currentMission: s.currentMission
            ? { ...s.currentMission, status: 'completed' }
            : null,
          missionEvents: [...s.missionEvents, {
            name: 'CarmenCaptured',
            block: 'latest',
            color: 'green',
            data: {
              missionId: event.missionId,
              blocksUsed: event.blocksUsed,
              reward: `${event.reward} pts (${rewardLabel})`,
            },
          }],
          terminalLines: [
            ...s.terminalLines,
            { text: '> ████████████████████████████████████████', color: 'green', type: 'system' },
            { text: '> CARMEN SANDIEGO CAPTURED!', color: 'green', type: 'alert' },
            { text: `> Solved in ${event.blocksUsed} blocks — ${rewardLabel} rating!`, color: 'yellow', type: 'alert' },
            { text: `> PROMOTED TO: ${getRankTitle(s.rank + 1)}`, color: 'yellow', type: 'alert' },
            { text: '> MissionNFT minted as trophy!', color: 'cyan', type: 'system' },
            { text: '> ████████████████████████████████████████', color: 'green', type: 'system' },
          ],
        }))
      })
      newUnsubs.push(unsubCapture)

      // Listen for Carmen moving
      const unsubMoved = await onCarmenMoved(missionId, (event) => {
        set({ carmenMovedAlert: true })
        setTimeout(() => set({ carmenMovedAlert: false }), 4000)
        set((s) => ({
          missionEvents: [...s.missionEvents, {
            name: 'CarmenMoved',
            block: 'latest',
            color: 'red',
            data: {
              missionId: event.missionId,
              newTargetHash: `${event.newTargetHash.slice(0, 14)}...`,
              status: 'Carmen relocated!',
            },
          }],
          terminalLines: [
            ...s.terminalLines,
            { text: '> !! ALERT: Carmen has MOVED to a different city!', color: 'red', type: 'alert' },
            { text: '> Target hash updated. Previous intel may be outdated.', color: 'yellow', type: 'system' },
          ],
        }))
      })
      newUnsubs.push(unsubMoved)

      // Listen for wallet fragments
      const unsubFragment = await onWalletFragmentReceived(missionId, async (event) => {
        set((s) => ({
          terminalLines: [
            ...s.terminalLines,
            { text: '> WALLET FRAGMENT RECEIVED from CRE workflow.', color: 'cyan', type: 'system' },
            { text: '> Decrypting fragment with local private key...', color: 'muted', type: 'system' },
          ],
        }))

        try {
          const decryptedJson = await decryptClue(event.ipfsPointer)
          const fragment = JSON.parse(decryptedJson)

          set((s) => {
            const newFragments = [...s.walletFragments, {
              startIndex: fragment.startIndex,
              length: fragment.length,
              chars: fragment.chars,
              fragmentIndex: fragment.fragmentIndex,
            }]
            const newCount = newFragments.length
            return {
              walletFragments: newFragments,
              walletFragmentCount: newCount,
              walletCaptureAvailable: newCount >= 3,
              terminalLines: [
                ...s.terminalLines,
                { text: `> WALLET FRAGMENT #${fragment.fragmentIndex} DECRYPTED.`, color: 'yellow', type: 'alert' },
                { text: `> Position: ${fragment.startIndex}-${fragment.startIndex + fragment.length - 1} | Chars: ${fragment.chars}`, color: 'green', type: 'system' },
                ...(newCount >= 3
                  ? [{ text: '> 3+ FRAGMENTS COLLECTED — WALLET CAPTURE AVAILABLE!', color: 'green', type: 'alert' }]
                  : [{ text: `> ${newCount}/3 fragments collected.`, color: 'muted', type: 'system' }]),
              ],
            }
          })
          saveProgress(get())
        } catch (err) {
          console.error('Fragment decryption failed:', err)
          set((s) => ({
            terminalLines: [
              ...s.terminalLines,
              { text: '> !! FRAGMENT DECRYPTION FAILED.', color: 'red', type: 'alert' },
            ],
          }))
        }
      })
      newUnsubs.push(unsubFragment)

      // Listen for evidence collected
      const unsubEvidence = await onEvidenceCollected(missionId, (event) => {
        set((s) => ({
          evidenceCount: event.evidenceCount,
          terminalLines: [
            ...s.terminalLines,
            { text: `> EVIDENCE COLLECTED! Strength ${event.strength} > 65 threshold.`, color: 'green', type: 'alert' },
            { text: `> On-chain evidence count: ${event.evidenceCount}`, color: 'cyan', type: 'system' },
          ],
        }))
        saveProgress(get())
      })
      newUnsubs.push(unsubEvidence)

      // Listen for wallet case results
      const unsubWalletCase = await onWalletCaseBuilt(missionId, (event) => {
        if (event.valid) {
          set((s) => ({
            terminalLines: [
              ...s.terminalLines,
              { text: '> ████████████████████████████████████████', color: 'green', type: 'system' },
              { text: '> WALLET CASE VALIDATED — CARMEN CAPTURED!', color: 'green', type: 'alert' },
              { text: '> ████████████████████████████████████████', color: 'green', type: 'system' },
            ],
          }))
        } else {
          set((s) => ({
            terminalLines: [
              ...s.terminalLines,
              { text: '> !! WALLET CASE REJECTED — wrong wallet address.', color: 'red', type: 'alert' },
              { text: '> Review your fragments and try again.', color: 'yellow', type: 'system' },
            ],
          }))
        }
      })
      newUnsubs.push(unsubWalletCase)

      // Listen for mission failure
      const unsubFail = await onMissionFailed(missionId, () => {
        if (!get().briefingDone) return // don't show outcome before briefing
        set((s) => ({
          showOutcomeModal: true,
          missionOutcome: { type: 'failed' },
          currentMission: s.currentMission
            ? { ...s.currentMission, status: 'failed' }
            : null,
          missionEvents: [...s.missionEvents, {
            name: 'MissionFailed',
            block: 'latest',
            color: 'red',
            data: { missionId, status: 'Carmen escaped!' },
          }],
          terminalLines: [
            ...s.terminalLines,
            { text: '> !! MISSION FAILED — Carmen escaped!', color: 'red', type: 'alert' },
            { text: '> Too many blocks elapsed. Start a new mission.', color: 'yellow', type: 'system' },
          ],
        }))
      })
      newUnsubs.push(unsubFail)

      // Listen for MissionStarted (VRF callback completed)
      const unsubMissionStarted = await onMissionStarted(missionId, (event) => {
        set((s) => ({
          missionEvents: [...s.missionEvents, {
            name: 'MissionStarted',
            block: event.startBlock,
            color: 'cyan',
            data: {
              missionId: event.missionId,
              player: `${event.player.slice(0, 8)}...${event.player.slice(-4)}`,
              startBlock: event.startBlock,
            },
          }],
          terminalLines: [
            ...s.terminalLines,
            { text: `> MISSION #${event.missionId} INITIALIZED — VRF confirmed.`, color: 'cyan', type: 'system' },
            { text: `> Start block: ${event.startBlock}. Investigation is GO.`, color: 'green', type: 'alert' },
          ],
        }))
      })
      newUnsubs.push(unsubMissionStarted)

      // Listen for CarmenLocationCommitted (informational)
      const unsubLocationCommit = await onCarmenLocationCommitted(missionId, (event) => {
        set((s) => ({
          missionEvents: [...s.missionEvents, {
            name: 'CarmenLocationCommitted',
            block: 'latest',
            color: 'muted',
            data: {
              missionId: event.missionId,
              targetHash: `${event.targetHash.slice(0, 14)}...`,
            },
          }],
          terminalLines: [
            ...s.terminalLines,
            { text: `> INTEL: Carmen location hash committed: ${event.targetHash.slice(0, 14)}...`, color: 'muted', type: 'system' },
          ],
        }))
      })
      newUnsubs.push(unsubLocationCommit)

      // Listen for TokenURISet (NFT metadata ready)
      const unsubTokenURI = await onTokenURISet(missionId, (event) => {
        set((s) => ({
          missionNFTTokenId: event.tokenId,
          missionEvents: [...s.missionEvents, {
            name: 'TokenURISet',
            block: 'latest',
            color: 'cyan',
            data: {
              missionId: event.missionId,
              tokenId: event.tokenId,
            },
          }],
          terminalLines: [
            ...s.terminalLines,
            { text: `> NFT TROPHY #${event.tokenId} metadata set! View your trophy in profile.`, color: 'cyan', type: 'alert' },
          ],
        }))
      })
      newUnsubs.push(unsubTokenURI)

      // Listen for ClueResolvedOnCity (cross-chain clue feedback)
      const unsubClueResolved = await onClueResolvedOnCity((event) => {
        const clueTypes = ['Text', 'Audio', 'Image']
        set((s) => ({
          missionEvents: [...s.missionEvents, {
            name: 'ClueResolvedOnCity',
            block: 'latest',
            color: 'yellow',
            data: {
              cityNode: `${event.cityNode.slice(0, 10)}...`,
              clueType: clueTypes[event.clueType] || 'Unknown',
              clueDataHash: `${event.clueDataHash.slice(0, 14)}...`,
            },
          }],
          terminalLines: [
            ...s.terminalLines,
            { text: `> CROSS-CHAIN: Clue resolved on CityNode ${event.cityNode.slice(0, 10)}...`, color: 'yellow', type: 'system' },
          ],
        }))
      })
      newUnsubs.push(unsubClueResolved)

      // Listen for DossierResolvedOnCity (cross-chain dossier feedback)
      const unsubDossierResolved = await onDossierResolvedOnCity((event) => {
        set((s) => ({
          missionEvents: [...s.missionEvents, {
            name: 'DossierResolvedOnCity',
            block: 'latest',
            color: 'cyan',
            data: {
              cityNode: `${event.cityNode.slice(0, 10)}...`,
              dossierHash: `${event.dossierHash.slice(0, 14)}...`,
              confidence: event.confidence,
            },
          }],
          terminalLines: [
            ...s.terminalLines,
            { text: `> CROSS-CHAIN: Dossier resolved — confidence: ${event.confidence}%.`, color: 'cyan', type: 'system' },
          ],
        }))
      })
      newUnsubs.push(unsubDossierResolved)

      // Listen for CaptureResolvedOnCity (cross-chain capture feedback)
      const unsubCaptureResolved = await onCaptureResolvedOnCity((event) => {
        const status = event.success ? 'CAPTURE CONFIRMED' : 'CAPTURE FAILED'
        const color = event.success ? 'green' : 'red'
        set((s) => ({
          missionEvents: [...s.missionEvents, {
            name: 'CaptureResolvedOnCity',
            block: 'latest',
            color,
            data: {
              cityNode: `${event.cityNode.slice(0, 10)}...`,
              success: event.success,
              reasonCode: event.reasonCode,
            },
          }],
          terminalLines: [
            ...s.terminalLines,
            { text: `> CROSS-CHAIN: ${status} on CityNode ${event.cityNode.slice(0, 10)}...`, color, type: 'alert' },
          ],
        }))
      })
      newUnsubs.push(unsubCaptureResolved)

      // Listen for MissionNFTSet (admin configuration event)
      const unsubMissionNFTSet = await onMissionNFTSet((event) => {
        set((s) => ({
          missionEvents: [...s.missionEvents, {
            name: 'MissionNFTSet',
            block: 'latest',
            color: 'muted',
            data: {
              missionNFT: `${event.missionNFT.slice(0, 10)}...${event.missionNFT.slice(-4)}`,
            },
          }],
          terminalLines: [
            ...s.terminalLines,
            { text: `> CONFIG: MissionNFT contract updated: ${event.missionNFT.slice(0, 10)}...`, color: 'muted', type: 'system' },
          ],
        }))
      })
      newUnsubs.push(unsubMissionNFTSet)

      // Listen for TxFlagged on each active CityNode
      const { walletAddress, currentCityId } = get()
      if (walletAddress && currentCityId) {
        const chainId = resolveChainId(currentCityId)
        const unsubTxFlagged = await onTxFlagged(chainId, walletAddress, (event) => {
          set((s) => ({
            missionEvents: [...s.missionEvents, {
              name: 'TxFlagged',
              block: 'latest',
              color: 'yellow',
              data: {
                player: `${event.player.slice(0, 8)}...${event.player.slice(-4)}`,
                refId: `${event.refId.slice(0, 14)}...`,
              },
            }],
            terminalLines: [
              ...s.terminalLines,
              { text: `> TX FLAGGED: Reference ${event.refId.slice(0, 14)}... marked as suspicious.`, color: 'yellow', type: 'alert' },
            ],
          }))
        })
        newUnsubs.push(unsubTxFlagged)
      }

      set({ _unsubscribers: newUnsubs })
    } catch (error) {
      console.error('Event listener setup failed:', error)
    }
  },

  // ============================================================
  //  Game actions
  // ============================================================

  /**
   * Increment blocksElapsed, clamped to MAX_BLOCKS.
   * Triggers mission failure screen when limit is reached.
   * Returns the new blocksElapsed value.
   */
  _spendBlocks: (cost, { allowExceed = false } = {}) => {
    const { blocksElapsed } = get()
    const newBlocks = allowExceed ? blocksElapsed + cost : Math.min(blocksElapsed + cost, MAX_BLOCKS)
    set({ blocksElapsed: newBlocks })

    if (newBlocks >= MAX_BLOCKS && !allowExceed) {
      set((s) => ({
        showOutcomeModal: true,
        missionOutcome: { type: 'failed' },
        currentMission: s.currentMission
          ? { ...s.currentMission, status: 'failed' }
          : null,
        terminalLines: [
          ...s.terminalLines,
          { text: '> !! MISSION FAILED — block limit reached!', color: 'red', type: 'alert' },
          { text: '> Carmen escaped. Start a new mission.', color: 'yellow', type: 'system' },
        ],
      }))
    }

    return newBlocks
  },

  /** Check if the mission has exceeded the block limit. */
  _isMissionExpired: () => get().blocksElapsed >= MAX_BLOCKS,

  scanLocation: (locationId, scanCost = 30) => {
    const state = get()
    if (state.isScanning || state.scannedLocations.includes(locationId)) return
    if (state.gas < scanCost) {
      set((s) => ({
        terminalLines: [
          ...s.terminalLines,
          { text: '> !! INSUFFICIENT GAS — cannot scan network.', color: 'red', type: 'alert' },
        ],
      }))
      return
    }

    set({
      isScanning: true,
      gas: state.gas - scanCost,
      gasFlash: true,
    })
    setTimeout(() => set({ gasFlash: false }), 800)

    const loc = CITY_MAP[locationId]
    const locName = loc ? loc.name : `Chain ${locationId}`

    set((s) => ({
      terminalLines: [
        ...s.terminalLines,
        { text: `> SCANNING NETWORK: ${locName} [-${scanCost} GAS]`, color: 'cyan', type: 'action' },
        { text: '> Deploying scanner nodes across chain...', color: 'muted', type: 'system' },
      ],
    }))

    setTimeout(() => {
      set((s) => ({
        isScanning: false,
        scannedLocations: [...s.scannedLocations, locationId],
        terminalLines: [
          ...s.terminalLines,
          { text: '> SCAN COMPLETE. Suspicious contracts found.', color: 'green', type: 'system' },
          { text: '> Contracts available for investigation.', color: 'cyan', type: 'system' },
        ],
      }))
    }, 2000)
  },

  // Safety timeout ID for investigation — cleared when clue arrives
  _investigateTimeoutId: null,
  // Tracks consecutive TX failures for investigate — resets on success or mock fallback
  _investigateFailCount: 0,

  /**
   * Submit investigation transaction on-chain.
   * @param {number} chainId - The city's chain ID (421614, 84532, or 51)
   */
  investigate: async (chainId) => {
    const state = get()
    if (state.isInvestigating) return

    set({ isInvestigating: true })

    const city = CITY_MAP[chainId]
    const cityName = city ? `${city.name} [${city.chain}]` : `Chain ${chainId}`

    set((s) => ({
      terminalLines: [
        ...s.terminalLines,
        { text: `> INVESTIGATING: ${cityName}`, color: 'cyan', type: 'action' },
        { text: '> Sending tx to GameMaster.submitInvestigation()...', color: 'muted', type: 'system' },
      ],
    }))

    try {
      const receipt = await submitInvestigationOnChain(resolveChainId(chainId))

      // TX confirmed — now charge the block cost
      const newBlocks = get()._spendBlocks(5)

      // Reset failure counter on successful TX
      set({ _investigateFailCount: 0 })

      // Safety timeout: if CRE doesn't respond within 20s, fall back to local mock clue
      const timeoutId = setTimeout(async () => {
        if (!get().isInvestigating) return
        set((s) => ({
          isInvestigating: false,
          _investigateTimeoutId: null,
          terminalLines: [
            ...s.terminalLines,
            { text: '> !! CRE oracle timed out. Recovering intel from local signal...', color: 'yellow', type: 'alert' },
          ],
        }))
        // Fallback: use the mock CityNode clue generator which produces contextual scenario clues
        const { currentCityId, startLocationIdx = 0 } = get()
        const resolvedChain = resolveChainId(currentCityId)
        try {
          const result = await cityNodeRequestClue(resolvedChain, 0, 0, true)
          const cacheClue = { id: `city-clue-cre-fb-${Date.now()}`, text: result.clueData, type: 'text', timestamp: Date.now() }
          const activeCityClue = {
            id: cacheClue.id,
            clueType: result.clueType,
            data: result.clueData,
            strength: result.strength,
            cityId: currentCityId,
            isDeadEnd: false,
            timestamp: Date.now(),
          }
          set((s) => ({
            showCityClueModal: true,
            activeCityClue,
            cityClue: { ...s.cityClue, [currentCityId]: cacheClue },
            terminalLines: [...s.terminalLines,
              { text: `> INTEL RECOVERED: ${result.clueData}`, color: 'yellow', type: 'alert' },
            ],
          }))
        } catch {
          const fallbackClue = { id: `city-clue-cre-fb-${Date.now()}`, text: '[SIGNAL DEGRADED] — local cache incomplete.', type: 'text', timestamp: Date.now() }
          set((s) => ({ cityClue: { ...s.cityClue, [currentCityId]: fallbackClue } }))
        }
      }, 20_000)
      set({ _investigateTimeoutId: timeoutId })

      set((s) => ({
        locations: s.locations.map((l) =>
          l.id === chainId ? { ...l, investigated: true } : l
        ),
        lastKnownLocation: {
          chainId,
          name: city?.name || `Chain ${chainId}`,
          chain: city?.chain || `Chain ${chainId}`,
        },
        missionEvents: [...s.missionEvents, {
          name: 'InvestigationSubmitted',
          block: receipt.blockNumber || 'latest',
          color: 'cyan',
          data: {
            missionId: s.missionId,
            city: `${cityName}`,
            chainId,
            txHash: `${receipt.hash.slice(0, 14)}...`,
          },
        }],
        terminalLines: [
          ...s.terminalLines,
          { text: `> TX CONFIRMED: ${receipt.hash}`, color: 'green', type: 'system' },
          { text: `> +5 BLOCKS (${newBlocks} total)`, color: 'yellow', type: 'system' },
          { text: '> Waiting for CRE oracle response... (20s timeout)', color: 'cyan', type: 'system' },
        ],
      }))

      // Clue will arrive via ClueReceived event listener
      // isInvestigating stays true until clue arrives or timeout fires
    } catch (error) {
      console.error('Investigation failed:', error)
      const failCount = get()._investigateFailCount + 1
      set({ _investigateFailCount: failCount })

      const isCancelled = error?.code === 4001 || /user (rejected|denied|cancelled)/i.test(error?.message || '')
      const errMsg = isCancelled ? 'Transaction cancelled by user.' : (error.reason || error.message || 'Unknown error')

      if (failCount >= 2) {
        // After 2 failures, fall back to mock so the player isn't stuck
        set((s) => ({
          isInvestigating: false,
          _investigateFailCount: 0,
          terminalLines: [
            ...s.terminalLines,
            { text: `> !! TX FAILED: ${errMsg}`, color: 'red', type: 'alert' },
            { text: '> Falling back to cached intel after repeated failures.', color: 'yellow', type: 'system' },
          ],
        }))
        const { currentCityId } = get()
        const fallbackClue = {
          id: `city-clue-fallback-${Date.now()}`,
          text: '[FALLBACK INTEL] — signal lost, using last known intercept.',
          type: 'text',
          timestamp: Date.now(),
        }
        const activeCityClue = {
          id: fallbackClue.id,
          clueType: 'PARTIAL',
          data: fallbackClue.text,
          strength: 15,
          cityId: currentCityId,
          isDeadEnd: false,
          timestamp: Date.now(),
        }
        set((s) => ({
          showCityClueModal: true,
          activeCityClue,
          cityClue: { ...s.cityClue, [currentCityId]: fallbackClue },
        }))
      } else {
        // First failure — notify and allow retry (no blocks charged)
        set((s) => ({
          isInvestigating: false,
          terminalLines: [
            ...s.terminalLines,
            { text: `> !! TX FAILED: ${errMsg}`, color: 'red', type: 'alert' },
            { text: '> Click INVESTIGATE CITY again to retry.', color: 'yellow', type: 'system' },
          ],
        }))
      }
    }
  },

  /**
   * Complete briefing: loads game state and enters the game.
   * The on-chain startMission TX is now triggered from the LoginPage
   * before navigating here, so this just sets up the gameplay.
   */
  completeBriefing: async () => {
    const { missionId: existingMissionId } = get()

    console.log('[completeBriefing] START', { existingMissionId })

    set({
      terminalLines: [
        { text: '> ACME MAINFRAME :: INITIALIZING MISSION', color: 'cyan', type: 'system' },
        { text: '> Agent connected. Welcome, Detective.', color: 'green', type: 'system' },
      ],
    })

    try {
      // missionId is set on LoginPage before navigating — use it directly
      let mId = existingMissionId

      // Initialize city discovery and load starting city
      await get().initDiscovery(mId)

      // Restore saved evidence from localStorage
      const savedEvidence = loadProgress()
      if (savedEvidence) {
        const restored = {}
        if (savedEvidence.evidence?.length > 0) restored.evidence = savedEvidence.evidence
        if (savedEvidence.cityEvidence?.length > 0) restored.cityEvidence = savedEvidence.cityEvidence
        if (savedEvidence.walletFragments?.length > 0) {
          restored.walletFragments = savedEvidence.walletFragments
          restored.walletFragmentCount = savedEvidence.walletFragmentCount || savedEvidence.walletFragments.length
          restored.walletCaptureAvailable = (restored.walletFragmentCount || 0) >= 3
        }
        if (savedEvidence.evidenceCount > 0) restored.evidenceCount = savedEvidence.evidenceCount
        if (Object.keys(restored).length > 0) set(restored)
      }

      const _route = getActiveRoute()
      const HOME_CITY_ID = _route ? _route.homeCityId : 80002
      // restore last visited city and location from saved progress, or fall back to defaults
      const savedProgress = loadProgress()
      const startingCityId = savedProgress?.currentCityId || get().discoveredCityIds[0] || HOME_CITY_ID
      await get().selectCity(startingCityId)
      const locCount = get().cityLocations.length || 3
      const savedLocIdx = savedProgress?.currentLocationIdx
      const startIdx = (savedLocIdx != null && savedLocIdx >= 0 && savedLocIdx < locCount)
        ? savedLocIdx
        : Math.floor(Math.random() * locCount)
      set({ startLocationIdx: startIdx })
      get().selectLocation(startIdx)

      // persist initial state (home city scanned + discovered cities) to localStorage
      saveProgress(get())

      if (mId) {
        const state = get()
        state.hydrateMissionPlot(mId)

        set({
          briefingDone: true,
          autoOpenHomeCity: true,
          tourActive: true,
          tourStep: 0,
        })

        await state._setupEventListeners(mId)

        const startLoc = get().cityLocations[startIdx]
        set((s) => ({
          terminalLines: [
            ...s.terminalLines,
            { text: `> MISSION #${mId} ACTIVE. Carmen's location committed.`, color: 'yellow', type: 'alert' },
            { text: `> LOCATION: ${startLoc?.name || `Location ${startIdx}`} — first clue available here.`, color: 'green', type: 'help' },
            { text: '> Type /MISSION in terminal to read your current assignment.', color: 'cyan', type: 'help' },
          ],
        }))
      } else {
        // No on-chain mission — start in mock/demo mode
        set({
          briefingDone: true,
          autoOpenHomeCity: true,
          tourActive: true,
          tourStep: 0,
        })

        const startLoc = get().cityLocations[startIdx]
        set((s) => ({
          terminalLines: [
            ...s.terminalLines,
            { text: '> MISSION INITIALIZED. Carmen is on the move.', color: 'yellow', type: 'alert' },
            { text: `> LOCATION: ${startLoc?.name || `Location ${startIdx}`} — first clue available here.`, color: 'green', type: 'help' },
            { text: '> Type /MISSION in terminal to read your current assignment.', color: 'cyan', type: 'help' },
          ],
        }))
      }

      console.log('[completeBriefing] DONE')
    } catch (error) {
      console.error('[completeBriefing] FAILED:', error)
      // Still enter the game even if setup fails
      set({
        briefingDone: true,
        terminalLines: [
          ...get().terminalLines,
          { text: `> !! WARNING: ${error.message}`, color: 'red', type: 'alert' },
          { text: '> Entering investigation mode...', color: 'yellow', type: 'system' },
        ],
      })
    }
  },

  // ============================================================
  //  Tour (UI-only, preserved)
  // ============================================================

  advanceTour: () => {
    const state = get()
    const nextStep = state.tourStep + 1
    const tourMessages = {
      1: [
        { text: '', color: 'muted', type: 'system' },
        { text: '> Good. Mission data loaded.', color: 'green', type: 'system' },
        { text: '> Click on a city marker on the MAP to investigate.', color: 'green', type: 'help' },
        { text: '> Each investigation sends a transaction to GameMaster.', color: 'green', type: 'help' },
      ],
      2: [
        { text: '', color: 'muted', type: 'system' },
        { text: '> Investigation submitted. Waiting for CRE clue...', color: 'green', type: 'system' },
        { text: '> Clues are encrypted with your ECIES public key.', color: 'yellow', type: 'alert' },
        { text: '> Only you can decrypt them with your local private key.', color: 'yellow', type: 'alert' },
      ],
      3: [
        { text: '', color: 'muted', type: 'system' },
        { text: '> Clues tell you whether Carmen is at this location.', color: 'green', type: 'help' },
        { text: '> If you guess correctly, Carmen is captured automatically!', color: 'green', type: 'help' },
        { text: '> A MissionNFT trophy will be minted for you.', color: 'cyan', type: 'system' },
      ],
      4: [
        { text: '', color: 'muted', type: 'system' },
        { text: '> Good luck, Detective. The hunt begins now.', color: 'cyan', type: 'system' },
        { text: '> Remember: Carmen may move if you take too long!', color: 'red', type: 'alert' },
      ],
    }

    const newLines = tourMessages[nextStep] || []
    set((s) => ({
      tourStep: nextStep,
      terminalLines: [...s.terminalLines, ...newLines],
    }))
  },

  endTour: () => {
    set((s) => ({
      tourActive: false,
      terminalLines: [
        ...s.terminalLines,
        { text: '', color: 'muted', type: 'system' },
        { text: '> TRAINING COMPLETE. Good luck, Detective.', color: 'green', type: 'system' },
        { text: '> The hunt for Carmen Sandiego begins now.', color: 'cyan', type: 'system' },
      ],
    }))
  },

  setCurrentCase: (caseId) => {
    set((s) => ({
      currentCase: caseId,
      terminalLines: [
        ...s.terminalLines,
        { text: '', color: 'muted', type: 'system' },
        { text: `> LOADING CONTRACT: ${caseId}`, color: 'cyan', type: 'action' },
        { text: '> Fetching on-chain data...', color: 'muted', type: 'system' },
      ],
    }))
  },

  closeClueModal: () => set({ showClueModal: false, activeClue: null }),
  closeCityClueModal: () => set({ showCityClueModal: false, activeCityClue: null }),
  closeOutcomeModal: () => set({ showOutcomeModal: false }),

  /**
   * Abandon current mission and clear all state (used on defeat → exit).
   * Does NOT start a new on-chain mission — just resets local state so the
   * player can return to the home screen cleanly.
   */
  abandonMission: () => {
    const { _unsubscribers, _blockPollInterval, _cityNodeUnsub, missionId } = get()
    _unsubscribers.forEach((unsub) => unsub())
    if (_blockPollInterval) clearInterval(_blockPollInterval)
    if (_cityNodeUnsub) _cityNodeUnsub()

    // mark mission as abandoned so initGame won't restore it from on-chain
    if (missionId) {
      localStorage.setItem(ABANDONED_MISSION_KEY, String(missionId))
    }

    set({
      missionId: null,
      missionData: null,
      missionEvents: [],
      clues: [],
      evidence: [],
      lastKnownLocation: null,
      locations: CITY_LOCATIONS,
      scannedLocations: [],
      briefingDone: false,
      autoOpenHomeCity: false,
      isInvestigating: false,
      showClueModal: false,
      activeClue: null,
      showCityClueModal: false,
      activeCityClue: null,
      showPlotModal: false,
      showOutcomeModal: false,
      missionOutcome: null,
      currentMission: null,
      currentPlot: null,
      gas: 100,
      blocksElapsed: 0,
      carmenMovedAlert: false,
      _blockPollInterval: null,
      _unsubscribers: [],
      carmenWalletAddress: null,
      carmenLocationIdx: null,
      walletFragments: [],
      walletFragmentCount: 0,
      walletCaptureAvailable: false,
      evidenceCount: 0,
      discoveredCityIds: [],
      visitedCityIds: [],
      cityTrail: [],
      discoveryScanCount: 0,
      currentCityId: null,
      currentChainId: null,
      currentCityInfo: null,
      cityLocations: [],
      cityAnomalyTxRefs: [],
      citySuspectWallets: [],
      cityEvidence: [],
      currentLocationIdx: null,
      startLocationIdx: null,
      captureMode: false,
      captureState: 'ready',
      captureResult: null,
      captureSelectedTx: null,
      showDossierModal: false,
      dossierData: null,
      cityViewTab: 'overview',
      gameplayLoading: false,
      _cityNodeUnsub: null,
      terminalLines: [],
    })

    clearSavedMissionPlot()
    clearProgress()
    localStorage.removeItem(SNAPSHOT_STORAGE_KEY)
  },

  /**
   * Start a new mission after completion or failure.
   * Resets game state and goes back to briefing flow.
   */
  /**
   * Reset current mission and start fresh.
   * Calls startMission on-chain (auto-fails active mission) then resets local state.
   */
  startNewMission: async () => {
    const { _unsubscribers, _blockPollInterval, _cityNodeUnsub } = get()
    _unsubscribers.forEach((unsub) => unsub())
    if (_blockPollInterval) clearInterval(_blockPollInterval)
    if (_cityNodeUnsub) _cityNodeUnsub()

    // call startMission on-chain — this auto-fails any active mission
    try {
      await startMissionOnChain()
    } catch (err) {
      console.warn('[startNewMission] on-chain startMission failed:', err.message)
    }

    set({
      missionId: null,
      missionData: null,
      missionEvents: [],
      clues: [],
      evidence: [],
      lastKnownLocation: null,
      locations: CITY_LOCATIONS,
      scannedLocations: [],
      briefingDone: false,
      autoOpenHomeCity: false,
      isInvestigating: false,
      showClueModal: false,
      activeClue: null,
      showCityClueModal: false,
      activeCityClue: null,
      showPlotModal: false,
      showOutcomeModal: false,
      missionOutcome: null,
      currentMission: null,
      currentPlot: null,
      gas: 100,
      blocksElapsed: 0,
      carmenMovedAlert: false,
      _blockPollInterval: null,
      _unsubscribers: [],
      // reset carmen wallet
      carmenWalletAddress: null,
      carmenLocationIdx: null,
      // reset wallet evidence
      walletFragments: [],
      walletFragmentCount: 0,
      walletCaptureAvailable: false,
      evidenceCount: 0,
      // reset discovery state
      discoveredCityIds: [],
      visitedCityIds: [],
      cityTrail: [],
      discoveryScanCount: 0,
      // reset gameplay loop state
      currentCityId: null,
      currentChainId: null,
      currentCityInfo: null,
      cityLocations: [],
      cityAnomalyTxRefs: [],
      citySuspectWallets: [],
      cityEvidence: [],
      currentLocationIdx: null,
      startLocationIdx: null,
      captureMode: false,
      captureState: 'ready',
      captureResult: null,
      captureSelectedTx: null,
      showDossierModal: false,
      dossierData: null,
      cityViewTab: 'overview',
      gameplayLoading: false,
      _cityNodeUnsub: null,
      terminalLines: [
        { text: '> MISSION RESET. Preparing new assignment...', color: 'cyan', type: 'system' },
      ],
    })

    clearSavedMissionPlot()
    clearProgress()
    localStorage.removeItem(ABANDONED_MISSION_KEY)
  },

  hydrateMissionPlot: (missionIdParam = null) => {
    const missionId = missionIdParam ?? get().missionId
    if (!missionId) {
      set({ currentPlot: null })
      return null
    }

    const saved = loadSavedMissionPlot()
    if (saved && Number(saved.missionId) === Number(missionId)) {
      set({ currentPlot: saved })
      return saved
    }

    const scenario = getScenarioForMission(missionId)
    const plot = buildPlotFromScenario(missionId, scenario)
    if (plot) {
      saveMissionPlot(plot)
      set({ currentPlot: plot })
      return plot
    }

    set({ currentPlot: null })
    return null
  },

  openMissionPlotModal: () => {
    const state = get()
    const plot = state.currentPlot || state.hydrateMissionPlot(state.missionId)

    if (!plot) {
      set((s) => ({
        terminalLines: [
          ...s.terminalLines,
          { text: '> No mission plot available. Start or resume a mission first.', color: 'yellow', type: 'help' },
        ],
      }))
      return
    }

    set({ showPlotModal: true })
  },

  printCurrentMissionPlot: () => {
    get().openMissionPlotModal()
  },

  closeMissionPlotModal: () => set({ showPlotModal: false }),

  openLeaderboard: () => set({ showLeaderboard: true }),
  closeLeaderboard: () => set({ showLeaderboard: false }),

  // ============================================================
  //  Gameplay Loop Actions
  // ============================================================

  /**
   * Combined action: load CityNode data + call inspectLocation on-chain.
   * Used by InteractiveMap's "SCAN NETWORK" button.
   */
  scanAndInspect: async (cityId) => {
    const state = get()
    if (state.isScanning || state.scannedLocations.includes(cityId)) return
    if (get()._isMissionExpired()) return

    set({ isScanning: true })

    try {
      // 1. Spend 21 blocks for scanning a new city network
      const newBlocks = get()._spendBlocks(21)
      if (newBlocks >= MAX_BLOCKS) { set({ isScanning: false }); return }

      // 2. Load all CityNode data (locations, anomalies, suspects, energy)
      await state.selectCity(cityId)

      // 3. Mark city as scanned and keep all previously-scanned cities on the map
      const { discoveredCityIds, scannedLocations, visitedCityIds } = get()
      const _scanRoute = getActiveRoute()
      const HOME_CITY_ID = _scanRoute ? _scanRoute.homeCityId : 80002
      const updatedScanned = [...new Set([...scannedLocations, cityId])]

      // keep: city just scanned + home + any previously scanned city
      // prune only never-scanned, never-visited cities (old unacted reveals)
      const keptCityIds = discoveredCityIds.filter((id) =>
        id === cityId ||                        // the city being scanned
        id === HOME_CITY_ID ||                  // always keep home
        updatedScanned.includes(id) ||          // any previously scanned city stays visible
        visitedCityIds.includes(id)             // any visited city stays visible
      )

      set(() => ({
        isScanning: false,
        scannedLocations: updatedScanned,
        discoveredCityIds: keptCityIds,
      }))

      // 4. Reveal 3 nearby cities (at least 1 never-scanned when available)
      get().revealCities(cityId)

      saveProgress(get())
    } catch (error) {
      console.error('scanAndInspect error:', error)
      set((s) => ({
        isScanning: false,
        terminalLines: [...s.terminalLines,
          { text: `> !! SCAN FAILED: ${error.message}`, color: 'red', type: 'alert' },
        ],
      }))
    }
  },

  selectCity: async (cityId) => {
    // Resolve the real blockchain chainId from the unique city id
    const cityPoolEntry = CITY_POOL_MAP[cityId]
    const chainId = cityPoolEntry?.chainId || cityId

    set({ currentCityId: cityId, currentChainId: chainId, gameplayLoading: true, currentLocationIdx: null, cityViewTab: 'overview' })

    try {
      const realChainId = resolveChainId(chainId)
      const [cityInfo, locations, anomalyTxRefs, suspectWallets] = await Promise.all([
        getCityNodeInfo(realChainId),
        getCityNodeLocations(realChainId),
        getCityNodeAnomalyTxRefs(realChainId),
        getCityNodeSuspectWallets(realChainId),
      ])

      // Restore saved location states (inspected/scanned) from localStorage
      const saved = loadProgress()
      if (saved?.cityLocationStates && saved.currentCityId === cityId) {
        locations.forEach((loc, i) => {
          const savedLoc = saved.cityLocationStates[i]
          if (savedLoc) {
            loc.inspected = loc.inspected || savedLoc.inspected
            loc.scanned = loc.scanned || savedLoc.scanned
          }
        })
      }

      // build per-location transactions (normal txs + anomaly flags when Carmen present)
      const { carmenWalletAddress: cwAddr, carmenLocationIdx: cLocIdx } = get()
      // build a lightweight Carmen wallet object for tx generation
      const cwObj = cwAddr ? { address: cwAddr, _missionId: get().missionId || 1 } : null
      locations.forEach((loc, i) => {
        loc.transactions = buildLocationTransactions(cityId, i, anomalyTxRefs, locations.length, cwObj, cLocIdx)
      })

      // Fetch player energy from CityNode
      const playerAddr = get().walletAddress
      let currentEnergy = MAX_ENERGY
      if (playerAddr) {
        try {
          currentEnergy = await getCityNodeEnergy(chainId, playerAddr)
        } catch {
          // fallback to max
        }
      }

      set({
        currentCityInfo: cityInfo,
        cityLocations: locations,
        cityAnomalyTxRefs: anomalyTxRefs,
        citySuspectWallets: suspectWallets,
        gameplayLoading: false,
        energy: { current: currentEnergy, max: MAX_ENERGY },
        ...(currentEnergy < MAX_ENERGY ? {
          energyNextRegen: Date.now() + ENERGY_REGEN_INTERVAL * 1000,
        } : { energyNextRegen: null }),
        ...(saved?.scannedLocations ? { scannedLocations: saved.scannedLocations } : {}),
        ...(saved?.blocksElapsed ? { blocksElapsed: saved.blocksElapsed } : {}),
      })

      // Start energy polling (every 30s)
      const prevPollId = get()._energyPollInterval
      if (prevPollId) clearInterval(prevPollId)
      const energyPollId = setInterval(async () => {
        const addr = get().walletAddress
        const cId = get().currentCityId
        if (!addr || !cId) return
        try {
          const e = await getCityNodeEnergy(cId, addr)
          const prev = get().energy
          set({
            energy: { current: e, max: MAX_ENERGY },
            ...(e < MAX_ENERGY ? {
              energyNextRegen: Date.now() + ENERGY_REGEN_INTERVAL * 1000,
            } : { energyNextRegen: null }),
          })
          // Terminal feedback when energy regenerates
          if (e > prev.current) {
            set((s) => ({
              terminalLines: [...s.terminalLines,
                { text: `> ENERGY REGENERATED: ${e}/${MAX_ENERGY}`, color: 'cyan', type: 'system' },
              ],
            }))
          }
        } catch { /* ignore */ }
      }, 30000)
      set({ _energyPollInterval: energyPollId })

      const city = CITY_MAP[chainId]
      set((s) => ({
        terminalLines: [...s.terminalLines,
          { text: '', color: 'muted', type: 'system' },
          { text: `> NAVIGATING TO: ${city?.name || 'Unknown'} [${city?.chain || chainId}]`, color: 'cyan', type: 'action' },
          { text: `> Suspicion level: ${cityInfo.suspicionLevel}%`, color: 'yellow', type: 'alert' },
          { text: `> ${locations.length} locations discovered. Blocks: ${s.blocksElapsed}`, color: 'green', type: 'system' },
        ],
      }))

      // Set up CityNode event listeners for real-time updates
      const { _cityNodeUnsub } = get()
      if (_cityNodeUnsub) _cityNodeUnsub()
      if (playerAddr) {
        const unsub = await onCityNodeEvents(realChainId, playerAddr, {
          onClueUnlocked: ({ idx, clueIndex }) => {
            const CLUE_NAMES = ["BEHAVIOR_FINGERPRINT", "RELATIONSHIP", "IDENTITY_COMMIT", "FUNDING_TRAIL", "TECHNICAL_SIGNATURE", "DEAD_END"]
            set((s) => ({
              terminalLines: [...s.terminalLines,
                { text: `> [EVENT] Clue unlocked at location ${idx}, slot ${clueIndex}`, color: 'green', type: 'system' },
              ],
            }))
          },
        })
        set({ _cityNodeUnsub: unsub })
      }
    } catch (error) {
      console.error('selectCity error:', error)
      set({ gameplayLoading: false })
    }
  },

  /**
   * Initialize city discovery for a mission.
   * Home city (Santiago) is always fully enabled.
   * Two additional plausible cities are revealed immediately.
   */
  initDiscovery: async (missionId) => {
    // scripted route overrides home city and initial reveals
    const route = getActiveRoute()
    const HOME_CITY_ID = route ? route.homeCityId : 80002

    // try restoring from localStorage first
    const saved = loadProgress()
    if (saved?.discoveredCityIds?.length > 0) {
      // ensure home city is always discovered + scanned even in restored sessions
      const restoredDiscovered = saved.discoveredCityIds.includes(HOME_CITY_ID)
        ? saved.discoveredCityIds
        : [HOME_CITY_ID, ...saved.discoveredCityIds]
      const restoredScanned = saved.scannedLocations?.includes(HOME_CITY_ID)
        ? saved.scannedLocations
        : [...(saved.scannedLocations || []), HOME_CITY_ID]

      set({
        discoveredCityIds: restoredDiscovered,
        visitedCityIds: saved.visitedCityIds || [],
        cityTrail: saved.cityTrail || [],
        discoveryScanCount: saved.discoveryScanCount || 0,
        scannedLocations: restoredScanned,
      })
      return
    }

    // initialize Carmen wallet for this mission
    const mId = missionId || 1
    if (route) {
      // scripted route: use fixed wallet address
      const carmenLocIdx = getCarmenLocationIdx(mId, 3)
      set({ carmenWalletAddress: route.carmenWallet, carmenLocationIdx: carmenLocIdx })
    } else {
      // default: deterministic wallet from missionId
      const carmenW = getCarmenWallet(mId)
      const carmenLocIdx = getCarmenLocationIdx(mId, 3) // 3 locations per city
      set({ carmenWalletAddress: carmenW.address, carmenLocationIdx: carmenLocIdx })
    }

    // home city is the starting point (player's origin)
    const homeCity = CITY_POOL_MAP[HOME_CITY_ID]

    // reveal initial cities
    let revealedIds
    if (route) {
      // scripted route: reveal the next 2 path cities + 1 distraction
      const pathCities = route.path.slice(1) // skip home city
      const distractionPool = pickRevealedCities(mId, 0, route.path, route.homeCityId, [])
      const distraction = distractionPool.length > 0 ? [distractionPool[0].id] : []
      revealedIds = [...pathCities, ...distraction]
    } else {
      const initialRevealed = pickRevealedCities(mId, 0, [HOME_CITY_ID], HOME_CITY_ID, [])
      revealedIds = initialRevealed.map((c) => c.id)
    }

    const revealLines = revealedIds.map((id) => {
      const c = CITY_POOL_MAP[id]
      return c
        ? { text: `> INTEL: Suspicious activity detected in ${c.name} (${c.chain})`, color: 'green', type: 'alert' }
        : null
    }).filter(Boolean)

    set((s) => ({
      discoveredCityIds: [HOME_CITY_ID, ...revealedIds],
      visitedCityIds: [],
      cityTrail: [HOME_CITY_ID],
      discoveryScanCount: 1, // count the initial reveal
      // home city is fully scanned — known territory
      scannedLocations: [...s.scannedLocations, HOME_CITY_ID],
      terminalLines: [...s.terminalLines,
        { text: `> HOME BASE: ${homeCity?.name || 'Santiago'} (${homeCity?.chain || 'Polygon Amoy'}) — network fully mapped.`, color: 'cyan', type: 'system' },
        { text: '> Local contacts provide 100% network coverage here.', color: 'green', type: 'system' },
        ...revealLines,
      ],
    }))
  },

  /**
   * Reveal 3 nearby cities after a scan.
   * Proximity-sorted from originCityId. Guarantees at least 1 never-scanned city.
   * @param {number|null} originCityId - city the player just scanned (proximity anchor)
   */
  revealCities: (originCityId = null) => {
    const { missionId, discoveryScanCount, discoveredCityIds, visitedCityIds, scannedLocations } = get()
    // exclude cities already visible on the map — scanned cities are OK to re-reveal (proximity revisit)
    const excludeIds = [...new Set([...discoveredCityIds, ...visitedCityIds])]
    let newCities = pickRevealedCities(missionId || 1, discoveryScanCount, excludeIds, originCityId, scannedLocations)

    // scripted route: ensure next path city is always among revealed cities
    const _revealRoute = getActiveRoute()
    if (_revealRoute) {
      const undiscovered = _revealRoute.path.filter((id) => !excludeIds.includes(id))
      if (undiscovered.length > 0) {
        const mustReveal = undiscovered[0]
        const alreadyIncluded = newCities.some((c) => c.id === mustReveal)
        if (!alreadyIncluded && CITY_POOL_MAP[mustReveal]) {
          // replace the last revealed city with the path city
          if (newCities.length > 0) newCities[newCities.length - 1] = CITY_POOL_MAP[mustReveal]
          else newCities = [CITY_POOL_MAP[mustReveal]]
        }
      }
    }

    if (newCities.length === 0) return

    const newIds = newCities.map((c) => c.id)
    const newLines = newCities.map((c) => ({
      text: `> INTEL RECEIVED: New network detected in ${c.name} (${c.chain})`,
      color: 'green',
      type: 'alert',
    }))

    set((s) => ({
      discoveredCityIds: [...s.discoveredCityIds, ...newIds],
      discoveryScanCount: s.discoveryScanCount + 1,
      terminalLines: [...s.terminalLines, ...newLines],
    }))
  },

  /**
   * Travel to a discovered city.
   * Current city becomes visited, old visited cities are removed from discovered.
   */
  travelToCity: async (cityId) => {
    const { currentCityId, discoveredCityIds, visitedCityIds, cityTrail } = get()
    if (!discoveredCityIds.includes(cityId)) return

    const newVisited = currentCityId ? [...visitedCityIds, currentCityId] : visitedCityIds
    const newTrail = [...cityTrail, cityId]

    // keep: current target + the last visited city visible
    // remove cities visited before the last one from discoveredCityIds
    const lastVisited = newVisited.length > 0 ? newVisited[newVisited.length - 1] : null
    const keepIds = new Set(discoveredCityIds.filter((id) => {
      if (id === cityId) return true // target city
      if (id === lastVisited) return true // last visited
      if (!newVisited.includes(id)) return true // not visited = still available
      return false
    }))

    set({
      discoveredCityIds: [...keepIds],
      visitedCityIds: newVisited,
      cityTrail: newTrail,
    })

    // load the new city data
    await get().selectCity(cityId)
    const locCount = get().cityLocations.length || 3
    const startIdx = Math.floor(Math.random() * locCount)
    get().selectLocation(startIdx)

    const cityData = CITY_POOL_MAP[cityId]
    set((s) => ({
      terminalLines: [...s.terminalLines,
        { text: '', color: 'muted', type: 'system' },
        { text: `> TRAVELING TO: ${cityData?.name || 'Unknown'} [${cityData?.chain || 'Unknown'}]`, color: 'cyan', type: 'action' },
        { text: '> Network connection established.', color: 'green', type: 'system' },
      ],
    }))

    saveProgress(get())
  },

  backToMap: () => {
    const { _cityNodeUnsub } = get()
    if (_cityNodeUnsub) _cityNodeUnsub()
    set({
      currentCityId: null,
      currentChainId: null,
      currentCityInfo: null,
      cityLocations: [],
      cityAnomalyTxRefs: [],
      citySuspectWallets: [],
      cityEvidence: [],
      currentLocationIdx: null,
      cityViewTab: 'overview',
      _cityNodeUnsub: null,
    })
  },

  // go back to the city location panel (keeps city state, clears location selection)
  backToCityPanel: () => {
    set({ currentLocationIdx: null })
  },

  selectLocation: (idx) => {
    set({ currentLocationIdx: idx })
    saveProgress(get())
  },

  clearLocation: () => {
    set({ currentLocationIdx: null })
  },

  setCityViewTab: (tab) => {
    set({ cityViewTab: tab })
  },

  gameplayInspectLocation: async (locationIdx) => {
    const { currentCityId } = get()
    if (!currentCityId) return
    if (get()._isMissionExpired()) return

    const newBlocks = get()._spendBlocks(1)
    if (newBlocks >= MAX_BLOCKS) return

    set((s) => ({
      terminalLines: [...s.terminalLines,
        { text: '', color: 'muted', type: 'system' },
        { text: `> INSPECT: ${s.cityLocations[locationIdx]?.name || `Location ${locationIdx}`}`, color: 'cyan', type: 'action' },
        { text: `> +1 BLOCK (${newBlocks} total)`, color: 'yellow', type: 'system' },
      ],
    }))

    try {
      const result = await cityNodeInspectLocation(resolveChainId(currentCityId), locationIdx)
      set((s) => ({
        cityLocations: s.cityLocations.map((loc, i) =>
          i === locationIdx ? { ...loc, inspected: true } : loc
        ),
        terminalLines: [...s.terminalLines,
          { text: `> NOTE: ${s.cityLocations[locationIdx]?.description || 'Patterns detected...'}`, color: 'green', type: 'system' },
          { text: `> TX: ${result.hash}`, color: 'muted', type: 'system' },
        ],
      }))
      saveProgress(get())
    } catch (error) {
      set((s) => ({
        terminalLines: [...s.terminalLines,
          { text: `> !! INSPECT FAILED: ${error.message}`, color: 'red', type: 'alert' },
        ],
      }))
    }
  },

  gameplayScanAnomalies: async (locationIdx) => {
    const { currentCityId } = get()
    if (!currentCityId) return
    if (get()._isMissionExpired()) return

    const newBlocks = get()._spendBlocks(3)
    if (newBlocks >= MAX_BLOCKS) return

    set((s) => ({
      terminalLines: [...s.terminalLines,
        { text: `> SCAN ANOMALIES: ${s.cityLocations[locationIdx]?.name}`, color: 'cyan', type: 'action' },
        { text: `> +3 BLOCKS (${newBlocks} total)`, color: 'yellow', type: 'system' },
      ],
    }))

    try {
      const result = await cityNodeScanAnomalies(resolveChainId(currentCityId), locationIdx)
      set((s) => ({
        cityLocations: s.cityLocations.map((loc, i) =>
          i === locationIdx ? { ...loc, scanned: true } : loc
        ),
        terminalLines: [...s.terminalLines,
          { text: `> ANOMALIES FOUND: ${result.anomaliesFound} tx refs linked`, color: 'yellow', type: 'alert' },
          { text: `> SUSPECTS OBSERVED: ${result.suspectsFound} wallets`, color: 'yellow', type: 'alert' },
          { text: `> TX: ${result.hash}`, color: 'muted', type: 'system' },
        ],
      }))

      // refresh anomaly data
      const [anomalyTxRefs, suspectWallets] = await Promise.all([
        getCityNodeAnomalyTxRefs(resolveChainId(currentCityId)),
        getCityNodeSuspectWallets(resolveChainId(currentCityId)),
      ])
      set({ cityAnomalyTxRefs: anomalyTxRefs, citySuspectWallets: suspectWallets })

      // city discovery is handled by scanAndInspect (map-level scan), not here

      saveProgress(get())
    } catch (error) {
      set((s) => ({
        terminalLines: [...s.terminalLines,
          { text: `> !! SCAN FAILED: ${error.message}`, color: 'red', type: 'alert' },
        ],
      }))
    }
  },

  gameplayRequestClue: async (locationIdx) => {
    const state = get()
    const { currentCityId, cityClue, gameplayLoading } = state
    if (!currentCityId) return
    if (gameplayLoading || state.isInvestigating) return
    if (get()._isMissionExpired()) return

    // if city already has a clue, show it directly without a new tx
    const existingClue = cityClue[currentCityId]
    if (existingClue) {
      set({
        showClueModal: true,
        activeClue: existingClue,
      })
      return
    }

    const chainId = resolveChainId(currentCityId)
    const isOnChainCity = VALID_INVESTIGATION_CHAINS.has(chainId)

    set((s) => ({
      terminalLines: [...s.terminalLines,
        { text: `> REQUESTING CITY INTEL${isOnChainCity ? ' via CRE...' : ' (mock)...'}`, color: 'cyan', type: 'action' },
      ],
    }))

    if (isOnChainCity) {
      // on-chain cities: blocks are charged only after TX confirms (inside investigate)
      await get().investigate(currentCityId)
      return
    }

    // non-configured cities: use mock clue — charge blocks here
    const newBlocks = get()._spendBlocks(5)
    if (newBlocks >= MAX_BLOCKS) return

    set((s) => ({
      terminalLines: [...s.terminalLines,
        { text: `> +5 BLOCKS (${newBlocks} total)`, color: 'yellow', type: 'system' },
      ],
    }))

    try {
      set({ gameplayLoading: true })
      const isStartingClue = locationIdx === get().startLocationIdx
      const result = await cityNodeRequestClue(chainId, locationIdx, 0, isStartingClue)
      const isDeadEnd = result.clueType === 'DEAD_END'
      // activeCityClue format matches ClueModal (always rendered at GamePage level)
      const activeCityClue = {
        id: `city-clue-${Date.now()}`,
        locationIdx,
        clueIndex: 0,
        clueType: result.clueType,
        data: result.clueData,
        strength: result.strength,
        anomalyRefId: result.anomalyRefId,
        cityId: currentCityId,
        isDeadEnd,
        timestamp: Date.now(),
      }
      // cityClue cache stores .text for LocationDetail display
      const cacheClue = { id: activeCityClue.id, text: result.clueData, type: 'text', timestamp: Date.now() }
      set((s) => ({
        gameplayLoading: false,
        isInvestigating: false,
        showCityClueModal: true,
        activeCityClue,
        cityEvidence: [...s.cityEvidence, activeCityClue],
        cityClue: { ...s.cityClue, [currentCityId]: cacheClue },
        terminalLines: [...s.terminalLines,
          { text: `> INTEL RECEIVED: ${result.clueType}`, color: 'green', type: 'system' },
          { text: `> ${result.clueData}`, color: 'yellow', type: 'alert' },
        ],
      }))
    } catch (error) {
      set((s) => ({
        gameplayLoading: false,
        terminalLines: [...s.terminalLines,
          { text: `> !! INTEL REQUEST FAILED: ${error.message}`, color: 'red', type: 'alert' },
        ],
      }))
    }
  },

  gameplayFlagTx: async (refId) => {
    const { currentCityId } = get()
    if (!currentCityId) return
    if (get()._isMissionExpired()) return

    const newBlocks = get()._spendBlocks(1)
    if (newBlocks >= MAX_BLOCKS) return

    set((s) => ({
      terminalLines: [...s.terminalLines,
        { text: `> FLAG TX: ref#${refId?.slice(2, 10) || '????'}`, color: 'cyan', type: 'action' },
        { text: `> +1 BLOCK (${newBlocks} total)`, color: 'yellow', type: 'system' },
      ],
    }))

    try {
      await cityNodeFlagTx(resolveChainId(currentCityId), refId)
      set((s) => ({
        terminalLines: [...s.terminalLines,
          { text: '> TX FLAGGED. Added to evidence bundle.', color: 'green', type: 'system' },
        ],
      }))
      saveProgress(get())
    } catch (error) {
      set((s) => ({
        terminalLines: [...s.terminalLines,
          { text: `> !! FLAG FAILED: ${error.message}`, color: 'red', type: 'alert' },
        ],
      }))
    }
  },

  gameplayRequestDossier: async () => {
    const { currentCityId } = get()
    if (!currentCityId) return
    if (get()._isMissionExpired()) return

    const newBlocks = get()._spendBlocks(1)
    if (newBlocks >= MAX_BLOCKS) return

    set((s) => ({
      gameplayLoading: true,
      terminalLines: [...s.terminalLines,
        { text: '> REQUEST DOSSIER: Compiling evidence...', color: 'cyan', type: 'action' },
        { text: `> +1 BLOCK (${newBlocks} total)`, color: 'yellow', type: 'system' },
      ],
    }))

    try {
      const result = await cityNodeRequestDossier(resolveChainId(currentCityId))
      set((s) => ({
        dossierData: result,
        showDossierModal: true,
        gameplayLoading: false,
        terminalLines: [...s.terminalLines,
          { text: `> DOSSIER RESOLVED: Confidence ${result.confidence}%`, color: 'green', type: 'system' },
          { text: `> ${result.summary.slice(0, 80)}...`, color: 'yellow', type: 'alert' },
        ],
      }))
    } catch (error) {
      set((s) => ({
        gameplayLoading: false,
        terminalLines: [...s.terminalLines,
          { text: `> !! DOSSIER FAILED: ${error.message}`, color: 'red', type: 'alert' },
        ],
      }))
    }
  },

  closeDossierModal: () => set({ showDossierModal: false }),

  toggleCaptureMode: () => {
    set((s) => ({
      captureMode: !s.captureMode,
      captureState: 'ready',
      captureResult: null,
      captureSelectedTx: null,
    }))
  },

  setCaptureSelectedTx: (tx) => set({ captureSelectedTx: tx }),

  gameplayRequestCapture: async (suspectWallet) => {
    const { currentCityId } = get()
    if (!currentCityId) return
    // allow capture even past MAX_BLOCKS — the capture itself can exceed the limit
    // only block if mission was explicitly expired before this attempt
    if (get()._isMissionExpired()) return

    const CAPTURE_COST = 30
    const newBlocks = get()._spendBlocks(CAPTURE_COST, { allowExceed: true })

    set((s) => ({
      captureState: 'pending',
      terminalLines: [...s.terminalLines,
        { text: '', color: 'muted', type: 'system' },
        { text: '> ████████████████████████████████████████', color: 'red', type: 'system' },
        { text: `> CAPTURE ATTEMPT: ${suspectWallet}`, color: 'red', type: 'action' },
        { text: `> +${CAPTURE_COST} BLOCKS (${newBlocks} total)`, color: 'yellow', type: 'system' },
        { text: '> Initiating full evidence analysis...', color: 'muted', type: 'system' },
      ],
    }))

    try {
      const result = await cityNodeRequestCapture(resolveChainId(currentCityId), suspectWallet, '0x0')

      if (result.success) {
        set((s) => ({
          captureState: 'success',
          captureResult: result,
          terminalLines: [...s.terminalLines,
            { text: '> ████████████████████████████████████████', color: 'green', type: 'system' },
            { text: '> CARMEN SANDIEGO CAPTURED!', color: 'green', type: 'alert' },
            { text: `> ${result.gmNote}`, color: 'yellow', type: 'alert' },
            { text: '> MissionNFT minted as trophy!', color: 'cyan', type: 'system' },
            { text: '> ████████████████████████████████████████', color: 'green', type: 'system' },
          ],
        }))
      } else {
        set((s) => ({
          captureState: 'fail',
          captureResult: result,
          terminalLines: [...s.terminalLines,
            { text: `> !! CAPTURE RESULT: ${result.reasonCode}`, color: 'red', type: 'alert' },
            { text: `> ${result.gmNote}`, color: 'yellow', type: 'system' },
            { text: '> ████████████████████████████████████████', color: 'red', type: 'system' },
          ],
        }))
        // if blocks exceeded after failed capture, trigger mission failure
        if (get().blocksElapsed >= MAX_BLOCKS) {
          setTimeout(() => {
            set((s) => ({
              captureMode: false,
              showOutcomeModal: true,
              missionOutcome: { type: 'failed' },
              terminalLines: [...s.terminalLines,
                { text: '> !! MISSION EXPIRED — Carmen escaped.', color: 'red', type: 'alert' },
              ],
            }))
          }, 3000)
        }
      }
    } catch (error) {
      set((s) => ({
        captureState: 'fail',
        captureResult: { success: false, reasonCode: 'TX_FAILED', gmNote: error.message },
        terminalLines: [...s.terminalLines,
          { text: `> !! CAPTURE TX FAILED: ${error.message}`, color: 'red', type: 'alert' },
        ],
      }))
    }
  },

  submitWalletCapture: async (walletAddress) => {
    const { missionId } = get()
    if (!missionId || !walletAddress) return

    set((s) => ({
      captureState: 'pending',
      terminalLines: [
        ...s.terminalLines,
        { text: '', color: 'muted', type: 'system' },
        { text: '> ████████████████████████████████████████', color: 'cyan', type: 'system' },
        { text: `> WALLET CAPTURE: ${walletAddress}`, color: 'cyan', type: 'action' },
        { text: '> Submitting reconstructed wallet to GameMaster...', color: 'muted', type: 'system' },
      ],
    }))

    try {
      // Submit investigation on the city where Carmen is — CRE will handle the wallet capture resolution
      // For now, this is stored locally. The CRE workflow or a separate tx would call resolveWalletCapture.
      set((s) => ({
        terminalLines: [
          ...s.terminalLines,
          { text: '> Wallet evidence submitted. Awaiting CRE validation...', color: 'cyan', type: 'system' },
        ],
      }))
    } catch (error) {
      console.error('Wallet capture failed:', error)
      set((s) => ({
        captureState: 'fail',
        captureResult: { success: false, reasonCode: 'TX_FAILED', gmNote: error.message },
        terminalLines: [
          ...s.terminalLines,
          { text: `> !! WALLET CAPTURE FAILED: ${error.message}`, color: 'red', type: 'alert' },
        ],
      }))
    }
  },

  spendGas: (amount) => {
    set((s) => ({
      gas: Math.max(0, s.gas - amount),
      gasFlash: true,
    }))
    setTimeout(() => set({ gasFlash: false }), 800)
  },

  addEvidence: (evidence) =>
    set((s) => ({
      evidence: [...s.evidence, evidence],
    })),

  addTerminalLine: (text, color = 'cyan', type = 'system') =>
    set((s) => ({
      terminalLines: [...s.terminalLines, { text, color, type }],
    })),

  /**
   * Get a rich snapshot of the current game state.
   * Shows exactly which cities are on screen, visited history, current city, and chain distribution.
   */
  getGameStateSnapshot: () => {
    const snapshot = buildGameSnapshot(get())
    console.log('[CARMEN] current game snapshot:', snapshot)
    return snapshot
  },

  /**
   * Load the last saved snapshot from localStorage.
   */
  loadLastSnapshot: () => {
    try {
      const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY)
      if (!raw) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  },
}))

function getRankTitle(rank) {
  const titles = [
    'Detective Rookie',
    'Detective Junior',
    'Detective Senior',
    'Detective Chief',
    'Special Agent',
    'Master Agent',
  ]
  return titles[Math.min(rank, titles.length - 1)]
}
