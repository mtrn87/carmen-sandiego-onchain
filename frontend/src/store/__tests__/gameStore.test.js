import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock contractService
vi.mock('../../services/contractService', () => import('../../test/mocks/contractService'))

// Mock ecies
vi.mock('../../utils/ecies', () => ({
  getPublicKeyHex: vi.fn(async () => '0x04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'),
  decryptClue: vi.fn(async (hex) => `Decrypted: ${hex}`),
}))

describe('gameStore', () => {
  let useGameStore
  let contractMocks

  beforeEach(async () => {
    vi.resetModules()
    const storeModule = await import('../../store/gameStore.js')
    useGameStore = storeModule.useGameStore
    contractMocks = await import('../../services/contractService')

    // Reset store to initial state
    useGameStore.setState({
      walletAddress: null,
      isConnected: false,
      player: null,
      missionId: null,
      missionData: null,
      currentPlot: null,
      showPlotModal: false,
      lastKnownLocation: null,
      isRegistered: false,
      clues: [],
      evidence: [],
      terminalLines: [],
      isInvestigating: false,
      briefingDone: false,
      gas: 100,
      scannedLocations: [],
      _unsubscribers: [],
      rank: 0,
      rankTitle: 'Detective Rookie',
      currentMission: null,
      carmenWalletAddress: null,
      carmenLocationIdx: null,
    })

    localStorage.clear()

    vi.clearAllMocks()
  })

  // ============================================================
  //  Auth
  // ============================================================

  describe('Auth actions', () => {
    it('connectWallet sets address and isConnected', () => {
      const { connectWallet } = useGameStore.getState()
      connectWallet('0x1234567890abcdef1234567890abcdef12345678')
      const state = useGameStore.getState()
      expect(state.walletAddress).toBe('0x1234567890abcdef1234567890abcdef12345678')
      expect(state.isConnected).toBe(true)
    })

    it('disconnectWallet clears state and calls unsubscribers', () => {
      const unsub = vi.fn()
      useGameStore.setState({
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        isConnected: true,
        missionId: 1,
        isRegistered: true,
        _unsubscribers: [unsub],
      })

      const { disconnectWallet } = useGameStore.getState()
      disconnectWallet()

      expect(unsub).toHaveBeenCalled()
      const state = useGameStore.getState()
      expect(state.walletAddress).toBeNull()
      expect(state.isConnected).toBe(false)
      expect(state.missionId).toBeNull()
      expect(state.isRegistered).toBe(false)
    })
  })

  // ============================================================
  //  initGame
  // ============================================================

  describe('initGame', () => {
    it('does nothing if no walletAddress', async () => {
      const { initGame } = useGameStore.getState()
      await initGame()
      expect(contractMocks.isPlayerRegistered).not.toHaveBeenCalled()
    })

    it('checks registration and sets isRegistered', async () => {
      useGameStore.setState({ walletAddress: '0x1234567890abcdef1234567890abcdef12345678' })
      contractMocks.isPlayerRegistered.mockResolvedValueOnce(true)
      contractMocks.getPlayerActiveMission.mockResolvedValueOnce(0n)

      const { initGame } = useGameStore.getState()
      await initGame()

      expect(contractMocks.isPlayerRegistered).toHaveBeenCalledWith('0x1234567890abcdef1234567890abcdef12345678')
      expect(useGameStore.getState().isRegistered).toBe(true)
    })

    it('loads mission state if active mission exists', async () => {
      useGameStore.setState({ walletAddress: '0x1234567890abcdef1234567890abcdef12345678' })
      contractMocks.isPlayerRegistered.mockResolvedValueOnce(true)
      contractMocks.getPlayerActiveMission.mockResolvedValueOnce(5n)
      contractMocks.getMission.mockResolvedValueOnce({
        player: '0x1234567890abcdef1234567890abcdef12345678', startBlock: 100n, targetHash: '0xhash',
        cluesReceived: 1, investigationsCount: 1, status: 1,
      })
      contractMocks.getMissionClues.mockResolvedValueOnce([])
      contractMocks.getBlocksUsed.mockResolvedValueOnce(10)

      const { initGame } = useGameStore.getState()
      await initGame()

      const state = useGameStore.getState()
      expect(state.missionId).toBe(5)
      // briefingDone stays false — completeBriefing sets it when user clicks CONTINUE
      expect(state.briefingDone).toBe(false)
      expect(state.currentMission.status).toBe('active')
    })
  })

  // ============================================================
  //  completeBriefing
  // ============================================================

  describe('completeBriefing', () => {
    beforeEach(() => {
      useGameStore.setState({ walletAddress: '0x1234567890abcdef1234567890abcdef12345678', isRegistered: false })
    })

    it('resumes existing mission without calling startMission', async () => {
      // Simulate initGame having already loaded mission data
      useGameStore.setState({ isRegistered: true, missionId: 3, missionData: { status: 1 } })

      const { completeBriefing } = useGameStore.getState()
      await completeBriefing()

      expect(contractMocks.startMission).not.toHaveBeenCalled()
      expect(useGameStore.getState().briefingDone).toBe(true)
    })

    it('fetches active mission and sets briefingDone when not registered', async () => {
      contractMocks.getPlayerActiveMission.mockResolvedValueOnce(1n)
      contractMocks.getMission.mockResolvedValueOnce({
        player: '0x1234567890abcdef1234567890abcdef12345678', startBlock: 100n, targetHash: '0xhash',
        cluesReceived: 0, investigationsCount: 0, status: 1,
      })

      const { completeBriefing } = useGameStore.getState()
      await completeBriefing()

      // completeBriefing no longer registers or starts missions (moved to LoginPage)
      expect(contractMocks.registerPlayer).not.toHaveBeenCalled()
      expect(contractMocks.startMission).not.toHaveBeenCalled()
      expect(useGameStore.getState().briefingDone).toBe(true)
    })

    it('enters briefing with existing mission when already registered', async () => {
      useGameStore.setState({ isRegistered: true })
      contractMocks.getPlayerActiveMission.mockResolvedValueOnce(1n)
      contractMocks.getMission.mockResolvedValueOnce({
        player: '0x1234567890abcdef1234567890abcdef12345678', startBlock: 100n, targetHash: '0xhash',
        cluesReceived: 0, investigationsCount: 0, status: 1,
      })

      const { completeBriefing } = useGameStore.getState()
      await completeBriefing()

      expect(contractMocks.registerPlayer).not.toHaveBeenCalled()
      expect(contractMocks.startMission).not.toHaveBeenCalled()
      expect(useGameStore.getState().briefingDone).toBe(true)
    })

    it('adds error terminal line on failure', async () => {
      contractMocks.ensureSepoliaNetwork.mockRejectedValueOnce(new Error('Network fail'))

      const { completeBriefing } = useGameStore.getState()
      await completeBriefing()

      const lines = useGameStore.getState().terminalLines
      const errorLine = lines.find((l) => l.color === 'red')
      expect(errorLine).toBeDefined()
      expect(errorLine.text).toContain('Network fail')
    })
  })

  // ============================================================
  //  plot persistence
  // ============================================================

  describe('mission plot persistence', () => {
    it('hydrates and persists plot for active mission', () => {
      useGameStore.setState({ missionId: 2 })
      const { hydrateMissionPlot } = useGameStore.getState()

      const plot = hydrateMissionPlot(2)

      expect(plot).toBeTruthy()
      expect(plot.missionId).toBe(2)
      expect(plot.title).toBe('The Stolen Bored Ape')

      const raw = localStorage.getItem('carmen_current_mission_plot')
      expect(raw).toBeTruthy()
      expect(JSON.parse(raw).missionId).toBe(2)
    })

    it('opens mission plot modal for current mission', () => {
      useGameStore.setState({
        missionId: 1,
        currentPlot: {
          missionId: 1,
          scenarioId: 'heist-of-cryptopunk',
          title: 'The Heist of the Lost CryptoPunk',
          briefing: 'Test briefing',
          cities: {},
        },
      })

      const { openMissionPlotModal } = useGameStore.getState()
      openMissionPlotModal()

      const state = useGameStore.getState()
      expect(state.showPlotModal).toBe(true)
    })
  })

  // ============================================================
  //  investigate
  // ============================================================

  describe('investigate', () => {
    it('sends submitInvestigation with chainId and marks location', async () => {
      useGameStore.setState({ walletAddress: '0x1234567890abcdef1234567890abcdef12345678', isInvestigating: false })

      const { investigate } = useGameStore.getState()
      await investigate(421614)

      expect(contractMocks.submitInvestigation).toHaveBeenCalledWith(421614)
      const state = useGameStore.getState()
      const tokyo = state.locations.find((l) => l.id === 421614)
      expect(tokyo.investigated).toBe(true)
    })

    it('does nothing if already investigating', async () => {
      useGameStore.setState({ isInvestigating: true })

      const { investigate } = useGameStore.getState()
      await investigate(421614)

      expect(contractMocks.submitInvestigation).not.toHaveBeenCalled()
    })

    it('handles tx failure gracefully', async () => {
      useGameStore.setState({ isInvestigating: false })
      contractMocks.submitInvestigation.mockRejectedValueOnce(new Error('Insufficient funds'))

      const { investigate } = useGameStore.getState()
      await investigate(84532)

      const state = useGameStore.getState()
      expect(state.isInvestigating).toBe(false)
      const errorLine = state.terminalLines.find((l) => l.color === 'red')
      expect(errorLine.text).toContain('Insufficient funds')
    })
  })

  // ============================================================
  //  scanLocation (UI-only)
  // ============================================================

  describe('scanLocation', () => {
    it('spends gas and adds location to scanned list', () => {
      const { scanLocation } = useGameStore.getState()
      scanLocation(421614, 30)

      const state = useGameStore.getState()
      expect(state.gas).toBe(70)
      expect(state.isScanning).toBe(true)
    })

    it('refuses scan when insufficient gas', () => {
      useGameStore.setState({ gas: 10 })

      const { scanLocation } = useGameStore.getState()
      scanLocation(421614, 30)

      const state = useGameStore.getState()
      expect(state.gas).toBe(10) // unchanged
      const errorLine = state.terminalLines.find((l) => l.text.includes('INSUFFICIENT'))
      expect(errorLine).toBeDefined()
    })

    it('refuses duplicate scan', () => {
      useGameStore.setState({ scannedLocations: [421614] })

      const { scanLocation } = useGameStore.getState()
      scanLocation(421614, 30)

      expect(useGameStore.getState().gas).toBe(100) // unchanged
    })
  })

  // ============================================================
  //  UI helpers
  // ============================================================

  describe('UI helpers', () => {
    it('addTerminalLine appends to terminal', () => {
      const { addTerminalLine } = useGameStore.getState()
      addTerminalLine('test message', 'green', 'system')

      const lines = useGameStore.getState().terminalLines
      expect(lines).toHaveLength(1)
      expect(lines[0]).toEqual({ text: 'test message', color: 'green', type: 'system' })
    })

    it('closeClueModal clears activeClue', () => {
      useGameStore.setState({ showClueModal: true, activeClue: { text: 'clue' } })

      const { closeClueModal } = useGameStore.getState()
      closeClueModal()

      expect(useGameStore.getState().showClueModal).toBe(false)
      expect(useGameStore.getState().activeClue).toBeNull()
    })

  })
})
