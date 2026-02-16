/**
 * Contract Service — ethers v6 integration with GameMaster on Sepolia
 *
 * Provides all blockchain interactions for the Carmen Sandiego game.
 * Uses BrowserProvider (MetaMask/Privy) for signing transactions.
 */

import { ethers } from "ethers"
import { CITY_POOL_MAP, getMockLocations, getMockClueData, getCountryCode } from '../data/cityRegistry'
import { WALLET_POOL, pickTxWallets, getCarmenWalletIndex } from '../data/walletPool'
import GameMasterArtifact from "../abi/GameMaster.json"
import CityNodeArtifact from "../abi/CityNode.json"

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

const CITY_NODE_META = Object.fromEntries(
  Object.entries(CITY_POOL_MAP).map(([id, city]) => [Number(id), { name: city.name, chain: city.chain }])
)

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

export const CITY_MAP = Object.fromEntries(
  Object.entries(CITY_POOL_MAP).map(([id, city]) => [
    Number(id),
    { name: city.name, chain: city.chain, color: city.chainColor, emoji: city.flag },
  ])
)

// Compiled ABIs from contract artifacts — source of truth
const GAME_MASTER_ABI = GameMasterArtifact.abi

// ============================================================
//  CityNode Gameplay Constants & Helpers
// ============================================================

export const MAX_ENERGY = 10
export const ENERGY_REGEN_INTERVAL = 15 * 60 // 15 minutes in seconds

// LocationInfo.category enum: uint8 → display label
export const CATEGORY_MAP = {
  0: "Bridge Relay",
  1: "Signal Router",
  2: "Swap Protocol",
  3: "Monitoring Beacon",
  4: "Custody Protocol",
  5: "Cross-Chain Bridge",
}

// AnomalyType enum: uint8 → display label
export const ANOMALY_TYPE_MAP = {
  0: "UNUSUAL_GAS",
  1: "BURST_NONCE",
  2: "PRECISE_VALUE",
  3: "RECURRING_COUNTERPARTY",
  4: "BRIDGE_USAGE",
  5: "CREATE2_DEPLOY",
}

// Suspect wallet tag bitmap: bit position → label
export const TAG_BITS = {
  0: "bridge-user",
  1: "high-value",
  2: "deployer",
  3: "mixer",
  4: "fee-recipient",
  5: "flash-loan",
  6: "multi-sig",
  7: "new-account",
}

/** Decode a tagsBitmap (uint256) into an array of tag strings */
export function decodeTags(bitmap) {
  const tags = []
  const bm = BigInt(bitmap)
  for (const [bit, label] of Object.entries(TAG_BITS)) {
    if (bm & (1n << BigInt(bit))) {
      tags.push(label)
    }
  }
  return tags
}

// CityNode gameplay ABI — compiled from contracts/src/CityNode.sol
const CITY_NODE_GAMEPLAY_ABI = CityNodeArtifact.abi

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
  return new ethers.Contract(address, CITY_NODE_GAMEPLAY_ABI, provider)
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

/** Get wallet fragments for a mission. */
export async function getMissionWalletFragments(missionId) {
  const contract = await getReadContract()
  const fragments = await contract.getMissionWalletFragments(missionId)
  return fragments.map((f) => ({
    startIndex: Number(f.startIndex),
    length: Number(f.length),
    contentHash: f.contentHash,
    ipfsPointer: f.ipfsPointer,
    timestamp: Number(f.timestamp),
  }))
}

/** Get wallet fragment count for a mission. */
export async function getMissionFragmentCount(missionId) {
  try {
    const contract = await getReadContract()
    if (typeof contract.getMissionFragmentCount !== 'function') return 0
    return Number(await contract.getMissionFragmentCount(missionId))
  } catch {
    return 0
  }
}

/** Get on-chain evidence count for a mission (clues with strength > 65). */
export async function getMissionEvidenceCount(missionId) {
  try {
    const contract = await getReadContract()
    if (typeof contract.getMissionEvidenceCount !== 'function') return 0
    return Number(await contract.getMissionEvidenceCount(missionId))
  } catch {
    return 0
  }
}

/** Derive Carmen wallet from salt (for verification). */
export async function deriveCarmenWallet(salt) {
  const contract = await getReadContract()
  return contract.deriveCarmenWallet(salt)
}

/**
 * Listen for WalletFragmentReceived events for a specific mission.
 * @param {number|bigint} missionId
 * @param {Function} callback - ({ missionId, fragmentIndex, startIndex, length, contentHash, ipfsPointer }) => void
 * @returns {Function} unsubscribe function
 */
export async function onWalletFragmentReceived(missionId, callback) {
  try {
    const contract = await getReadContract()
    if (!contract.filters?.WalletFragmentReceived) return () => {}
    const filter = contract.filters.WalletFragmentReceived(missionId)
    const handler = (mId, fragmentIndex, startIndex, length, contentHash, ipfsPointer) => {
      callback({
        missionId: Number(mId),
        fragmentIndex: Number(fragmentIndex),
        startIndex: Number(startIndex),
        length: Number(length),
        contentHash,
        ipfsPointer,
      })
    }
    contract.on(filter, handler)
    return () => contract.off(filter, handler)
  } catch {
    return () => {}
  }
}

