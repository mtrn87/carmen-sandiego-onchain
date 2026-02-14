/**
 * Contract Service — ethers v6 integration with GameMaster on Sepolia
 *
 * Provides all blockchain interactions for the Carmen Sandiego game.
 * Uses BrowserProvider (MetaMask/Privy) for signing transactions.
 */

import { ethers } from "ethers"

// ============================================================
//  Constants
// ============================================================

export const GAME_MASTER_ADDRESS = import.meta.env.VITE_GAME_MASTER_ADDRESS
if (!GAME_MASTER_ADDRESS) {
  throw new Error(
    "VITE_GAME_MASTER_ADDRESS is not set. Copy frontend/.env.example to frontend/.env and fill in the deployed address."
  )
}
export const SEPOLIA_CHAIN_ID = 11155111

const DEFAULT_CITY_NODE_RPCS = {
  421614: "https://sepolia-rollup.arbitrum.io/rpc",
  84532: "https://sepolia.base.org",
  51: "https://erpc.apothem.network",
}

const CITY_NODE_META = {
  421614: { name: "Tokyo", chain: "Arbitrum Sepolia" },
  84532: { name: "Paris", chain: "Base Sepolia" },
  51: { name: "London", chain: "XDC Apothem" },
}

const CITY_NODE_ADDRESSES = {
  421614: import.meta.env.VITE_CITYNODE_TOKYO_ADDRESS,
  84532: import.meta.env.VITE_CITYNODE_PARIS_ADDRESS,
  51: import.meta.env.VITE_CITYNODE_LONDON_ADDRESS,
}

const CITY_NODE_RPC_URLS = {
  421614: import.meta.env.VITE_ARBITRUM_SEPOLIA_RPC_URL || DEFAULT_CITY_NODE_RPCS[421614],
  84532: import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || DEFAULT_CITY_NODE_RPCS[84532],
  51: import.meta.env.VITE_XDC_APOTHEM_RPC_URL || DEFAULT_CITY_NODE_RPCS[51],
}

export const CITY_MAP = {
  421614: { name: "Tokyo", chain: "Arbitrum Sepolia", color: "#28a0f0", emoji: "\u{1F5FE}" },
  84532:  { name: "Paris", chain: "Base Sepolia",     color: "#0052ff", emoji: "\u{1F5FC}" },
  51:     { name: "London", chain: "XDC Apothem",     color: "#ff6b00", emoji: "\u{1F3A1}" },
}

const GAME_MASTER_ABI = [
  // Player functions
  "function registerPlayer(bytes calldata publicKey) external",
  "function startMission() external",
  "function submitInvestigation(uint256 chainId) external",

  // View functions
  "function getMission(uint256 missionId) external view returns (tuple(address player, uint256 startBlock, bytes32 targetHash, uint8 cluesReceived, uint8 investigationsCount, uint8 status))",
  "function getMissionClues(uint256 missionId) external view returns (tuple(uint8 clueType, bytes32 contentHash, string ipfsPointer, uint256 timestamp)[])",
  "function getPlayerActiveMission(address player) external view returns (uint256)",
  "function getBlocksUsed(uint256 missionId) external view returns (uint256)",
  "function getValidCities() external view returns (uint256[])",
  "function getPlayerPublicKey(address player) external view returns (bytes)",
  "function getMissionSalt(uint256 missionId) external view returns (bytes32)",

  // Events
  "event PlayerRegistered(address indexed player, bytes publicKey)",
  "event MissionStarted(uint256 indexed missionId, address indexed player, uint256 startBlock)",
  "event CarmenLocationCommitted(uint256 indexed missionId, bytes32 targetHash)",
  "event InvestigationSubmitted(uint256 indexed missionId, address indexed player, uint256 chainId)",
  "event ClueReceived(uint256 indexed missionId, uint8 clueType, bytes32 contentHash, string ipfsPointer)",
  "event CarmenCaptured(uint256 indexed missionId, address indexed player, uint256 blocksUsed, uint256 reward)",
  "event CarmenMoved(uint256 indexed missionId, bytes32 newTargetHash)",
  "event MissionFailed(uint256 indexed missionId, address indexed player)",
]

