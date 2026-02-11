/**
 * Mock for contractService — use with vi.mock('../services/contractService', ...)
 * All functions return sensible defaults. Override per-test with mockResolvedValueOnce.
 */

export const CITY_MAP = {
  421614: { name: 'Tokyo', chain: 'Arbitrum Sepolia', color: '#28a0f0', emoji: '\u{1F5FE}' },
  84532:  { name: 'Paris', chain: 'Base Sepolia',     color: '#0052ff', emoji: '\u{1F5FC}' },
  51:     { name: 'London', chain: 'XDC Apothem',     color: '#ff6b00', emoji: '\u{1F3A1}' },
}

export const GAME_MASTER_ADDRESS = '0xB6E2A9DEd3352E1a1B4a501c6F110813883F4cEB'
export const SEPOLIA_CHAIN_ID = 11155111

export const registerPlayer = vi.fn(async () => ({ hash: '0xreg123' }))
export const isPlayerRegistered = vi.fn(async () => false)
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
export const onClueReceived = vi.fn(async () => vi.fn())
export const onCarmenCaptured = vi.fn(async () => vi.fn())
export const onMissionFailed = vi.fn(async () => vi.fn())
export const ensureSepoliaNetwork = vi.fn(async () => {})
export const resetConnection = vi.fn()
export const getProvider = vi.fn()
export const getSigner = vi.fn(async () => ({
  getAddress: vi.fn(async () => '0x1234567890abcdef1234567890abcdef12345678'),
}))
export const getContract = vi.fn()
export const getReadContract = vi.fn()
