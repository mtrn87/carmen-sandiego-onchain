import { create } from 'zustand'
import {
  registerPlayer as registerPlayerOnChain,
  isPlayerRegistered,
  getPlayerActiveMission,
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
  ensureSepoliaNetwork,
  getSigner,
  CITY_MAP,
} from '../services/contractService'
import { getPublicKeyHex, decryptClue } from '../utils/ecies'

// ============================================================
//  City locations derived from real chain IDs
// ============================================================

const CITY_LOCATIONS = [
  {
    id: 421614,
    name: 'Tokyo',
    chain: 'Arbitrum Sepolia',
    chainColor: '#28a0f0',
    type: 'staking',
    description: 'A yield staking vault on Arbitrum. An unusual amount of tokens was locked recently from an unknown address.',
    coords: { x: 78, y: 55 },
    investigated: false,
    connections: [84532],
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
    name: 'London',
    chain: 'XDC Apothem',
    chainColor: '#ff6b00',
    type: 'bridge',
    description: 'A cross-chain bridge on XDC. One high-value transfer stands out among recent activity.',
    coords: { x: 55, y: 35 },
    investigated: false,
    connections: [421614],
  },
]

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
  evidence: [],
  scannedLocations: [],
  isScanning: false,
  briefingDone: false,
  tourActive: false,
  tourStep: 0,
  currentCase: null,
  terminalLines: [],
  isInvestigating: false,
  showClueModal: false,
  activeClue: null,

  // on-chain events for ContractExplorer
  missionEvents: [],

  // mission outcome modal
  showOutcomeModal: false,
  missionOutcome: null, // { type: 'captured'|'failed', blocksUsed, reward, rewardLabel, newRank }

  // block counter
  blocksElapsed: 0,
  carmenMovedAlert: false,
  _blockPollInterval: null,

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
      await ensureSepoliaNetwork()

      // Use actual signer address (may differ from Privy walletAddress)
      const signer = await getSigner()
      const signerAddr = await signer.getAddress()
      console.log('[initGame] walletAddress (store):', walletAddress)
      console.log('[initGame] signerAddress (actual):', signerAddr)
      if (signerAddr.toLowerCase() !== walletAddress.toLowerCase()) {
        console.warn('[initGame] ADDRESS MISMATCH — updating store to signer address')
        set({ walletAddress: signerAddr })
      }
      const queryAddr = signerAddr

      // Check registration
      const registered = await isPlayerRegistered(queryAddr)
      set({ isRegistered: registered })

      // Check active mission
      const activeMissionId = await getPlayerActiveMission(queryAddr)
      if (activeMissionId > 0n) {
        const state = get()
        await state.loadMissionState(Number(activeMissionId))
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

      set({
        missionId,
        missionData: mission,
        missionEvents: events,
        currentMission: {
          id: `mission-${missionId}`,
          title: `Mission #${missionId}`,
          description: `Track Carmen Sandiego across the blockchain. ${blocksUsed} blocks elapsed.`,
          status: statusMap[mission.status] || 'active',
        },
        clues: decryptedClues,
        // Don't set briefingDone here — let completeBriefing handle it
        // so the user always sees the briefing screen on new sessions
      })

      // Set up event listeners
      const state = get()
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

    // Poll blocks elapsed every 12s (~ 1 Sepolia block)
    try {
      const blocks = await getBlocksUsed(missionId)
      set({ blocksElapsed: blocks })
    } catch (_) { /* ignore initial fetch error */ }

    const pollId = setInterval(async () => {
      try {
        const blocks = await getBlocksUsed(missionId)
        set({ blocksElapsed: blocks })
      } catch (_) { /* ignore poll error */ }
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

          set((s) => ({
            isInvestigating: false,
            clues: [...s.clues, newClue],
            activeClue: newClue,
            showClueModal: true,
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

      // Listen for mission failure
      const unsubFail = await onMissionFailed(missionId, () => {
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

      set({ _unsubscribers: newUnsubs })
    } catch (error) {
      console.error('Event listener setup failed:', error)
    }
  },

  // ============================================================
  //  Game actions
  // ============================================================

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
      await ensureSepoliaNetwork()
      const receipt = await submitInvestigationOnChain(chainId)

      // Safety timeout: if CRE doesn't respond within 90s, unlock the UI
      const timeoutId = setTimeout(() => {
        if (get().isInvestigating) {
          set((s) => ({
            isInvestigating: false,
            _investigateTimeoutId: null,
            terminalLines: [
              ...s.terminalLines,
              { text: '> !! CRE TIMEOUT — no response after 90s.', color: 'red', type: 'alert' },
              { text: '> You may investigate again.', color: 'yellow', type: 'system' },
            ],
          }))
        }
      }, 90_000)
      set({ _investigateTimeoutId: timeoutId })

      set((s) => ({
        locations: s.locations.map((l) =>
          l.id === chainId ? { ...l, investigated: true } : l
        ),
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
          { text: '> Waiting for CRE workflow response...', color: 'cyan', type: 'system' },
        ],
      }))

      // Clue will arrive via ClueReceived event listener
      // isInvestigating stays true until clue arrives or timeout fires
    } catch (error) {
      console.error('Investigation failed:', error)
      set((s) => ({
        isInvestigating: false,
        terminalLines: [
          ...s.terminalLines,
          { text: `> !! TX FAILED: ${error.reason || error.message}`, color: 'red', type: 'alert' },
        ],
      }))
    }
  },

  /**
   * Complete briefing: register player on-chain + start mission.
   * If there's already an active mission (loaded by initGame), resumes it
   * without sending a new startMission TX.
   */
  completeBriefing: async () => {
    const { walletAddress, isRegistered, missionId: existingMissionId } = get()

    console.log('[completeBriefing] START', { walletAddress, isRegistered, existingMissionId })

    set((s) => ({
      terminalLines: [
        { text: '> ACME MAINFRAME :: INITIALIZING MISSION', color: 'cyan', type: 'system' },
        { text: '> Agent connected. Welcome, Detective.', color: 'green', type: 'system' },
      ],
    }))

    try {
      console.log('[completeBriefing] Ensuring Sepolia network...')
      await ensureSepoliaNetwork()
      console.log('[completeBriefing] Network OK')

      // If initGame already loaded an active mission, just resume it
      if (existingMissionId) {
        console.log('[completeBriefing] Resuming existing mission #', existingMissionId)

        set({
          briefingDone: true,
          tourActive: true,
          tourStep: 0,
        })

        // Set up event listeners
        const state = get()
        await state._setupEventListeners(existingMissionId)

        set((s) => ({
          terminalLines: [
            ...s.terminalLines,
            { text: `> RESUMING MISSION #${existingMissionId}. Carmen's location committed.`, color: 'yellow', type: 'alert' },
            { text: '> Use the MAP to investigate cities and find clues.', color: 'green', type: 'help' },
          ],
        }))

        console.log('[completeBriefing] DONE (resumed)')
        return
      }

      // Register player with ECIES public key if not already registered
      if (!isRegistered) {
        console.log('[completeBriefing] Not registered, generating ECIES keys...')
        set((s) => ({
          terminalLines: [
            ...s.terminalLines,
            { text: '> Generating ECIES encryption keys...', color: 'muted', type: 'system' },
          ],
        }))

        const publicKeyHex = await getPublicKeyHex()
        console.log('[completeBriefing] ECIES pubkey:', publicKeyHex.slice(0, 20) + '...')

        set((s) => ({
          terminalLines: [
            ...s.terminalLines,
            { text: '> Registering agent on-chain...', color: 'muted', type: 'system' },
          ],
        }))

        console.log('[completeBriefing] Calling registerPlayer...')
        const regReceipt = await registerPlayerOnChain(publicKeyHex)
        console.log('[completeBriefing] registerPlayer TX:', regReceipt?.hash)

        set((s) => ({
          isRegistered: true,
          terminalLines: [
            ...s.terminalLines,
            { text: '> AGENT REGISTERED. Public key stored on-chain.', color: 'green', type: 'system' },
          ],
        }))
      } else {
        console.log('[completeBriefing] Already registered, skipping')
      }

      // Start mission (triggers VRF)
      console.log('[completeBriefing] Calling startMission...')
      set((s) => ({
        terminalLines: [
          ...s.terminalLines,
          { text: '> Starting new mission (requesting VRF randomness)...', color: 'muted', type: 'system' },
        ],
      }))

      const receipt = await startMissionOnChain()
      console.log('[completeBriefing] startMission TX:', receipt?.hash)
      console.log('[completeBriefing] TX status:', receipt?.status, '(1=success, 0=reverted)')

      if (receipt?.status === 0) {
        console.error('[completeBriefing] TX REVERTED on-chain!')
        set((s) => ({
          terminalLines: [
            ...s.terminalLines,
            { text: '> !! TX REVERTED — startMission failed on-chain.', color: 'red', type: 'alert' },
          ],
        }))
        return
      }

      set((s) => ({
        terminalLines: [
          ...s.terminalLines,
          { text: `> MISSION TX CONFIRMED: ${receipt.hash}`, color: 'green', type: 'system' },
          { text: '> Awaiting VRF callback for target location...', color: 'cyan', type: 'system' },
        ],
      }))

      // Fetch the newly created mission — use signer address
      const signer = await getSigner()
      const signerAddress = await signer.getAddress()
      console.log('[completeBriefing] walletAddress (store):', walletAddress)
      console.log('[completeBriefing] signerAddress (actual):', signerAddress)

      const queryAddress = signerAddress || walletAddress
      console.log('[completeBriefing] Fetching active mission ID for:', queryAddress)
      const activeMissionId = await getPlayerActiveMission(queryAddress)
      console.log('[completeBriefing] Active mission ID:', activeMissionId?.toString())

      if (activeMissionId > 0n) {
        const missionId = Number(activeMissionId)
        console.log('[completeBriefing] Loading mission data for #', missionId)
        const mission = await getMission(missionId)
        console.log('[completeBriefing] Mission data:', mission)

        set({
          missionId,
          missionData: mission,
          briefingDone: true,
          tourActive: true,
          tourStep: 0,
          clues: [],
          evidence: [],
          currentMission: {
            id: `mission-${missionId}`,
            title: `Mission #${missionId}`,
            description: 'Track Carmen Sandiego across the blockchain.',
            status: 'active',
          },
        })

        // Set up event listeners
        console.log('[completeBriefing] Setting up event listeners...')
        const state = get()
        await state._setupEventListeners(missionId)
        console.log('[completeBriefing] Event listeners ready')

        set((s) => ({
          terminalLines: [
            ...s.terminalLines,
            { text: `> MISSION #${missionId} ACTIVE. Carmen's location committed.`, color: 'yellow', type: 'alert' },
            { text: '> Use the MAP to investigate cities and find clues.', color: 'green', type: 'help' },
          ],
        }))
      } else {
        console.warn('[completeBriefing] No active mission found after startMission!')
      }

      console.log('[completeBriefing] DONE')
    } catch (error) {
      console.error('[completeBriefing] FAILED:', error)
      console.error('[completeBriefing] Error details:', {
        message: error.message,
        reason: error.reason,
        code: error.code,
        data: error.data,
      })
      set((s) => ({
        terminalLines: [
          ...s.terminalLines,
          { text: `> !! ERROR: ${error.reason || error.message}`, color: 'red', type: 'alert' },
          { text: '> Please check your wallet and try again.', color: 'yellow', type: 'system' },
        ],
      }))
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
  closeOutcomeModal: () => set({ showOutcomeModal: false }),

  /**
   * Start a new mission after completion or failure.
   * Resets game state and goes back to briefing flow.
   */
  startNewMission: async () => {
    const { _unsubscribers, _blockPollInterval } = get()
    _unsubscribers.forEach((unsub) => unsub())
    if (_blockPollInterval) clearInterval(_blockPollInterval)

    set({
      missionId: null,
      missionData: null,
      missionEvents: [],
      clues: [],
      evidence: [],
      locations: CITY_LOCATIONS,
      scannedLocations: [],
      briefingDone: false,
      isInvestigating: false,
      showClueModal: false,
      activeClue: null,
      showOutcomeModal: false,
      missionOutcome: null,
      currentMission: null,
      gas: 100,
      blocksElapsed: 0,
      carmenMovedAlert: false,
      _blockPollInterval: null,
      _unsubscribers: [],
      terminalLines: [
        { text: '> MISSION RESET. Preparing new assignment...', color: 'cyan', type: 'system' },
      ],
    })
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
