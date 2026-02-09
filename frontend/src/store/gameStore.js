import { create } from 'zustand'

const LOCATIONS = [
  {
    id: 'defi-bnb',
    name: 'DeFi Lending Protocol',
    chain: 'BNB Chain',
    chainColor: '#F0B90B',
    type: 'defi',
    description: 'A decentralized lending protocol with billions in TVL. Suspicious flash loan activity detected.',
    coords: { x: 25, y: 30 },
    investigated: false,
    connections: ['nft-polygon'],
  },
  {
    id: 'nft-polygon',
    name: 'NFT Marketplace',
    chain: 'Polygon Amoy',
    chainColor: '#8247e5',
    type: 'nft',
    description: 'A bustling digital art marketplace. Rare collections with anomalous pricing patterns.',
    coords: { x: 60, y: 25 },
    investigated: false,
    connections: ['staking-arbitrum', 'dao-base'],
  },
  {
    id: 'staking-arbitrum',
    name: 'Staking Contract',
    chain: 'Arbitrum Sepolia',
    chainColor: '#28a0f0',
    type: 'staking',
    description: 'A yield staking vault. An unusual amount of tokens was locked recently from an unknown address.',
    coords: { x: 78, y: 55 },
    investigated: false,
    connections: ['bridge-cross'],
  },
  {
    id: 'dao-base',
    name: 'DAO Governance',
    chain: 'Base Testnet',
    chainColor: '#0052ff',
    type: 'dao',
    description: 'A governance forum for a major DAO. A proposal was submitted by a suspicious new member.',
    coords: { x: 40, y: 60 },
    investigated: false,
    connections: ['staking-arbitrum'],
  },
  {
    id: 'bridge-cross',
    name: 'Cross-Chain Bridge',
    chain: 'Multi-Chain',
    chainColor: '#ff6b00',
    type: 'bridge',
    description: 'A cross-chain bridge with recent high-value transfers. One transaction stands out.',
    coords: { x: 55, y: 80 },
    investigated: false,
    connections: ['defi-bnb'],
  },
]

const MOCK_CLUES = [
  {
    id: 'clue-1',
    locationId: 'defi-bnb',
    text: 'Carmen left a subtle trace in the digital vault. She manipulated a flash loan of negligible value — 0.0001 USDC in an obscure liquidity pool.',
    type: 'audio',
    timestamp: Date.now() - 300000,
    decrypted: true,
  },
]

const MOCK_EVIDENCE = []

