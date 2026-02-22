import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock contract instance (shared so tests can override individual methods)
const mockContract = {
  registerPlayer: vi.fn(async () => ({ wait: vi.fn(async () => ({ hash: '0xreg' })) })),
  startMission: vi.fn(async () => ({ wait: vi.fn(async () => ({ hash: '0xstart' })) })),
  submitInvestigation: vi.fn(async () => ({ wait: vi.fn(async () => ({ hash: '0xinv' })) })),
  getPlayerPublicKey: vi.fn(async () => '0x'),
  getPlayerActiveMission: vi.fn(async () => 0n),
  getMission: vi.fn(async () => ({
    player: '0xabc',
    startBlock: 100n,
    targetHash: '0xdef',
    cluesReceived: 2n,
    investigationsCount: 1n,
    status: 1n,
  })),
  getMissionClues: vi.fn(async () => [
    { clueType: 0n, contentHash: '0xhash1', ipfsPointer: 'encrypted1', timestamp: 1000n },
  ]),
  getValidCities: vi.fn(async () => [421614n, 84532n, 51n]),
  getBlocksUsed: vi.fn(async () => 42n),
  filters: {
    ClueReceived: vi.fn(() => 'clue-filter'),
    CarmenCaptured: vi.fn(() => 'capture-filter'),
    MissionFailed: vi.fn(() => 'fail-filter'),
  },
  on: vi.fn(),
  off: vi.fn(),
}

const mockSigner = { address: '0xsigner' }
const mockProvider = {
  getSigner: vi.fn(async () => mockSigner),
}

// Use class-style constructors so `new ethers.BrowserProvider(...)` works
vi.mock('ethers', () => ({
  ethers: {
    BrowserProvider: class MockBrowserProvider {
      constructor() {
        return mockProvider
      }
    },
    Contract: class MockContract {
      constructor() {
        return mockContract
      }
    },
  },
}))

import {
  CITY_MAP,
  SEPOLIA_CHAIN_ID,
  resetConnection,
  getProvider,
  isPlayerRegistered,
  getMission,
  getMissionClues,
  getValidCities,
  getBlocksUsed,
} from '../../services/contractService.js'

describe('contractService', () => {
  beforeEach(() => {
    resetConnection()
    vi.clearAllMocks()
  })

  it('throws if no wallet detected', async () => {
    const original = window.ethereum
    delete window.ethereum
    resetConnection()
    await expect(getProvider()).rejects.toThrow('No wallet detected')
    window.ethereum = original
  })

  it('CITY_MAP contains 17 cities with correct names for original chainIds', () => {
    expect(CITY_MAP[421614].name).toBe('Tokyo')
    expect(CITY_MAP[84532].name).toBe('Paris')
    expect(CITY_MAP[51].name).toBe('Sydney')
    expect(CITY_MAP[971].name).toBe('Berlin')
    expect(Object.keys(CITY_MAP).length).toBe(17)
  })

  it('SEPOLIA_CHAIN_ID is 11155111', () => {
    expect(SEPOLIA_CHAIN_ID).toBe(11155111)
  })

  it('isPlayerRegistered returns false for empty pubkey (0x)', async () => {
    mockContract.getPlayerPublicKey.mockResolvedValueOnce('0x')
    const result = await isPlayerRegistered('0xplayer')
    expect(result).toBe(false)
  })

  it('getMission parses tuple fields to correct types', async () => {
    const mission = await getMission(1)
    expect(mission.player).toBe('0xabc')
    expect(typeof mission.cluesReceived).toBe('number')
    expect(mission.cluesReceived).toBe(2)
    expect(typeof mission.investigationsCount).toBe('number')
    expect(typeof mission.status).toBe('number')
    expect(mission.status).toBe(1)
  })

  it('getMissionClues maps array correctly', async () => {
    const clues = await getMissionClues(1)
    expect(clues).toHaveLength(1)
    expect(clues[0].clueType).toBe(0)
    expect(typeof clues[0].timestamp).toBe('number')
    expect(clues[0].timestamp).toBe(1000)
    expect(clues[0].ipfsPointer).toBe('encrypted1')
  })

  it('getValidCities returns array of numbers', async () => {
    const cities = await getValidCities()
    expect(cities).toEqual([421614, 84532, 51])
    cities.forEach((c) => expect(typeof c).toBe('number'))
  })

  it('getBlocksUsed returns a number', async () => {
    const blocks = await getBlocksUsed(1)
    expect(typeof blocks).toBe('number')
    expect(blocks).toBe(42)
  })
})