/**
 * Listen for EvidenceCollected events for a specific mission.
 * @param {number|bigint} missionId
 * @param {Function} callback - ({ missionId, evidenceCount, strength }) => void
 * @returns {Function} unsubscribe function
 */
export async function onEvidenceCollected(missionId, callback) {
  try {
    const contract = await getReadContract()
    if (!contract.filters?.EvidenceCollected) return () => {}
    const filter = contract.filters.EvidenceCollected(missionId)
    const handler = (mId, evidenceCount, strength) => {
      callback({
        missionId: Number(mId),
        evidenceCount: Number(evidenceCount),
        strength: Number(strength),
      })
    }
    contract.on(filter, handler)
    return () => contract.off(filter, handler)
  } catch {
    return () => {}
  }
}

/**
 * Listen for WalletCaseBuilt events for a specific mission.
 */
export async function onWalletCaseBuilt(missionId, callback) {
  const contract = await getReadContract()
  const filter = contract.filters.WalletCaseBuilt(missionId)
  const handler = (mId, player, submittedWallet, valid) => {
    callback({
      missionId: Number(mId),
      player,
      submittedWallet,
      valid,
    })
  }
  contract.on(filter, handler)
  return () => contract.off(filter, handler)
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

// ============================================================
//  CityNode Gameplay Service
//  Real contract calls with mock fallback when addresses not configured.
// ============================================================

/** Chain parameters for wallet_addEthereumChain / wallet_switchEthereumChain */
const CHAIN_PARAMS = {
  421614: {
    chainId: "0x66eee",
    chainName: "Arbitrum Sepolia",
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    blockExplorerUrls: ["https://sepolia.arbiscan.io"],
  },
  84532: {
    chainId: "0x14a34",
    chainName: "Base Sepolia",
    rpcUrls: ["https://sepolia.base.org"],
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    blockExplorerUrls: ["https://sepolia-explorer.base.org"],
  },
  51: {
    chainId: "0x33",
    chainName: "XDC Apothem",
    rpcUrls: ["https://erpc.apothem.network"],
    nativeCurrency: { name: "TXDC", symbol: "TXDC", decimals: 18 },
    blockExplorerUrls: ["https://explorer.apothem.network"],
  },
}

/**
 * Get read-only CityNode gameplay contract via JsonRpcProvider.
 * Returns null if address or rpc not configured.
 */
function getCityNodeGameplayContract(chainId) {
  const address = CITY_NODE_ADDRESSES[chainId]
  const rpcUrl = CITY_NODE_RPC_URLS[chainId]
  if (!address || !rpcUrl) return null
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  return new ethers.Contract(address, CITY_NODE_GAMEPLAY_ABI, provider)
}

/**
 * Switch wallet to the CityNode's chain. Adds the chain if unknown.
 */
export async function ensureCityNodeNetwork(chainId) {
  if (!window.ethereum) throw new Error("No wallet detected")
  const current = parseInt(await window.ethereum.request({ method: "eth_chainId" }), 16)
  if (current === chainId) return

  const params = CHAIN_PARAMS[chainId]
  if (!params) throw new Error(`Unknown chain ${chainId} — cannot switch wallet`)

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: params.chainId }],
    })
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [params],
      })
    } else {
      throw err
    }
  }
  resetConnection()
}

/**
 * Get signer-connected CityNode gameplay contract.
 * Switches the wallet to the correct chain first.
 */
async function getCityNodeWriteContract(chainId) {
  const address = CITY_NODE_ADDRESSES[chainId]
  if (!address) throw new Error(`CityNode address not configured for chain ${chainId}`)
  await ensureCityNodeNetwork(chainId)
  const provider = new ethers.BrowserProvider(window.ethereum)
  const signer = await provider.getSigner()

  // Wrap signer to override gas estimation for local Hardhat nodes
  // where baseFee can drift above ethers.js default maxFeePerGas
  const rpcUrl = CITY_NODE_RPC_URLS[chainId] || ""
  const isLocal = rpcUrl.includes("localhost") || rpcUrl.includes("127.0.0.1")
  if (isLocal) {
    const origSendTx = signer.sendTransaction.bind(signer)
    signer.sendTransaction = async (tx) => {
      const feeData = await provider.getFeeData()
      const baseFee = feeData.maxFeePerGas || 30000000000n
      tx.maxFeePerGas = baseFee * 2n
      tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1000000000n
      return origSendTx(tx)
    }
  }

  return new ethers.Contract(address, CITY_NODE_GAMEPLAY_ABI, signer)
}

/**
 * Check if a CityNode contract is configured (address + rpc).
 */
function isCityNodeConfigured(chainId) {
  return Boolean(CITY_NODE_ADDRESSES[chainId] && CITY_NODE_RPC_URLS[chainId])
}

// ── Mock data generators (used when contracts are not deployed) ──

const MOCK_CLUE_DATA = Object.fromEntries(
  Object.keys(CITY_POOL_MAP).map((id) => [Number(id), getMockClueData(Number(id))])
)