export const useGameStore = create((set, get) => ({
  // auth
  player: null,
  walletAddress: null,
  isConnected: false,

  // gas
  gas: 100,
  gasFlash: false,

  // game state
  rank: 0,
  rankTitle: 'Detective Rookie',
  currentMission: {
    id: 'mission-1',
    title: 'The Phantom Flash Loan',
    description: 'Carmen Sandiego has been spotted near a DeFi lending protocol on BNB Chain. Track her across the blockchain.',
    status: 'active',
  },
  carmenLocation: 'staking-arbitrum', // hidden from player
  locations: LOCATIONS,
  selectedLocation: null,
  clues: [],
  evidence: [],
  scannedLocations: ['shanghai'],
  isScanning: false,
  briefingDone: false,
  tourActive: false,
  tourStep: 0,
  currentCase: 'cryptopunk-7804',
  terminalLines: [],
  isInvestigating: false,
  showClueModal: false,
  activeClue: null,

  // auth actions
  connectWallet: (address) =>
    set({ walletAddress: address, isConnected: true }),

  disconnectWallet: () =>
    set({ walletAddress: null, isConnected: false, player: null }),

  registerPlayer: (name) =>
    set((state) => ({
      player: { name, address: state.walletAddress, rank: 0, rankTitle: 'Detective Rookie' },
    })),

  // game actions
  selectLocation: (locationId) => set({ selectedLocation: locationId }),

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

    set((s) => ({
      terminalLines: [
        ...s.terminalLines,
        { text: `> SCANNING NETWORK: ${locationId} [-${scanCost} GAS]`, color: 'cyan', type: 'action' },
        { text: '> Deploying scanner nodes across chain...', color: 'muted', type: 'system' },
      ],
    }))

    setTimeout(() => {
      set((s) => ({
        isScanning: false,
        scannedLocations: [...s.scannedLocations, locationId],
        terminalLines: [
          ...s.terminalLines,
          { text: '> SCAN COMPLETE. 3 suspicious contracts found.', color: 'green', type: 'system' },
          { text: '> Contracts available for investigation.', color: 'cyan', type: 'system' },
        ],
      }))
    }, 2000)
  },

  investigate: (locationId) => {
    const state = get()
    if (state.isInvestigating) return

    set({ isInvestigating: true })

    // add terminal line
    const loc = state.locations.find((l) => l.id === locationId)
    set((s) => ({
      terminalLines: [
        ...s.terminalLines,
        { text: `> INVESTIGATING: ${loc.name} [${loc.chain}]`, color: 'cyan', type: 'action' },
        { text: '> Sending tx to Game.sol.investigate()...', color: 'muted', type: 'system' },
      ],
    }))

    // simulate blockchain delay
    setTimeout(() => {
      const newClue = {
        id: `clue-${Date.now()}`,
        locationId,
        text: generateClueText(locationId, state.carmenLocation),
        type: 'audio',
        timestamp: Date.now(),
        decrypted: true,
      }

      const newEvidence = {
        id: `ev-${Date.now()}`,
        name: `${loc.chain} Intel`,
        description: `Data fragment recovered from ${loc.name}`,
        icon: locationId === state.carmenLocation ? 'hot' : 'cold',
        fromLocation: locationId,
        rarity: locationId === state.carmenLocation ? 'legendary' : 'common',
      }

      set((s) => ({
        isInvestigating: false,
        locations: s.locations.map((l) =>
          l.id === locationId ? { ...l, investigated: true } : l
        ),
        clues: [...s.clues, newClue],
        evidence: [...s.evidence, newEvidence],
        activeClue: newClue,
        showClueModal: true,
        terminalLines: [
          ...s.terminalLines,
          { text: '> TX CONFIRMED. CRE workflow triggered.', color: 'green', type: 'system' },
          { text: '> Encrypted audio clue received from IPFS.', color: 'cyan', type: 'system' },
          { text: '> Decrypting with local private key...', color: 'muted', type: 'system' },
          { text: '> CLUE DECRYPTED SUCCESSFULLY.', color: 'yellow', type: 'alert' },
        ],
      }))
    }, 2500)
  },

  attemptArrest: (locationId) => {
    const state = get()
    const success = locationId === state.carmenLocation

    set((s) => ({
      terminalLines: [
        ...s.terminalLines,
        { text: `> ATTEMPTING ARREST at ${locationId}...`, color: 'red', type: 'action' },
        { text: '> Sending tx to Game.sol.attemptArrest()...', color: 'muted', type: 'system' },
      ],
    }))

    setTimeout(() => {
      if (success) {
        set((s) => ({
          rank: s.rank + 1,
          rankTitle: getRankTitle(s.rank + 1),
          terminalLines: [
            ...s.terminalLines,
            { text: '> ████████████████████████████████████████', color: 'green', type: 'system' },
            { text: '> CARMEN SANDIEGO CAPTURED!', color: 'green', type: 'alert' },
            { text: `> PROMOTED TO: ${getRankTitle(s.rank + 1)}`, color: 'yellow', type: 'alert' },
            { text: '> ████████████████████████████████████████', color: 'green', type: 'system' },
          ],
        }))
      } else {
        set((s) => ({
          rank: Math.max(0, s.rank - 1),
          rankTitle: getRankTitle(Math.max(0, s.rank - 1)),
          terminalLines: [
            ...s.terminalLines,
            { text: '> !! ARREST FAILED — CARMEN ESCAPED !!', color: 'red', type: 'alert' },
            { text: `> DEMOTED TO: ${getRankTitle(Math.max(0, s.rank - 1))}`, color: 'red', type: 'alert' },
            { text: '> Carmen has moved to a new unknown location.', color: 'yellow', type: 'system' },
          ],
        }))
      }
    }, 2000)
  },

  completeBriefing: () =>
    set({
      briefingDone: true,
      tourActive: true,
      tourStep: 0,
      clues: MOCK_CLUES,
      evidence: MOCK_EVIDENCE,
      terminalLines: [
        { text: '> ACME MAINFRAME :: CASE FILE #4091', color: 'cyan', type: 'system' },
        { text: '> Agent connected. Welcome, Detective.', color: 'green', type: 'system' },
        { text: '', color: 'muted', type: 'system' },
        { text: '> You are now looking at the Block Explorer — this is', color: 'green', type: 'help' },
        { text: '> your main investigation tool. Here you can access all', color: 'green', type: 'help' },
        { text: '> contract transactions and identify suspicious activity.', color: 'green', type: 'help' },
        { text: '', color: 'muted', type: 'system' },
        { text: '> ⚠ WARNING: Our analysts flagged transaction', color: 'yellow', type: 'alert' },
        { text: '> 0xa81c9...bb12f — a depositNFT call that bridged', color: 'yellow', type: 'alert' },
        { text: '> the stolen NFT to Polygon. Click on that transaction', color: 'yellow', type: 'alert' },
        { text: '> to investigate.', color: 'yellow', type: 'alert' },
      ],
    }),

  advanceTour: () => {
    const state = get()
    const nextStep = state.tourStep + 1
    const tourMessages = {
      1: [
        { text: '', color: 'muted', type: 'system' },
        { text: '> Good. Transaction details loaded.', color: 'green', type: 'system' },
        { text: '> Now click INVESTIGATE to analyze this transaction.', color: 'green', type: 'help' },
        { text: '> It will cost some GAS but will reveal critical', color: 'green', type: 'help' },
        { text: '> information about Carmen\'s escape route.', color: 'green', type: 'help' },
      ],
      2: [
        { text: '', color: 'muted', type: 'system' },
        { text: '> TX ANALYZED. Evidence found!', color: 'green', type: 'system' },
        { text: '> Click + ADD TO EVIDENCE to save this proof.', color: 'yellow', type: 'alert' },
        { text: '> You will need evidence to arrest Carmen Sandiego.', color: 'yellow', type: 'alert' },
      ],
      3: [
        { text: '', color: 'muted', type: 'system' },
        { text: '> Evidence collected and stored securely.', color: 'green', type: 'system' },
        { text: '> Check the EVIDENCE tab on the left panel to', color: 'green', type: 'help' },
        { text: '> review your findings. Click on it now.', color: 'green', type: 'help' },
      ],
      4: [
        { text: '', color: 'muted', type: 'system' },
        { text: '> This is your evidence locker. Every piece of', color: 'cyan', type: 'system' },
        { text: '> evidence brings you closer to building a case', color: 'cyan', type: 'system' },
        { text: '> against Carmen and issuing an arrest warrant.', color: 'cyan', type: 'system' },
        { text: '', color: 'muted', type: 'system' },
        { text: '> ⚠ INTEL UPDATE: Carmen was tracked heading to', color: 'yellow', type: 'alert' },
        { text: '> the Polygon network. Click the ⚵ MAP button in', color: 'yellow', type: 'alert' },
        { text: '> the top-right corner to travel to Polygon and', color: 'yellow', type: 'alert' },
        { text: '> continue the investigation.', color: 'yellow', type: 'alert' },
        { text: '', color: 'muted', type: 'system' },
        { text: '> ⚠ REMINDER: Collect evidence before your GAS runs', color: 'red', type: 'alert' },
        { text: '> out — you need proof to catch Carmen!', color: 'red', type: 'alert' },
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
        { text: '> Fetching on-chain data from Polygon...', color: 'muted', type: 'system' },
      ],
    }))
  },

  closeClueModal: () => set({ showClueModal: false, activeClue: null }),

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

function generateClueText(locationId, carmenLocation) {
  const clueMap = {
    'defi-bnb':
      'The suspect manipulated a flash loan of negligible value in an obscure liquidity pool. The receiving address points toward an NFT marketplace on another chain.',
    'nft-polygon':
      'Carmen placed a bid on a rare NFT from an unknown artist — priced suspiciously below floor. The token was transferred to a staking contract on Arbitrum.',
    'staking-arbitrum':
      'A large amount of tokens was staked from a freshly created wallet. The staking pattern matches Carmen\'s known behavior. She may still be here.',
    'dao-base':
      'A new DAO member submitted a governance proposal to redirect treasury funds. The proposal language matches Carmen\'s signature rhetorical style.',
    'bridge-cross':
      'A high-value cross-chain transfer was routed through multiple hops. The final destination is obfuscated, but traces lead back to BNB Chain.',
  }
  return clueMap[locationId] || 'No significant activity detected at this location.'
}