const CITY_NODE_ABI = [
  "function cityName() view returns (string)",
  "function chainId() view returns (uint256)",
  "function owner() view returns (address)",
  "function creOracle() view returns (address)",
  "function getCarmenStatus(uint256 missionId) view returns (bool)",
]

// ============================================================
//  Provider / Signer / Contract
// ============================================================

let _provider = null
let _signer = null

export async function getProvider() {
  if (_provider) return _provider
  if (!window.ethereum) throw new Error("No wallet detected")
  _provider = new ethers.BrowserProvider(window.ethereum)
  return _provider
}

export async function getSigner() {
  if (_signer) return _signer
  const provider = await getProvider()
  _signer = await provider.getSigner()
  return _signer
}

export async function getContract() {
  const signer = await getSigner()
  return new ethers.Contract(GAME_MASTER_ADDRESS, GAME_MASTER_ABI, signer)
}

export async function getReadContract() {
  const provider = await getProvider()
  return new ethers.Contract(GAME_MASTER_ADDRESS, GAME_MASTER_ABI, provider)
}

/** Reset cached provider/signer (call on wallet disconnect) */
export function resetConnection() {
  _provider = null
  _signer = null
}

// ============================================================
//  Dev / Debug Helpers
// ============================================================

/**
 * Get signer wallet address currently connected in browser wallet.
 * @returns {Promise<string>}
 */
export async function getConnectedWalletAddress() {
  const signer = await getSigner()
  return signer.getAddress()
}

/**
 * Return configured CityNode contracts for debug panel.
 */
export function getConfiguredCityNodes() {
  return Object.entries(CITY_NODE_META).map(([chainId, meta]) => {
    const id = Number(chainId)
    return {
      chainId: id,
      ...meta,
      address: CITY_NODE_ADDRESSES[id] || null,
      rpcUrl: CITY_NODE_RPC_URLS[id] || null,
      configured: Boolean(CITY_NODE_ADDRESSES[id]),
    }
  })
}