function _mockClueResult(chainId, locationIdx, clueIndex, txHash, blockNumber, isStartingClue = false) {
  const clueTypes = ["BEHAVIOR_FINGERPRINT", "RELATIONSHIP", "IDENTITY_COMMIT", "FUNDING_TRAIL", "TECHNICAL_SIGNATURE", "DEAD_END"]
  const locationData = MOCK_CLUE_DATA[chainId]?.[locationIdx]

  // starting clue is always strong (guaranteed lead for the player)
  // regular clues: ~15% dead end chance, otherwise random 20-95
  const isDeadEnd = isStartingClue ? false : Math.random() < 0.15
  const strength = isStartingClue
    ? 70 + Math.floor(Math.random() * 26)  // 70-95
    : isDeadEnd ? 5 + Math.floor(Math.random() * 16) : 20 + Math.floor(Math.random() * 76) // 20-95

  // determine tier from strength
  let tier
  if (strength <= 40) tier = "weak"
  else if (strength <= 65) tier = "medium"
  else tier = "strong"

  // pick clue text from the matching tier
  const cityName = CITY_NODE_META[chainId]?.name || "unknown"
  let clueData
  if (locationData && locationData[tier]) {
    const tierTexts = locationData[tier]
    const idx = clueIndex % tierTexts.length
    clueData = tierTexts[idx]
  } else {
    // generic tiered clue text for cities without custom data
    const genericClues = {
      weak: [
        `Faint residual signals at ${cityName} location ${locationIdx} — trace too degraded to analyze. Could be anyone.`,
        `Network scan at ${cityName} returned nominal results. No actionable intel at this time.`,
      ],
      medium: [
        `Suspicious activity pattern detected at ${cityName} location ${locationIdx}. The transaction timing matches known obfuscation techniques but the trail fragments after two hops.`,
        `Cross-chain traffic at ${cityName} shows anomalous routing. Someone is moving assets through this node — the gas pattern is consistent with Carmen's operational style.`,
      ],
      strong: [
        `Full analysis of ${cityName} location ${locationIdx} confirms Carmen's network is active here. Transaction pattern decoded — extraction route mapped. [WALLET INTEL: suspect wallet interacted with contracts on this chain in the last 24 hours]`,
        `${cityName} node fully compromised: Carmen's relay signature confirmed. Asset staging detected with multi-chain convergence. [WALLET INTEL: suspect wallet holds tokens bridged from at least 2 chains]`,
      ],
    }
    const texts = genericClues[tier]
    clueData = texts[clueIndex % texts.length]
  }

  return {
    hash: txHash || `0x${Math.random().toString(16).slice(2, 14)}...mock`,
    blockNumber: blockNumber || 52884300 + Math.floor(Math.random() * 100),
    requestId: Date.now(),
    resolved: true,
    clueType: isDeadEnd ? "DEAD_END" : clueTypes[Math.floor(Math.random() * 5)],
    clueData,
    anomalyRefId: `0x${Math.random().toString(16).slice(2, 14)}`,
    strength,
  }
}

function _mockCityInfo(chainId) {
  const meta = CITY_NODE_META[chainId]
  return {
    city: meta?.name || `City ${chainId}`,
    countryCode: getCountryCode(chainId),
    chainId,
    cityId: chainId,
    suspicionLevel: Math.floor(Math.random() * 40) + 30,
    suspicionReasonHash: ethers.ZeroHash,
  }
}

const MOCK_LOCATIONS = Object.fromEntries(
  Object.keys(CITY_POOL_MAP).map((id) => [Number(id), getMockLocations(Number(id))])
)

// ── Read functions ──

/**
 * Get city info from a CityNode.
 * Calls cityInfo() + getSuspicionIndex(); falls back to mock.
 */
export async function getCityNodeInfo(chainId) {
  const contract = getCityNodeGameplayContract(chainId)
  if (!contract) return _mockCityInfo(chainId)

  try {
    const [info, suspicion] = await Promise.all([
      contract.cityInfo(),
      contract.getSuspicionIndex(),
    ])
    return {
      city: info.city || info[0],
      countryCode: info.countryCode || info[1],
      chainId: Number(info.chain || info[2]),
      cityId: Number(info._cityId || info[3]),
      suspicionLevel: Number(suspicion.level ?? suspicion[0]),
      suspicionReasonHash: suspicion.reasonHash || suspicion[1],
    }
  } catch (err) {
    console.warn(`[cityNode] getCityNodeInfo real call failed for chain ${chainId}, using mock:`, err.message)
    return _mockCityInfo(chainId)
  }
}

/**
 * Get locations for a CityNode (3 per city).
 * Calls getLocations(); enriches with display fields. Falls back to mock.
 */
