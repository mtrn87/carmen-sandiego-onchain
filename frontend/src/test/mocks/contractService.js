/**
 * Mock for contractService — use with vi.mock('../services/contractService', ...)
 * All functions return sensible defaults. Override per-test with mockResolvedValueOnce.
 */

import { CITY_POOL_MAP } from '../../data/cityRegistry'

export const CITY_MAP = Object.fromEntries(
  Object.entries(CITY_POOL_MAP).map(([id, city]) => [
    Number(id),
    { name: city.name, chain: city.chain, color: city.chainColor, emoji: city.flag },
  ])
)

export const GAME_MASTER_ADDRESS = '0xB6E2A9DEd3352E1a1B4a501c6F110813883F4cEB'
export const SEPOLIA_CHAIN_ID = 11155111

export const registerPlayer = vi.fn(async () => ({ hash: '0xreg123' }))
export const isPlayerRegistered = vi.fn(async () => false)
export const getPlayerOnChainPublicKey = vi.fn(async () => null)
export const getPlayerActiveMission = vi.fn(async () => 0n)
export const startMission = vi.fn(async () => ({ hash: '0xstart456', status: 1 }))
export const submitInvestigation = vi.fn(async () => ({ hash: '0xinv789' }))
export const getMission = vi.fn(async () => ({
  player: '0x1234567890abcdef1234567890abcdef12345678',
  startBlock: 1000n,
  targetHash: '0xabcdef',
  cluesReceived: 0,
  investigationsCount: 0,
  status: 1,
}))
export const getMissionClues = vi.fn(async () => [])
export const getValidCities = vi.fn(async () => [421614, 84532, 51])
export const getBlocksUsed = vi.fn(async () => 5)
export const getMissionEvents = vi.fn(async () => [])
export const onClueReceived = vi.fn(async () => vi.fn())
export const onCarmenCaptured = vi.fn(async () => vi.fn())
export const onCarmenMoved = vi.fn(async () => vi.fn())
export const onMissionFailed = vi.fn(async () => vi.fn())
export const ensureSepoliaNetwork = vi.fn(async () => {})
export const resetConnection = vi.fn()
export const getProvider = vi.fn()
export const getSigner = vi.fn(async () => ({
  getAddress: vi.fn(async () => '0x1234567890abcdef1234567890abcdef12345678'),
}))
export const getContract = vi.fn()
export const getReadContract = vi.fn()

// CityNode gameplay mocks
export const getCityNodeInfo = vi.fn(async () => ({ city: 'Mock', countryCode: 'XX', chainId: 421614, cityId: 421614, suspicionLevel: 50, suspicionReasonHash: '0x0' }))
export const getCityNodeLocations = vi.fn(async () => [])
export const getCityNodeAnomalyTxRefs = vi.fn(async () => [])
export const getCityNodeSuspectWallets = vi.fn(async () => [])
export const getCityNodeEvidenceSummary = vi.fn(async () => ({ totalClues: 0, bundleHashLike: '0x0', confidence: 0 }))
export const cityNodeInspectLocation = vi.fn(async () => ({ hash: '0xmock', blockNumber: 1, noteHash: '0x0' }))
export const cityNodeScanAnomalies = vi.fn(async () => ({ hash: '0xmock', blockNumber: 1, anomaliesFound: 2, suspectsFound: 1 }))
export const cityNodeRequestClue = vi.fn(async () => ({ hash: '0xmock', clueType: 'BEHAVIOR_FINGERPRINT', clueData: 'mock', strength: 50, anomalyRefId: '0x0' }))
export const cityNodeFlagTx = vi.fn(async () => ({ hash: '0xmock' }))
export const cityNodeRequestDossier = vi.fn(async () => ({ hash: '0xmock', summary: 'mock', hypotheses: [], gaps: [], nextObjective: '', confidence: 50 }))
export const cityNodeRequestCapture = vi.fn(async () => ({ hash: '0xmock', success: true, reasonCode: 'OK', gmNote: 'Captured!' }))
export const onCityNodeEvents = vi.fn(async () => vi.fn())
export const buildLocationTransactions = vi.fn(() => [])
export const onWalletFragmentReceived = vi.fn(async () => vi.fn())
export const onWalletCaseBuilt = vi.fn(async () => vi.fn())
export const onEvidenceCollected = vi.fn(async () => vi.fn())
export const getMissionWalletFragments = vi.fn(async () => [])
export const getMissionFragmentCount = vi.fn(async () => 0)
export const getMissionEvidenceCount = vi.fn(async () => 0)
export const onPlayerRegistered = vi.fn(async () => vi.fn())
export const onMissionStarted = vi.fn(async () => vi.fn())
export const onCarmenLocationCommitted = vi.fn(async () => vi.fn())
export const onTokenURISet = vi.fn(async () => vi.fn())
export const onClueResolvedOnCity = vi.fn(async () => vi.fn())
export const onDossierResolvedOnCity = vi.fn(async () => vi.fn())
export const onCaptureResolvedOnCity = vi.fn(async () => vi.fn())
export const getCityNodeEnergy = vi.fn(async () => 10)
export const MAX_ENERGY = 10
export const ENERGY_REGEN_INTERVAL = 900