function getCityNodeReadContract(chainId) {
  const address = CITY_NODE_ADDRESSES[chainId]
  const rpcUrl = CITY_NODE_RPC_URLS[chainId]

  if (!address) {
    throw new Error(`CityNode address not configured for chainId ${chainId}`)
  }
  if (!rpcUrl) {
    throw new Error(`RPC URL not configured for chainId ${chainId}`)
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  return new ethers.Contract(address, CITY_NODE_ABI, provider)
}

/**
 * Get debug state from a CityNode.
 * @param {number} chainId
 * @param {number|bigint} missionId
 */
export async function getCityNodeState(chainId, missionId) {
  const nodeMeta = CITY_NODE_META[chainId]
  const address = CITY_NODE_ADDRESSES[chainId]

  if (!address) {
    return {
      chainId,
      name: nodeMeta?.name || `Chain ${chainId}`,
      chain: nodeMeta?.chain || `Chain ${chainId}`,
      address: null,
      configured: false,
      error: "Address not configured",
    }
  }

  try {
    const contract = getCityNodeReadContract(chainId)
    const [cityName, nodeChainId, owner, creOracle, carmenPresent] = await Promise.all([
      contract.cityName(),
      contract.chainId(),
      contract.owner(),
      contract.creOracle(),
      contract.getCarmenStatus(BigInt(missionId || 0)),
    ])

    return {
      chainId,
      name: cityName,
      chain: nodeMeta?.chain || cityName,
      address,
      configured: true,
      nodeChainId: Number(nodeChainId),
      owner,
      creOracle,
      carmenPresent: Boolean(carmenPresent),
    }
  } catch (error) {
    return {
      chainId,
      name: nodeMeta?.name || `Chain ${chainId}`,
      chain: nodeMeta?.chain || `Chain ${chainId}`,
      address,
      configured: true,
      error: error.message || "Failed to read CityNode",
    }
  }
}

/**
 * Get GameMaster state scoped to wallet and active mission.
 * @param {string} walletAddress
 */
export async function getGameMasterDebugState(walletAddress) {
  if (!walletAddress) throw new Error("walletAddress is required")

  const [registered, activeMissionId, validCities] = await Promise.all([
    isPlayerRegistered(walletAddress),
    getPlayerActiveMission(walletAddress),
    getValidCities(),
  ])

  let mission = null
  let clues = []
  let blocksUsed = 0
  let carmenLocation = null

  if (activeMissionId > 0n) {
    const missionNumber = Number(activeMissionId)
    ;[mission, clues, blocksUsed] = await Promise.all([
      getMission(missionNumber),
      getMissionClues(missionNumber),
      getBlocksUsed(missionNumber),
    ])
    carmenLocation = await getCurrentCarmenLocation(missionNumber)
  }

  return {
    walletAddress,
    gameMasterAddress: GAME_MASTER_ADDRESS,
    registered,
    activeMissionId: Number(activeMissionId),
    validCities,
    mission,
    carmenLocation,
    cluesCount: clues.length,
    blocksUsed,
  }
}

// ============================================================
//  Player Functions
// ============================================================

/**
 * Register player with ECIES public key.
 * @param {string} publicKeyHex - 0x-prefixed uncompressed public key (130 hex chars)
 */
export async function registerPlayer(publicKeyHex) {
  const contract = await getContract()
  const tx = await contract.registerPlayer(publicKeyHex)
  return tx.wait()
}

/**
 * Check if player is registered (has public key on-chain).
 * @param {string} address
 * @returns {boolean}
 */
export async function isPlayerRegistered(address) {
  const contract = await getReadContract()
  const pubKey = await contract.getPlayerPublicKey(address)
  return pubKey && pubKey.length > 2 // "0x" is empty
}

/**
 * Get player's active mission ID (0 = no active mission).
 * @param {string} address
 * @returns {bigint}
 */
export async function getPlayerActiveMission(address) {
  const contract = await getReadContract()
  return contract.getPlayerActiveMission(address)
}

// ============================================================
//  Mission Functions
// ============================================================

/** Start a new mission (triggers VRF). */
export async function startMission() {
  const contract = await getContract()
  const tx = await contract.startMission()
  return tx.wait()
}

/**
 * Submit investigation for a city.
 * @param {number|bigint} chainId - The city's chain ID (421614, 84532, or 51)
 */
export async function submitInvestigation(chainId) {
  const contract = await getContract()
  const tx = await contract.submitInvestigation(chainId)
  return tx.wait()
}

/**
 * Get mission data.
 * @param {number|bigint} missionId
 * @returns {{ player, startBlock, targetHash, cluesReceived, investigationsCount, status }}
 */
export async function getMission(missionId) {
  const contract = await getReadContract()
  const m = await contract.getMission(missionId)
  return {
    player: m.player,
    startBlock: m.startBlock,
    targetHash: m.targetHash,
    cluesReceived: Number(m.cluesReceived),
    investigationsCount: Number(m.investigationsCount),
    status: Number(m.status), // 0=None, 1=Active, 2=Completed, 3=Failed
  }
}

/** Get mission salt (used by CRE to derive Carmen city). */
export async function getMissionSalt(missionId) {
  const contract = await getReadContract()
  return contract.getMissionSalt(missionId)
}

/**
 * Get all clues for a mission.
 * @param {number|bigint} missionId
 * @returns {Array<{ clueType, contentHash, ipfsPointer, timestamp }>}
 */
export async function getMissionClues(missionId) {
  const contract = await getReadContract()
  const clues = await contract.getMissionClues(missionId)
  return clues.map((c) => ({
    clueType: Number(c.clueType), // 0=Text, 1=Audio, 2=Image
    contentHash: c.contentHash,
    ipfsPointer: c.ipfsPointer, // encrypted clue hex
    timestamp: Number(c.timestamp),
  }))
}

/** Get valid city chain IDs. */
export async function getValidCities() {
  const contract = await getReadContract()
  const cities = await contract.getValidCities()
  return cities.map((c) => Number(c))
}

/**
 * Derive Carmen's current city for a mission by matching keccak256(chainId, salt) against targetHash.
 * Intended for non-production debugging only.
 */
export async function getCurrentCarmenLocation(missionId) {
  if (!missionId) return null

  const [mission, salt, cities] = await Promise.all([
    getMission(missionId),
    getMissionSalt(missionId),
    getValidCities(),
  ])

  if (!mission?.targetHash || !salt) return null

  const targetHash = String(mission.targetHash).toLowerCase()

  for (const chainId of cities) {
    const candidate = ethers.solidityPackedKeccak256(
      ["uint256", "bytes32"],
      [BigInt(chainId), salt]
    ).toLowerCase()

    if (candidate === targetHash) {
      const cityMeta = CITY_MAP[chainId]
      return {
        chainId,
        name: cityMeta?.name || `Chain ${chainId}`,
        chain: cityMeta?.chain || `Chain ${chainId}`,
      }
    }
  }

  return null
}

/** Get blocks used in a mission. */
export async function getBlocksUsed(missionId) {
  const contract = await getReadContract()
  return Number(await contract.getBlocksUsed(missionId))
}

// ============================================================
//  Event Listeners
// ============================================================

/**
 * Listen for ClueReceived events for a specific mission.
 * @param {number|bigint} missionId
 * @param {Function} callback - (clueType, contentHash, ipfsPointer) => void
 * @returns {Function} unsubscribe function
 */
export async function onClueReceived(missionId, callback) {
  const contract = await getReadContract()
  const filter = contract.filters.ClueReceived(missionId)
  const handler = (mId, clueType, contentHash, ipfsPointer) => {
    callback({
      missionId: Number(mId),
      clueType: Number(clueType),
      contentHash,
      ipfsPointer,
    })
  }
  contract.on(filter, handler)
  return () => contract.off(filter, handler)
}

/**
 * Listen for CarmenCaptured events for a specific mission.
 */
export async function onCarmenCaptured(missionId, callback) {
  const contract = await getReadContract()
  const filter = contract.filters.CarmenCaptured(missionId)
  const handler = (mId, player, blocksUsed, reward) => {
    callback({
      missionId: Number(mId),
      player,
      blocksUsed: Number(blocksUsed),
      reward: Number(reward),
    })
  }
  contract.on(filter, handler)
  return () => contract.off(filter, handler)
}

/**
 * Listen for MissionFailed events for a specific mission.
 */
export async function onMissionFailed(missionId, callback) {
  const contract = await getReadContract()
  const filter = contract.filters.MissionFailed(missionId)
  const handler = (mId, player) => {
    callback({ missionId: Number(mId), player })
  }
  contract.on(filter, handler)
  return () => contract.off(filter, handler)
}

/**
 * Listen for CarmenMoved events for a specific mission.
 */
export async function onCarmenMoved(missionId, callback) {
  const contract = await getReadContract()
  const filter = contract.filters.CarmenMoved(missionId)
  const handler = (mId, newTargetHash) => {
    callback({ missionId: Number(mId), newTargetHash })
  }
  contract.on(filter, handler)
  return () => contract.off(filter, handler)
}

/**
 * Fetch historical events for a mission from the GameMaster contract.
 * Returns all events in chronological order.
 * @param {number|bigint} missionId
 * @returns {Array<{ name, block, data, color }>}
 */
export async function getMissionEvents(missionId) {
  const contract = await getReadContract()
  const provider = await getProvider()
  const currentBlock = await provider.getBlockNumber()
  // Look back up to 5000 blocks (more than enough for any mission)
  const fromBlock = Math.max(0, currentBlock - 5000)

  const events = []

  try {
    // Fetch InvestigationSubmitted events
    const investFilter = contract.filters.InvestigationSubmitted(missionId)
    const investLogs = await contract.queryFilter(investFilter, fromBlock)
    for (const log of investLogs) {
      const chainId = Number(log.args[2])
      const city = CITY_MAP[chainId]
      events.push({
        name: "InvestigationSubmitted",
        block: log.blockNumber,
        color: "cyan",
        data: {
          missionId: Number(log.args[0]),
          player: `${log.args[1].slice(0, 8)}...${log.args[1].slice(-4)}`,
          city: city ? `${city.name} (${city.chain})` : `Chain ${chainId}`,
          chainId,
        },
      })
    }

    // Fetch ClueReceived events
    const clueFilter = contract.filters.ClueReceived(missionId)
    const clueLogs = await contract.queryFilter(clueFilter, fromBlock)
    const clueTypes = ["Text", "Audio", "Image"]
    for (const log of clueLogs) {
      events.push({
        name: "ClueReceived",
        block: log.blockNumber,
        color: "yellow",
        data: {
          missionId: Number(log.args[0]),
          clueType: clueTypes[Number(log.args[1])] || "Unknown",
          contentHash: `${log.args[2].slice(0, 14)}...`,
          encrypted: "ECIES-secp256k1",
        },
      })
    }

    // Fetch CarmenMoved events
    const movedFilter = contract.filters.CarmenMoved(missionId)
    const movedLogs = await contract.queryFilter(movedFilter, fromBlock)
    for (const log of movedLogs) {
      events.push({
        name: "CarmenMoved",
        block: log.blockNumber,
        color: "red",
        data: {
          missionId: Number(log.args[0]),
          newTargetHash: `${log.args[1].slice(0, 14)}...`,
          status: "Carmen relocated!",
        },
      })
    }

    // Fetch CarmenCaptured events
    const capturedFilter = contract.filters.CarmenCaptured(missionId)
    const capturedLogs = await contract.queryFilter(capturedFilter, fromBlock)
    for (const log of capturedLogs) {
      events.push({
        name: "CarmenCaptured",
        block: log.blockNumber,
        color: "green",
        data: {
          missionId: Number(log.args[0]),
          player: `${log.args[1].slice(0, 8)}...${log.args[1].slice(-4)}`,
          blocksUsed: Number(log.args[2]),
          reward: Number(log.args[3]),
        },
      })
    }

    // Fetch MissionFailed events
    const failedFilter = contract.filters.MissionFailed(missionId)
    const failedLogs = await contract.queryFilter(failedFilter, fromBlock)
    for (const log of failedLogs) {
      events.push({
        name: "MissionFailed",
        block: log.blockNumber,
        color: "red",
        data: {
          missionId: Number(log.args[0]),
          player: `${log.args[1].slice(0, 8)}...${log.args[1].slice(-4)}`,
          status: "Carmen escaped!",
        },
      })
    }
  } catch (err) {
    console.warn("Failed to fetch mission events:", err)
  }

  // Sort chronologically
  events.sort((a, b) => a.block - b.block)
  return events
}

/**
 * Ensure wallet is connected to Sepolia. Prompts chain switch if needed.
 */
export async function ensureSepoliaNetwork() {
  if (!window.ethereum) throw new Error("No wallet detected")
  const chainId = await window.ethereum.request({ method: "eth_chainId" })
  if (parseInt(chainId, 16) !== SEPOLIA_CHAIN_ID) {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + SEPOLIA_CHAIN_ID.toString(16) }],
    })
    resetConnection()
  }
}