export async function getCityNodeLocations(chainId) {
  const contract = getCityNodeGameplayContract(chainId)
  if (!contract) {
    return (MOCK_LOCATIONS[chainId] || []).map((loc, i) => ({
      ...loc,
      categoryLabel: CATEGORY_MAP[loc.category] || `Category ${loc.category}`,
      descriptionHash: ethers.ZeroHash,
      index: i,
      clueSlots: [null, null, null],
      inspected: false,
      scanned: false,
    }))
  }

  try {
    const rawLocations = await contract.getLocations()
    return rawLocations.map((loc, i) => ({
      name: loc.name,
      descriptionHash: loc.descriptionHash,
      category: Number(loc.category),
      categoryLabel: CATEGORY_MAP[Number(loc.category)] || `Category ${loc.category}`,
      fakeLevel: Number(loc.fakeLevel),
      riskLevel: Number(loc.riskLevel),
      description: "", // would come from IPFS via descriptionHash
      index: i,
      clueSlots: [null, null, null],
      inspected: false,
      scanned: false,
    }))
  } catch (err) {
    console.warn(`[cityNode] getLocations real call failed for chain ${chainId}, using mock:`, err.message)
    return (MOCK_LOCATIONS[chainId] || []).map((loc, i) => ({
      ...loc,
      categoryLabel: CATEGORY_MAP[loc.category] || `Category ${loc.category}`,
      descriptionHash: ethers.ZeroHash,
      index: i,
      clueSlots: [null, null, null],
      inspected: false,
      scanned: false,
    }))
  }
}

/**
 * Get anomaly tx refs from a CityNode.
 * Calls getAnomalyTxRefs(0, 50); enriches with display helpers. Falls back to mock.
 */
export async function getCityNodeAnomalyTxRefs(chainId) {
  const contract = getCityNodeGameplayContract(chainId)
  if (!contract) return _mockAnomalyTxRefs(chainId)

  try {
    const rawRefs = await contract.getAnomalyTxRefs(0, 50)
    return rawRefs.map((tx) => {
      const anomalyIdx = Number(tx.anomalyType)
      const sigHex = tx.methodSigLike
      return {
        refId: Number(tx.refId),
        txHashLike: tx.txHashLike,
        from: tx.from,
        to: tx.to,
        methodSigLike: sigHex,
        methodLabel: _methodSigToLabel(sigHex),
        blockLike: Number(tx.blockLike),
        valueLike: tx.valueLike,
        valueDisplay: ethers.formatEther(tx.valueLike),
        anomalyType: anomalyIdx,
        anomalyLabel: ANOMALY_TYPE_MAP[anomalyIdx] || `Type ${anomalyIdx}`,
      }
    })
  } catch (err) {
    console.warn(`[cityNode] getAnomalyTxRefs real call failed for chain ${chainId}, using mock:`, err.message)
    return _mockAnomalyTxRefs(chainId)
  }
}

const KNOWN_METHOD_SIGS = {
  "0xa9059cbb": "transfer",
  "0x095ea7b3": "approve",
  "0x38ed1739": "swap",
  "0x3ce33bff": "bridge",
  "0xd0e30db0": "deposit",
  "0x23b872dd": "transferFrom",
}

function _methodSigToLabel(sigHex) {
  if (!sigHex || sigHex === "0x00000000") return "unknown"
  const key = sigHex.slice(0, 10).toLowerCase()
  return KNOWN_METHOD_SIGS[key] || key
}

// ── Location transaction generators ──

function _seedFromParams(chainId, locationIdx) {
  let h = 5381
  const s = `${chainId}-${locationIdx}-txgen`
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff
  }
  return h
}

function _seededRng(seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function _hexFromSeed(val, length) {
  let hex = ""
  let h = (val >>> 0) || 1
  while (hex.length < length) {
    h = Math.imul(h, 0x5bd1e995) ^ (h >>> 15)
    hex += (h >>> 0).toString(16).padStart(8, "0")
  }
  return hex.slice(0, length)
}

function _generateLocationTxs(chainId, locationIdx, carmenWallet, carmenLocationIdx) {
  const seed = _seedFromParams(chainId, locationIdx)
  const rng = _seededRng(seed)
  const carmenIdx = carmenWallet ? getCarmenWalletIndex(carmenWallet._missionId || 0) : -1

  const count = 3 + Math.floor(rng() * 3) // 3-5 txs
  const normalMethods = [
    { sig: "0xa9059cbb", label: "transfer" },
    { sig: "0x095ea7b3", label: "approve" },
    { sig: "0x38ed1739", label: "swap" },
    { sig: "0x3ce33bff", label: "bridge" },
    { sig: "0xd0e30db0", label: "deposit" },
    { sig: "0x23b872dd", label: "transferFrom" },
  ]

  const txs = []
  for (let i = 0; i < count; i++) {
    const mIdx = Math.floor(rng() * normalMethods.length)
    const blockOffset = Math.floor(rng() * 200)
    const val = rng() * 5

    // pick from/to from wallet pool, excluding Carmen's wallet
    const [fromW, toW] = pickTxWallets(seed * 31 + i * 97, carmenIdx)

    txs.push({
      txHashLike: `0x${_hexFromSeed(seed * 31 + i * 97, 64)}`,
      from: fromW.address,
      to: toW.address,
      methodSigLike: normalMethods[mIdx].sig,
      methodLabel: normalMethods[mIdx].label,
      blockLike: 52884200 + blockOffset,
      valueLike: BigInt(Math.floor(val * 1e18)),
      valueDisplay: val.toFixed(4),
      anomalyType: null,
      anomalyLabel: null,
      isAnomaly: false,
    })
  }

  // inject exactly 1 Carmen tx if this is the Carmen location
  if (carmenWallet && locationIdx === carmenLocationIdx) {
    const [normalW] = pickTxWallets(seed * 59 + 777, carmenIdx)
    const cMIdx = Math.floor(rng() * normalMethods.length)
    const cVal = rng() * 3
    const carmenTx = {
      txHashLike: `0x${_hexFromSeed(seed * 41 + 9999, 64)}`,
      from: carmenWallet.address,
      to: normalW.address,
      methodSigLike: normalMethods[cMIdx].sig,
      methodLabel: normalMethods[cMIdx].label,
      blockLike: 52884200 + Math.floor(rng() * 200),
      valueLike: BigInt(Math.floor(cVal * 1e18)),
      valueDisplay: cVal.toFixed(4),
      anomalyType: null,
      anomalyLabel: null,
      isAnomaly: false,
    }
    // insert in the middle
    const insertPos = Math.floor(txs.length / 2)
    txs.splice(insertPos, 0, carmenTx)
  }

  return txs
}

/**
 * Build transaction list for a location, merging anomaly data from city-wide anomalyTxRefs.
 * Normal txs are always generated. Anomaly flags are set when refs exist (Carmen present).
 */
export function buildLocationTransactions(chainId, locationIdx, anomalyTxRefs, numLocations = 3, carmenWallet = null, carmenLocationIdx = null) {
  const txs = _generateLocationTxs(chainId, locationIdx, carmenWallet, carmenLocationIdx)

  if (!anomalyTxRefs || anomalyTxRefs.length === 0) return txs

  // distribute anomaly refs across locations by index
  const myAnomalies = anomalyTxRefs.filter((_, j) => j % numLocations === locationIdx)

  // mark first N normal txs as anomalous
  const limit = Math.min(myAnomalies.length, txs.length)
  for (let k = 0; k < limit; k++) {
    txs[k].isAnomaly = true
    txs[k].anomalyType = myAnomalies[k].anomalyType
    txs[k].anomalyLabel = myAnomalies[k].anomalyLabel
  }

  return txs
}

function _mockAnomalyTxRefs(chainId) {
  const sigs = ["0xa9059cbb", "0x095ea7b3", "0x38ed1739", "0x3ce33bff", "0xd0e30db0"]
  const labels = ["transfer", "approve", "swap", "bridge", "deposit"]

  return Array.from({ length: 5 }, (_, i) => ({
    refId: i + 1,
    txHashLike: ethers.id(`mock-tx-${chainId}-${i}`),
    from: WALLET_POOL[i % 25].address,
    to: WALLET_POOL[(i + 5) % 25].address,
    methodSigLike: sigs[i],
    methodLabel: labels[i],
    blockLike: 52884300 + i * 10,
    valueLike: BigInt(Math.floor(Math.random() * 10e18)),
    valueDisplay: (Math.random() * 10).toFixed(4),
    anomalyType: i,
    anomalyLabel: ANOMALY_TYPE_MAP[i],
  }))
}

/**
 * Get suspect wallets from a CityNode.
 * Calls getSuspectWallets(0, 50); derives tags array. Falls back to mock.
 */
export async function getCityNodeSuspectWallets(chainId) {
  const contract = getCityNodeGameplayContract(chainId)
  if (!contract) return _mockSuspectWallets()

  try {
    const rawWallets = await contract.getSuspectWallets(0, 50)
    return rawWallets.map((s) => ({
      wallet: s.wallet,
      suspicionLevel: Number(s.suspicionLevel),
      txRefIds: s.txRefIds.map((id) => BigInt(id)),
      tagsBitmap: BigInt(s.tagsBitmap),
      tags: decodeTags(s.tagsBitmap),
    }))
  } catch (err) {
    console.warn(`[cityNode] getSuspectWallets real call failed for chain ${chainId}, using mock:`, err.message)
    return _mockSuspectWallets()
  }
}

function _mockSuspectWallets() {
  // pick 3 wallets from pool (indices 2, 7, 15)
  const picks = [2, 7, 15]
  const levels = [87, 62, 45]
  const bitmaps = [3n, 12n, 16n]
  const refs = [[1n, 2n, 3n, 4n], [2n, 5n], [3n]]

  return picks.map((idx, i) => ({
    wallet: WALLET_POOL[idx].address,
    suspicionLevel: levels[i],
    txRefIds: refs[i],
    tagsBitmap: bitmaps[i],
    tags: decodeTags(bitmaps[i]),
  }))
}

/**
 * Get player energy from a CityNode.
 * Calls getEnergy(player); returns single uint32. Falls back to MAX_ENERGY.
 */
export async function getCityNodeEnergy(chainId, player) {
  const contract = getCityNodeGameplayContract(chainId)
  if (!contract || !player) return MAX_ENERGY

  try {
    const energy = await contract.getEnergy(player)
    return Number(energy)
  } catch (err) {
    console.warn(`[cityNode] getEnergy real call failed for chain ${chainId}, using default:`, err.message)
    return MAX_ENERGY
  }
}

/**
 * Get player progress on a CityNode.
 * Calls getPlayerProgress(player). Falls back to zeros.
 */
export async function getCityNodePlayerProgress(chainId, player) {
  const contract = getCityNodeGameplayContract(chainId)
  if (!contract || !player) return { inspectedBitmap: 0, cluesFound: 0, scansCompleted: 0 }

  try {
    const progress = await contract.getPlayerProgress(player)
    return {
      inspectedBitmap: Number(progress.inspectedBitmap ?? progress[0]),
      cluesFound: Number(progress.cluesFound ?? progress[1]),
      scansCompleted: Number(progress.scansCompleted ?? progress[2]),
    }
  } catch (err) {
    console.warn(`[cityNode] getPlayerProgress failed for chain ${chainId}:`, err.message)
    return { inspectedBitmap: 0, cluesFound: 0, scansCompleted: 0 }
  }
}

/**
 * Get evidence summary for a player.
 * Calls getEvidenceSummary(player). Falls back to zeros.
 */
export async function getCityNodeEvidenceSummary(chainId, player) {
  const contract = getCityNodeGameplayContract(chainId)
  if (!contract || !player) return { totalClues: 0, bundleHashLike: ethers.ZeroHash, confidence: 0 }

  try {
    const summary = await contract.getEvidenceSummary(player)
    return {
      totalClues: Number(summary.totalClues ?? summary[0]),
      bundleHashLike: summary.bundleHashLike || summary[1],
      confidence: Number(summary.confidence ?? summary[2]),
    }
  } catch (err) {
    console.warn(`[cityNode] getEvidenceSummary failed for chain ${chainId}:`, err.message)
    return { totalClues: 0, bundleHashLike: ethers.ZeroHash, confidence: 0 }
  }
}

// ── Write functions ──

/**
 * Inspect a location on a CityNode.
 * Direct tx — completes in one transaction (no oracle callback).
 */
export async function cityNodeInspectLocation(chainId, locationIdx) {
  if (!isCityNodeConfigured(chainId)) {
    console.log(`[cityNode] inspectLocation(${locationIdx}) on chain ${chainId} — MOCK`)
    await new Promise((r) => setTimeout(r, 1500))
    return {
      hash: `0x${Math.random().toString(16).slice(2, 14)}...mock`,
      blockNumber: 52884300 + Math.floor(Math.random() * 100),
      noteHash: ethers.ZeroHash,
    }
  }

  const contract = await getCityNodeWriteContract(chainId)
  const tx = await contract.inspectLocation(locationIdx)
  const receipt = await tx.wait()

  // Parse LocationInspected event from receipt
  let noteHash = ethers.ZeroHash
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log)
      if (parsed?.name === "LocationInspected") {
        noteHash = parsed.args.noteHash || parsed.args[2]
        break
      }
    } catch (_) { /* skip unparseable logs */ }
  }

  return {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    noteHash,
  }
}

/**
 * Scan anomalies at a location.
 * Direct tx — completes in one transaction.
 */
export async function cityNodeScanAnomalies(chainId, locationIdx) {
  if (!isCityNodeConfigured(chainId)) {
    console.log(`[cityNode] scanAnomalies(${locationIdx}) on chain ${chainId} — MOCK`)
    await new Promise((r) => setTimeout(r, 2000))
    return {
      hash: `0x${Math.random().toString(16).slice(2, 14)}...mock`,
      blockNumber: 52884300 + Math.floor(Math.random() * 100),
      anomaliesFound: 2 + Math.floor(Math.random() * 3),
      suspectsFound: 1 + Math.floor(Math.random() * 2),
    }
  }

  const contract = await getCityNodeWriteContract(chainId)
  const tx = await contract.scanAnomalies(locationIdx)
  const receipt = await tx.wait()

  // Count linked anomalies and suspects from events
  let anomaliesFound = 0
  let suspectsFound = 0
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log)
      if (parsed?.name === "AnomalyTxLinked") anomaliesFound++
      if (parsed?.name === "SuspectWalletObserved") suspectsFound++
    } catch (_) { /* skip */ }
  }

  return {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    anomaliesFound,
    suspectsFound,
  }
}

/**
 * Request a clue at a location.
 * Async tx — sends request, then waits for GM resolve event (ClueUnlocked or DeadEnd).
 */
export async function cityNodeRequestClue(chainId, locationIdx, clueIndex, isStartingClue = false) {
  if (!isCityNodeConfigured(chainId)) {
    console.log(`[cityNode] requestClue(${locationIdx}, ${clueIndex}) on chain ${chainId} — MOCK${isStartingClue ? ' [STARTING CLUE]' : ''}`)
    await new Promise((r) => setTimeout(r, 2500))
    return _mockClueResult(chainId, locationIdx, clueIndex, null, null, isStartingClue)
  }

  // Try real contract call; fall back to mock if GM is unreachable
  try {
    const contract = await getCityNodeWriteContract(chainId)
    const tx = await contract.requestClue(locationIdx, clueIndex)
    const receipt = await tx.wait()

    // Parse ClueRequested event for requestId
    let requestId = 0
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log)
        if (parsed?.name === "ClueRequested") {
          requestId = Number(parsed.args.requestId || parsed.args[0])
          break
        }
      } catch (_) { /* skip */ }
    }

    // Wait for ClueUnlocked or DeadEnd event from GM resolve (timeout 15s, then fallback)
    const readContract = getCityNodeGameplayContract(chainId)
    const CLUE_TYPE_NAMES = ["BEHAVIOR_FINGERPRINT", "RELATIONSHIP", "IDENTITY_COMMIT", "FUNDING_TRAIL", "TECHNICAL_SIGNATURE", "DEAD_END"]

    return await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup()
        console.warn(`[cityNode] GM resolve timeout — using mock clue for location ${locationIdx}, clue ${clueIndex}`)
        resolve(_mockClueResult(chainId, locationIdx, clueIndex, receipt.hash, receipt.blockNumber))
      }, 15_000)

      let clueUnsub, deadEndUnsub
      const cleanup = () => {
        clearTimeout(timeout)
        if (clueUnsub) readContract.off("ClueUnlocked", clueUnsub)
        if (deadEndUnsub) readContract.off("DeadEnd", deadEndUnsub)
      }

      clueUnsub = (player, idx, ci, clueType, clueDataHash, anomalyRefId) => {
        if (Number(idx) !== locationIdx || Number(ci) !== clueIndex) return
        cleanup()
        resolve({
          hash: receipt.hash,
          blockNumber: receipt.blockNumber,
          requestId,
          resolved: true,
          clueType: CLUE_TYPE_NAMES[Number(clueType)] || `Type ${clueType}`,
          clueData: `Clue resolved: ${clueDataHash.slice(0, 14)}...`,
          anomalyRefId: anomalyRefId,
          strength: 50 + Math.floor(Math.random() * 40),
        })
      }

      deadEndUnsub = (player, idx, consolationHintHash) => {
        if (Number(idx) !== locationIdx) return
        cleanup()
        resolve({
          hash: receipt.hash,
          blockNumber: receipt.blockNumber,
          requestId,
          resolved: true,
          clueType: "DEAD_END",
          clueData: "Dead end — no actionable intel at this position.",
          anomalyRefId: consolationHintHash,
          strength: 10,
        })
      }

      readContract.on("ClueUnlocked", clueUnsub)
      readContract.on("DeadEnd", deadEndUnsub)
    })
  } catch (err) {
    console.warn(`[cityNode] requestClue real call failed for chain ${chainId}, using mock:`, err.message)
    await new Promise((r) => setTimeout(r, 2000))
    return _mockClueResult(chainId, locationIdx, clueIndex)
  }
}

/**
 * Flag a transaction reference.
 * Direct tx. Contract takes bytes32 refId.
 */
export async function cityNodeFlagTx(chainId, refId) {
  if (!isCityNodeConfigured(chainId)) {
    console.log(`[cityNode] flagTx(${refId}) on chain ${chainId} — MOCK`)
    await new Promise((r) => setTimeout(r, 1000))
    return { hash: `0x${Math.random().toString(16).slice(2, 14)}...mock` }
  }

  // Contract expects bytes32; convert if needed
  let bytes32RefId = refId
  if (typeof refId === "number" || typeof refId === "bigint") {
    bytes32RefId = ethers.zeroPadValue(ethers.toBeHex(BigInt(refId)), 32)
  }

  const contract = await getCityNodeWriteContract(chainId)
  const tx = await contract.flagTx(bytes32RefId)
  const receipt = await tx.wait()
  return { hash: receipt.hash }
}

/**
 * Request a dossier (evidence summary analysis).
 * Async tx — sends request, then waits for DossierResolved event.
 */
export async function cityNodeRequestDossier(chainId) {
  if (!isCityNodeConfigured(chainId)) {
    console.log(`[cityNode] requestDossier() on chain ${chainId} — MOCK`)
    await new Promise((r) => setTimeout(r, 3000))
    return {
      hash: `0x${Math.random().toString(16).slice(2, 14)}...mock`,
      requestId: Date.now(),
      resolved: true,
      summary: "Cross-chain bridge usage pattern matches known Carmen Sandiego operational signature. Assets move BNB\u2192Polygon\u2192Arbitrum in rapid succession.",
      hypotheses: [
        "Carmen is using shadow wrapping to disguise stolen NFTs across chains.",
        "A custody router at the Airport node is the primary laundering venue.",
      ],
      gaps: ["No direct identity link yet \u2014 need more clue data from Location #2."],
      nextObjective: "Investigate the Custody Protocol location for identity clues.",
      confidence: 65,
    }
  }

  const contract = await getCityNodeWriteContract(chainId)
  const tx = await contract.requestDossier()
  const receipt = await tx.wait()

  // Parse DossierRequested for requestId
  let requestId = 0
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log)
      if (parsed?.name === "DossierRequested") {
        requestId = Number(parsed.args.requestId || parsed.args[0])
        break
      }
    } catch (_) { /* skip */ }
  }

  // Wait for DossierResolved (timeout 60s)
  const readContract = getCityNodeGameplayContract(chainId)

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error("GM dossier resolve timeout (60s)"))
    }, 60_000)

    let handler
    const cleanup = () => {
      clearTimeout(timeout)
      if (handler) readContract.off("DossierResolved", handler)
    }

    handler = (evtRequestId, player, dossierHash, confidence, nextObjectiveHintHash) => {
      if (Number(evtRequestId) !== requestId) return
      cleanup()
      resolve({
        hash: receipt.hash,
        requestId,
        resolved: true,
        summary: `Dossier compiled: ${dossierHash.slice(0, 14)}...`,
        hypotheses: ["Evidence pattern analysis complete."],
        gaps: [],
        nextObjective: `Next objective hint: ${nextObjectiveHintHash.slice(0, 14)}...`,
        confidence: Number(confidence),
      })
    }

    readContract.on("DossierResolved", handler)
  })
}

/**
 * Request capture of a suspect wallet.
 * Async tx — sends request, then waits for CaptureResolved event.
 */
export async function cityNodeRequestCapture(chainId, suspectWallet, evidenceBundleHash) {
  if (!isCityNodeConfigured(chainId)) {
    console.log(`[cityNode] requestCapture(${suspectWallet}) on chain ${chainId} — MOCK`)
    await new Promise((r) => setTimeout(r, 3500))
    const success = Math.random() > 0.4
    const reasonCodes = ["INSUFFICIENT_EVIDENCE", "WALLET_MISMATCH", "WRONG_CITY"]
    return {
      hash: `0x${Math.random().toString(16).slice(2, 14)}...mock`,
      requestId: Date.now(),
      resolved: true,
      success,
      reasonCode: success ? "OK" : reasonCodes[Math.floor(Math.random() * reasonCodes.length)],
      gmNote: success
        ? "Target confirmed! Carmen Sandiego apprehended."
        : "Capture failed. Review your evidence and try again.",
    }
  }

  const bundleHash = evidenceBundleHash || ethers.ZeroHash
  const contract = await getCityNodeWriteContract(chainId)
  const tx = await contract.requestCapture(suspectWallet, bundleHash)
  const receipt = await tx.wait()

  // Parse CaptureRequested for requestId
  let requestId = 0
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log)
      if (parsed?.name === "CaptureRequested") {
        requestId = Number(parsed.args.requestId || parsed.args[0])
        break
      }
    } catch (_) { /* skip */ }
  }

  // Wait for CaptureResolved (timeout 60s)
  const REASON_CODE_NAMES = ["OK", "INSUFFICIENT_EVIDENCE", "WALLET_MISMATCH", "WRONG_CITY", "EXPIRED_REQUEST", "INVALID_BUNDLE"]
  const readContract = getCityNodeGameplayContract(chainId)

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error("GM capture resolve timeout (60s)"))
    }, 60_000)

    let handler
    const cleanup = () => {
      clearTimeout(timeout)
      if (handler) readContract.off("CaptureResolved", handler)
    }

    handler = (evtRequestId, player, wallet, success, reasonCode, gmNoteHash) => {
      if (Number(evtRequestId) !== requestId) return
      cleanup()
      resolve({
        hash: receipt.hash,
        requestId,
        resolved: true,
        success: Boolean(success),
        reasonCode: REASON_CODE_NAMES[Number(reasonCode)] || `Code ${reasonCode}`,
        gmNote: success
          ? "Target confirmed! Carmen Sandiego apprehended."
          : `Capture failed: ${gmNoteHash.slice(0, 14)}...`,
      })
    }

    readContract.on("CaptureResolved", handler)
  })
}

// ── CityNode Event Listeners ──

/**
 * Listen for CityNode gameplay events for a specific player.
 * Returns an unsubscribe function.
 */
export async function onCityNodeEvents(chainId, playerAddress, callbacks) {
  const contract = getCityNodeGameplayContract(chainId)
  if (!contract) return () => {}

  const unsubs = []

  if (callbacks.onLocationInspected) {
    const handler = (player, idx, noteHash) => {
      if (player.toLowerCase() !== playerAddress.toLowerCase()) return
      callbacks.onLocationInspected({ player, idx: Number(idx), noteHash })
    }
    contract.on("LocationInspected", handler)
    unsubs.push(() => contract.off("LocationInspected", handler))
  }

  if (callbacks.onClueUnlocked) {
    const handler = (player, idx, clueIndex, clueType, clueDataHash, anomalyRefId) => {
      if (player.toLowerCase() !== playerAddress.toLowerCase()) return
      callbacks.onClueUnlocked({
        player,
        idx: Number(idx),
        clueIndex: Number(clueIndex),
        clueType: Number(clueType),
        clueDataHash,
        anomalyRefId,
      })
    }
    contract.on("ClueUnlocked", handler)
    unsubs.push(() => contract.off("ClueUnlocked", handler))
  }

  if (callbacks.onEnergySpent) {
    const handler = (player, amount, remaining, actionType) => {
      if (player.toLowerCase() !== playerAddress.toLowerCase()) return
      callbacks.onEnergySpent({
        player,
        amount: Number(amount),
        remaining: Number(remaining),
        actionType: Number(actionType),
      })
    }
    contract.on("EnergySpent", handler)
    unsubs.push(() => contract.off("EnergySpent", handler))
  }

  if (callbacks.onCaptureResolved) {
    const handler = (requestId, player, wallet, success, reasonCode, gmNoteHash) => {
      if (player.toLowerCase() !== playerAddress.toLowerCase()) return
      callbacks.onCaptureResolved({
        requestId: Number(requestId),
        player,
        wallet,
        success: Boolean(success),
        reasonCode: Number(reasonCode),
        gmNoteHash,
      })
    }
    contract.on("CaptureResolved", handler)
    unsubs.push(() => contract.off("CaptureResolved", handler))
  }

  return () => unsubs.forEach((fn) => fn())
}
