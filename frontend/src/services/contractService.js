/**
 * Contract Service — ethers v6 integration with GameMaster on Sepolia
 *
 * Provides all blockchain interactions for the Carmen Sandiego game.
 * Uses BrowserProvider (MetaMask/Privy) for signing transactions.
 */

import { ethers } from "ethers"
import { CITY_POOL, CITY_POOL_MAP, CHAIN_DEFS, CITYNODE_CONFIG, HARDHAT_CITY_IDS, getMockLocations, getMockClueData, getCountryCode } from '../data/cityRegistry'
import { WALLET_POOL, pickTxWallets, getCarmenWalletIndex } from '../data/walletPool'
import { getActiveRoute, getCityRole, getNextCity, getNearestPathCity } from '../data/scriptedRoutes'
import GameMasterArtifact from "../abi/GameMaster.json"
import CityNodeArtifact from "../abi/CityNode.json"
import MissionNFTArtifact from "../abi/MissionNFT.json"
import {
  relayFlagTx as relayFlagTxService,
  relayRequestClue as relayRequestClueService,
  relayRequestDossier as relayRequestDossierService,
  relayRequestCapture as relayCaptureService,
  relayInspectLocation as relayInspectService,
  relayScanAnomalies as relayScanService,
} from "./relayService"

// ============================================================
//  Visual Logging for Video Demo
// ============================================================

const _cl = (tag, color, ...args) => {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(
    `%c[${ts}] %c${tag}`,
    "color:#888;font-weight:bold",
    `color:${color};font-weight:bold;font-size:11px`,
    ...args
  )
}
const bcRead   = (...a) => _cl("BLOCKCHAIN 📖 READ      ", "#3498db", ...a)
const bcWrite  = (...a) => _cl("BLOCKCHAIN ✍️  WRITE     ", "#e67e22", ...a)
const bcResult = (...a) => _cl("BLOCKCHAIN ✅ RESULT     ", "#27ae60", ...a)
const _bcEvent = (...a) => _cl("BLOCKCHAIN ⚡ EVENT      ", "#f39c12", ...a)
const _bcChain = (...a) => _cl("CHAINLINK  🔗 SERVICE    ", "#8e44ad", ...a)
const bcCCIP   = (...a) => _cl("CHAINLINK  🌐 CCIP       ", "#2980b9", ...a)
const bcVRF    = (...a) => _cl("CHAINLINK  🎲 VRF        ", "#16a085", ...a)
const bcDF     = (...a) => _cl("CHAINLINK  📊 DATA FEED  ", "#c0392b", ...a)
const bcCRE    = (...a) => _cl("CHAINLINK  ⚙️  CRE/WASM   ", "#d35400", ...a)
const bcCity   = (...a) => _cl("CITYNODE   🏙️  CROSS-CHAIN", "#2c3e50", ...a)
const bcWarn   = (...a) => _cl("BLOCKCHAIN ⚠️  WARN      ", "#e74c3c", ...a)

// ============================================================
//  Feature Flags
// ============================================================

/** When true, CityNode functions return mock data without attempting real contract calls. */
const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true'

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
export const HARDHAT_CHAIN_ID = 31337

// CITY_NODE_META: all cities with chain metadata + deployable status
const CITY_NODE_META = Object.fromEntries(
  Object.entries(CITY_POOL_MAP).map(([id, city]) => [
    Number(id),
    {
      name: city.name,
      chain: city.chain,
      chainId: city.chainId,
      deployable: CHAIN_DEFS[city.chainId]?.deployable ?? false,
      comingSoon: CHAIN_DEFS[city.chainId]?.comingSoon ?? false,
    },
  ])
)

// CITY_NODE_ADDRESSES: chainId → deployed contract address (real chains only)
// Env var format: VITE_CITYNODE_{CHAIN_NAME_UPPERCASE_UNDERSCORED}_ADDRESS
const CITY_NODE_ADDRESSES = Object.fromEntries(
  Object.entries(CITYNODE_CONFIG)
    .filter(([, cfg]) => cfg.deployable)
    .map(([chainId]) => {
      const chainName = CHAIN_DEFS[chainId]?.name?.toUpperCase().replace(/\s+/g, '_') ?? chainId
      return [Number(chainId), import.meta.env[`VITE_CITYNODE_${chainName}_ADDRESS`] || null]
    })
)

// CITY_NODE_RPC_URLS: chainId → RPC URL (env override or default)
// Env var format: VITE_{CHAIN_NAME_UPPERCASE_UNDERSCORED}_RPC_URL
const CITY_NODE_RPC_URLS = Object.fromEntries(
  Object.entries(CITYNODE_CONFIG).map(([chainId, cfg]) => {
    const chainName = CHAIN_DEFS[chainId]?.name?.toUpperCase().replace(/\s+/g, '_') ?? chainId
    return [Number(chainId), import.meta.env[`VITE_${chainName}_RPC_URL`] || cfg.rpcUrl || null]
  })
)

// HARDHAT_CITYNODE_ADDRESSES: cityId → local Hardhat CityNode address
// Used when chainId === 31337 (local Hardhat node).
// Env var format: VITE_HARDHAT_CITYNODE_{cityId}_ADDRESS
const HARDHAT_CITYNODE_ADDRESSES = Object.fromEntries(
  HARDHAT_CITY_IDS.map((cityId) => [
    cityId,
    import.meta.env[`VITE_HARDHAT_CITYNODE_${cityId}_ADDRESS`] || null,
  ])
)

/**
 * Resolve a cityId (unique, e.g. 512 for Rio) to the real blockchain chainId (e.g. 51 for XDC).
 * If the id is already a real chainId (e.g. 51), returns it as-is.
 */
function resolveChainId(cityId) {
  return CITY_POOL_MAP[cityId]?.chainId || cityId
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

export const MAX_ENERGY = 20
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
let _readProvider = null
// _eventProvider removed — all event polling now uses getReadProvider()
let _externalEip1193 = null

/**
 * Inject an external EIP-1193 provider (e.g. from Privy embedded wallet).
 * Call this once after wallet login before any write transactions.
 */
export function initializeExternalProvider(eip1193Provider) {
  _externalEip1193 = eip1193Provider
  _provider = null
  _signer = null
}

export async function getProvider() {
  if (_provider) return _provider
  const eip1193 = _externalEip1193 || window.ethereum
  if (!eip1193) throw new Error("No wallet detected — call initializeExternalProvider() first")
  _provider = new ethers.BrowserProvider(eip1193)
  return _provider
}

export async function getSigner() {
  if (_signer) return _signer
  const provider = await getProvider()
  _signer = await provider.getSigner()
  return _signer
}

export async function getReadProvider() {
  if (_readProvider) return _readProvider
  const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL
    || import.meta.env.VITE_ALCHEMY_RPC_URL_SEPOLIA
    || "https://rpc.ankr.com/eth_sepolia"
  _readProvider = new ethers.JsonRpcProvider(rpcUrl)
  return _readProvider
}

export async function getContract() {
  const signer = await getSigner()
  return new ethers.Contract(GAME_MASTER_ADDRESS, GAME_MASTER_ABI, signer)
}

export async function getReadContract() {
  const provider = await getReadProvider()
  return new ethers.Contract(GAME_MASTER_ADDRESS, GAME_MASTER_ABI, provider)
}

/**
 * Poll-based event watcher using getLogs instead of eth_newFilter.
 * Avoids "filter not found" errors from Alchemy's filter expiry.
 * @param {ethers.Contract} contract
 * @param {object} filter - ethers event filter
 * @param {Function} handler - called with decoded event args
 * @param {number} intervalMs - polling interval (default 6s)
 * @returns {Function} unsubscribe
 */
function pollEvents(contract, filter, handler, intervalMs = 6000) {
  let lastBlock = -1
  let stopped = false

  const poll = async () => {
    if (stopped) return
    try {
      const provider = contract.runner?.provider || contract.provider
      const currentBlock = await provider.getBlockNumber()
      const rawFrom = lastBlock === -1 ? currentBlock : lastBlock + 1
      // Alchemy free tier caps eth_getLogs at 10 blocks per query
      const fromBlock = Math.max(rawFrom, currentBlock - 9)
      if (fromBlock > currentBlock) return
      const events = await contract.queryFilter(filter, fromBlock, currentBlock)
      lastBlock = currentBlock
      for (const ev of events) {
        try { handler(ev) } catch { /* handler error, skip */ }
      }
    } catch (err) {
      // silently retry next interval — avoids crashing on transient RPC errors
      console.warn('[pollEvents] poll error:', err.message)
    }
  }

  // initial poll
  poll()
  const id = setInterval(poll, intervalMs)

  return () => { stopped = true; clearInterval(id) }
}

/**
 * One-shot poll-based event watcher. Polls rapidly until the matcher returns
 * a truthy value, then resolves with that value. Auto-stops on timeout.
 * Used for requestClue/requestDossier/requestCapture where we wait for a
 * single matching event after a transaction.
 * @param {ethers.Contract} contract
 * @param {object} filter - ethers event filter
 * @param {Function} matcher - (parsedLog) => result|null — return non-null to resolve
 * @param {number} timeoutMs - max wait time (default 60s)
 * @param {number} intervalMs - polling interval (default 3s)
 * @returns {Promise<any>} resolves with matcher result or rejects on timeout
 */
function pollOnce(contract, filter, matcher, timeoutMs = 60000, intervalMs = 3000) {
  return new Promise((resolve, reject) => {
    let lastBlock = -1
    let stopped = false

    const timeout = setTimeout(() => {
      stopped = true
      clearInterval(id)
      reject(new Error(`pollOnce timeout (${timeoutMs / 1000}s)`))
    }, timeoutMs)

    const poll = async () => {
      if (stopped) return
      try {
        const provider = contract.runner?.provider || contract.provider
        const currentBlock = await provider.getBlockNumber()
        const fromBlock = lastBlock === -1 ? currentBlock : lastBlock + 1
        if (fromBlock > currentBlock) return
        const events = await contract.queryFilter(filter, fromBlock, currentBlock)
        lastBlock = currentBlock
        for (const ev of events) {
          try {
            const parsed = contract.interface.parseLog(ev)
            if (!parsed) continue
            const result = matcher(parsed)
            if (result) {
              stopped = true
              clearInterval(id)
              clearTimeout(timeout)
              resolve(result)
              return
            }
          } catch { /* skip */ }
        }
      } catch (err) {
        console.warn('[pollOnce] poll error:', err.message)
      }
    }

    poll()
    const id = setInterval(poll, intervalMs)
  })
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

function getCityNodeReadContract(chainId, cityId) {
  let address, rpcUrl

  if (chainId === 31337) {
    address = cityId ? HARDHAT_CITYNODE_ADDRESSES[cityId] : null
    rpcUrl = import.meta.env.VITE_HARDHAT_LOCAL_RPC_URL || 'http://localhost:8545'
  } else {
    address = CITY_NODE_ADDRESSES[chainId]
    rpcUrl = CITY_NODE_RPC_URLS[chainId]
  }

  if (!address) throw new Error(`CityNode address not configured for chainId ${chainId}`)
  if (!rpcUrl) throw new Error(`RPC URL not configured for chainId ${chainId}`)

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
    const [cityName, nodeChainId, owner, gameMasterAddr, carmenPresent] = await Promise.all([
      contract.cityName(),
      contract.chainId(),
      contract.owner(),
      contract.gameMaster(),
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
      gameMaster: gameMasterAddr,
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
 * Tries gasless relay first; falls back to direct contract call.
 * @param {string} publicKeyHex - 0x-prefixed uncompressed public key (130 hex chars)
 */
export async function registerPlayer(publicKeyHex) {
  bcWrite(`GameMaster.registerPlayer(pubKey=${publicKeyHex.slice(0, 14)}...) — direct TX (msg.sender = player)`)
  // GameMaster uses msg.sender — must use player's own signer, never the relay
  const contract = await getContract()
  const tx = await contract.registerPlayer(publicKeyHex)
  const receipt = await tx.wait()
  bcResult(`registerPlayer confirmed ✓ tx: ${receipt.hash.slice(0, 18)}`)
  return receipt
}

/**
 * Check if player is registered (has public key on-chain).
 * @param {string} address
 * @returns {boolean}
 */
export async function isPlayerRegistered(address) {
  bcRead(`GameMaster.getPlayerPublicKey(${address.slice(0, 10)}...)`)
  const contract = await getReadContract()
  const pubKey = await contract.getPlayerPublicKey(address)
  const registered = pubKey && pubKey.length > 2
  bcResult(`isPlayerRegistered = ${registered}`)
  return registered
}

/**
 * Get player's on-chain ECIES public key (hex string).
 * Returns null if not registered.
 */
export async function getPlayerOnChainPublicKey(address) {
  const contract = await getReadContract()
  const pubKey = await contract.getPlayerPublicKey(address)
  if (!pubKey || pubKey.length <= 2) return null
  return pubKey
}

/**
 * Get player's active mission ID (0 = no active mission).
 * @param {string} address
 * @returns {bigint}
 */
export async function getPlayerActiveMission(address) {
  bcRead(`GameMaster.getPlayerActiveMission(${address.slice(0, 10)}...)`)
  const contract = await getReadContract()
  const missionId = await contract.getPlayerActiveMission(address)
  bcResult(`Active mission = ${missionId.toString()}${missionId === 0n ? " (none)" : ""}`)
  return missionId
}

// ============================================================
//  Mission Functions
// ============================================================

/**
 * Start a new mission (triggers VRF).
 * Tries gasless relay first; falls back to direct contract call.
 */
export async function startMission() {
  bcWrite("GameMaster.startMission() → triggers Chainlink VRF v2.5 for random city selection")
  bcVRF("VRF v2.5 will generate random seed → keccak256(chainId, salt) = targetHash")
  // GameMaster uses msg.sender — must use player's own signer, never the relay
  const contract = await getContract()
  const tx = await contract.startMission()
  const receipt = await tx.wait()
  bcResult(`startMission confirmed ✓ tx: ${receipt.hash.slice(0, 18)}`)
  return receipt
}

/**
 * Submit investigation for a city.
 * Tries gasless relay first; falls back to direct contract call.
 * @param {number|bigint} chainId - The city's chain ID (421614, 84532, or 51)
 */
export async function submitInvestigation(chainId) {
  bcWrite(`GameMaster.submitInvestigation(chainId=${chainId}) → CRE WASM workflow evaluates evidence`)
  bcCRE(`CRE will process: analyze clues → resolve investigation → emit events`)
  // GameMaster uses msg.sender — must use player's own signer, never the relay
  const contract = await getContract()
  const tx = await contract.submitInvestigation(chainId)
  const receipt = await tx.wait()
  bcResult(`submitInvestigation confirmed ✓ tx: ${receipt.hash.slice(0, 18)}`)
  return receipt
}

/**
 * Get mission data.
 * @param {number|bigint} missionId
 * @returns {{ player, startBlock, targetHash, cluesReceived, investigationsCount, status }}
 */
export async function getMission(missionId) {
  bcRead(`GameMaster.getMission(${missionId})`)
  const contract = await getReadContract()
  const m = await contract.getMission(missionId)
  const statusMap = { 0: "None", 1: "Active", 2: "Completed", 3: "Failed" }
  bcResult(`Mission #${missionId}: status=${statusMap[Number(m.status)]}, clues=${Number(m.cluesReceived)}, investigations=${Number(m.investigationsCount)}`)
  return {
    player: m.player,
    startBlock: m.startBlock,
    targetHash: m.targetHash,
    cluesReceived: Number(m.cluesReceived),
    investigationsCount: Number(m.investigationsCount),
    status: Number(m.status),
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
  bcRead("GameMaster.getValidCities()")
  const contract = await getReadContract()
  const cities = await contract.getValidCities()
  const ids = cities.map((c) => Number(c))
  bcResult(`Valid cities: [${ids.join(", ")}] (${ids.length} chains)`)
  return ids
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

// ============================================================
//  Chainlink Data Feed — ETH/USD Price
// ============================================================

/** Chainlink AggregatorV3Interface ABI (latestRoundData only) */
const AGGREGATOR_V3_ABI = [
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() external view returns (uint8)",
]

/** ETH/USD Price Feed on Sepolia */
const ETH_USD_PRICE_FEED_SEPOLIA = "0x694AA1769357215DE4FAC081bf1f309aDC325306"

/**
 * Read ETH/USD price directly from Chainlink Data Feed on Sepolia.
 * Falls back gracefully if the feed is unavailable.
 * @returns {{ price: number, decimals: number, formatted: string, multiplier: number }}
 */
export async function getETHPrice() {
  try {
    bcDF(`Chainlink ETH/USD Price Feed (${ETH_USD_PRICE_FEED_SEPOLIA.slice(0, 10)}...)`)
    bcDF("AggregatorV3.latestRoundData() — reading on-chain oracle price")
    const provider = await getReadProvider()
    const priceFeed = new ethers.Contract(ETH_USD_PRICE_FEED_SEPOLIA, AGGREGATOR_V3_ABI, provider)
    const [, answer] = await priceFeed.latestRoundData()
    const dec = await priceFeed.decimals()
    const priceUsd = Number(answer) / 10 ** Number(dec)

    // Calculate reward multiplier (mirrors contract logic)
    let multiplier = 1.0
    if (priceUsd > 2500) {
      const bonus = (priceUsd - 2500) / 100
      multiplier = 1.0 + bonus / 100
    }

    bcDF(`ETH/USD = $${priceUsd.toFixed(2)} | decimals=${Number(dec)} | reward multiplier=${multiplier.toFixed(4)}x`)
    return {
      price: priceUsd,
      decimals: Number(dec),
      formatted: priceUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
      multiplier,
    }
  } catch (err) {
    bcWarn(`Failed to fetch ETH price from Chainlink Data Feed: ${err.message}`)
    return { price: 0, decimals: 8, formatted: "$0", multiplier: 1.0 }
  }
}

/**
 * Read market data from GameMaster contract (if price feed is configured on-chain).
 * @returns {{ ethPrice: bigint, multiplier: number }}
 */
export async function getMarketData() {
  try {
    bcDF("GameMaster.getMarketData() — on-chain Data Feed integration")
    const contract = await getReadContract()
    const [ethPrice, multiplierBps] = await contract.getMarketData()
    bcDF(`On-chain market: ETH=${ethPrice.toString()} | multiplier=${Number(multiplierBps)/10000}x`)
    return {
      ethPrice,
      multiplier: Number(multiplierBps) / 10000,
    }
  } catch {
    return { ethPrice: 0n, multiplier: 1.0 }
  }
}

/**
 * Listen for WalletFragmentReceived events for a specific mission.
 * Uses getLogs polling — no eth_newFilter needed.
 */
export async function onWalletFragmentReceived(missionId, callback) {
  try {
    const contract = await getReadContract()
    if (!contract.filters?.WalletFragmentReceived) return () => {}
    const filter = contract.filters.WalletFragmentReceived(missionId)
    return pollEvents(contract, filter, (ev) => {
      const a = ev.args
      callback({
        missionId: Number(a[0]),
        fragmentIndex: Number(a[1]),
        startIndex: Number(a[2]),
        length: Number(a[3]),
        contentHash: a[4],
        ipfsPointer: a[5],
      })
    })
  } catch {
    return () => {}
  }
}

/**
 * Listen for EvidenceCollected events for a specific mission.
 * Uses getLogs polling.
 */
export async function onEvidenceCollected(missionId, callback) {
  try {
    const contract = await getReadContract()
    if (!contract.filters?.EvidenceCollected) return () => {}
    const filter = contract.filters.EvidenceCollected(missionId)
    return pollEvents(contract, filter, (ev) => {
      const a = ev.args
      callback({
        missionId: Number(a[0]),
        evidenceCount: Number(a[1]),
        strength: Number(a[2]),
      })
    })
  } catch {
    return () => {}
  }
}

/**
 * Listen for WalletCaseBuilt events for a specific mission.
 * Uses getLogs polling.
 */
export async function onWalletCaseBuilt(missionId, callback) {
  const contract = await getReadContract()
  const filter = contract.filters.WalletCaseBuilt(missionId)
  return pollEvents(contract, filter, (ev) => {
    const a = ev.args
    callback({
      missionId: Number(a[0]),
      player: a[1],
      submittedWallet: a[2],
      valid: a[3],
    })
  })
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
 * Uses getLogs polling — no eth_newFilter needed.
 */
export async function onClueReceived(missionId, callback) {
  const contract = await getReadContract()
  const filter = contract.filters.ClueReceived(missionId)
  return pollEvents(contract, filter, (ev) => {
    const a = ev.args
    console.log('[onClueReceived] ipfsPointer type:', typeof a[3], 'length:', a[3]?.length)
    callback({
      missionId: Number(a[0]),
      clueType: Number(a[1]),
      contentHash: a[2],
      ipfsPointer: a[3],
      strength: Number(a[4] || 0),
    })
  })
}

/**
 * Listen for CarmenCaptured events for a specific mission.
 * Uses getLogs polling.
 */
export async function onCarmenCaptured(missionId, callback) {
  const contract = await getReadContract()
  const filter = contract.filters.CarmenCaptured(missionId)
  return pollEvents(contract, filter, (ev) => {
    const a = ev.args
    callback({
      missionId: Number(a[0]),
      player: a[1],
      blocksUsed: Number(a[2]),
      reward: Number(a[3]),
    })
  })
}

/**
 * Listen for MissionFailed events for a specific mission.
 * Uses getLogs polling.
 */
export async function onMissionFailed(missionId, callback) {
  const contract = await getReadContract()
  const filter = contract.filters.MissionFailed(missionId)
  return pollEvents(contract, filter, (ev) => {
    const a = ev.args
    callback({ missionId: Number(a[0]), player: a[1] })
  })
}

/**
 * Listen for CarmenMoved events for a specific mission.
 * Uses getLogs polling.
 */
export async function onCarmenMoved(missionId, callback) {
  const contract = await getReadContract()
  const filter = contract.filters.CarmenMoved(missionId)
  return pollEvents(contract, filter, (ev) => {
    const a = ev.args
    callback({ missionId: Number(a[0]), newTargetHash: a[1] })
  })
}

/**
 * Listen for PlayerRegistered events for a specific player address.
 * @param {string} playerAddress
 * @param {Function} callback - ({ player, publicKey }) => void
 * @returns {Function} unsubscribe function
 */
export async function onPlayerRegistered(playerAddress, callback) {
  try {
    const contract = await getReadContract()
    if (!contract.filters?.PlayerRegistered) return () => {}
    const filter = contract.filters.PlayerRegistered(playerAddress)
    return pollEvents(contract, filter, (ev) => {
      const decoded = contract.interface.parseLog(ev)
      if (decoded) callback({ player: decoded.args[0], publicKey: decoded.args[1] })
    })
  } catch {
    return () => {}
  }
}

/**
 * Listen for MissionStarted events for a specific mission.
 * Emitted after VRF callback assigns Carmen's starting location.
 * @param {number|bigint} missionId
 * @param {Function} callback - ({ missionId, player, startBlock }) => void
 * @returns {Function} unsubscribe function
 */
export async function onMissionStarted(missionId, callback) {
  try {
    const contract = await getReadContract()
    if (!contract.filters?.MissionStarted) return () => {}
    const filter = contract.filters.MissionStarted(missionId)
    return pollEvents(contract, filter, (ev) => {
      const decoded = contract.interface.parseLog(ev)
      if (decoded) callback({
        missionId: Number(decoded.args[0]),
        player: decoded.args[1],
        startBlock: Number(decoded.args[2]),
      })
    })
  } catch {
    return () => {}
  }
}

/**
 * Listen for CarmenLocationCommitted events for a specific mission.
 * Informational — commit hash of Carmen's location.
 * @param {number|bigint} missionId
 * @param {Function} callback - ({ missionId, targetHash }) => void
 * @returns {Function} unsubscribe function
 */
export async function onCarmenLocationCommitted(missionId, callback) {
  try {
    const contract = await getReadContract()
    if (!contract.filters?.CarmenLocationCommitted) return () => {}
    const filter = contract.filters.CarmenLocationCommitted(missionId)
    return pollEvents(contract, filter, (ev) => {
      const decoded = contract.interface.parseLog(ev)
      if (decoded) callback({
        missionId: Number(decoded.args[0]),
        targetHash: decoded.args[1],
      })
    })
  } catch {
    return () => {}
  }
}

/**
 * Listen for TokenURISet events for a specific mission.
 * Emitted when NFT metadata is ready after mission completion.
 * @param {number|bigint} missionId
 * @param {Function} callback - ({ missionId, tokenId }) => void
 * @returns {Function} unsubscribe function
 */
export async function onTokenURISet(missionId, callback) {
  try {
    const contract = await getReadContract()
    if (!contract.filters?.TokenURISet) return () => {}
    const filter = contract.filters.TokenURISet(missionId)
    return pollEvents(contract, filter, (ev) => {
      const decoded = contract.interface.parseLog(ev)
      if (decoded) callback({
        missionId: Number(decoded.args[0]),
        tokenId: Number(decoded.args[1]),
      })
    })
  } catch {
    return () => {}
  }
}

/**
 * Listen for ClueResolvedOnCity events.
 * Cross-chain feedback when a clue is resolved on a CityNode.
 * @param {Function} callback - ({ cityNode, requestId, clueType, clueDataHash }) => void
 * @returns {Function} unsubscribe function
 */
export async function onClueResolvedOnCity(callback) {
  try {
    const contract = await getReadContract()
    if (!contract.filters?.ClueResolvedOnCity) return () => {}
    const filter = contract.filters.ClueResolvedOnCity()
    return pollEvents(contract, filter, (ev) => {
      const decoded = contract.interface.parseLog(ev)
      if (decoded) callback({
        cityNode: decoded.args[0],
        requestId: Number(decoded.args[1]),
        clueType: Number(decoded.args[2]),
        clueDataHash: decoded.args[3],
      })
    })
  } catch {
    return () => {}
  }
}

/**
 * Listen for DossierResolvedOnCity events.
 * Cross-chain feedback when a dossier is resolved on a CityNode.
 * @param {Function} callback - ({ cityNode, requestId, dossierHash, confidence }) => void
 * @returns {Function} unsubscribe function
 */
export async function onDossierResolvedOnCity(callback) {
  try {
    const contract = await getReadContract()
    if (!contract.filters?.DossierResolvedOnCity) return () => {}
    const filter = contract.filters.DossierResolvedOnCity()
    return pollEvents(contract, filter, (ev) => {
      const decoded = contract.interface.parseLog(ev)
      if (decoded) callback({
        cityNode: decoded.args[0],
        requestId: Number(decoded.args[1]),
        dossierHash: decoded.args[2],
        confidence: Number(decoded.args[3]),
      })
    })
  } catch {
    return () => {}
  }
}

/**
 * Listen for CaptureResolvedOnCity events.
 * Cross-chain feedback when a capture attempt is resolved on a CityNode.
 * @param {Function} callback - ({ cityNode, requestId, success, reasonCode }) => void
 * @returns {Function} unsubscribe function
 */
export async function onCaptureResolvedOnCity(callback) {
  try {
    const contract = await getReadContract()
    if (!contract.filters?.CaptureResolvedOnCity) return () => {}
    const filter = contract.filters.CaptureResolvedOnCity()
    return pollEvents(contract, filter, (ev) => {
      const decoded = contract.interface.parseLog(ev)
      if (decoded) callback({
        cityNode: decoded.args[0],
        requestId: Number(decoded.args[1]),
        success: decoded.args[2],
        reasonCode: Number(decoded.args[3]),
      })
    })
  } catch {
    return () => {}
  }
}

/**
 * Listen for MissionNFTSet events.
 * Emitted when the GameMaster's MissionNFT contract address is updated.
 * @param {Function} callback - ({ missionNFT }) => void
 * @returns {Function} unsubscribe function
 */
export async function onMissionNFTSet(callback) {
  try {
    const contract = await getReadContract()
    if (!contract.filters?.MissionNFTSet) return () => {}
    const filter = contract.filters.MissionNFTSet()
    return pollEvents(contract, filter, (ev) => {
      const decoded = contract.interface.parseLog(ev)
      if (decoded) callback({
        missionNFT: decoded.args[0],
      })
    })
  } catch {
    return () => {}
  }
}

/**
 * Listen for TxFlagged events on a CityNode.
 * Emitted when a player flags a suspicious transaction reference.
 * @param {number} chainId - The city's chain ID
 * @param {string} playerAddress - Filter by player address
 * @param {Function} callback - ({ player, refId }) => void
 * @returns {Function} unsubscribe function
 */
export async function onTxFlagged(chainId, playerAddress, callback) {
  try {
    const contract = getCityNodeGameplayContract(chainId)
    if (!contract || !contract.filters?.TxFlagged) return () => {}
    const filter = contract.filters.TxFlagged(playerAddress)
    return pollEvents(contract, filter, (ev) => {
      const decoded = contract.interface.parseLog(ev)
      if (decoded) callback({
        player: decoded.args[0],
        refId: decoded.args[1],
      })
    })
  } catch {
    return () => {}
  }
}

/**
 * Fetch historical events for a mission from the GameMaster contract.
 * Returns all events in chronological order.
 * @param {number|bigint} missionId
 * @returns {Array<{ name, block, data, color }>}
 */
export async function getMissionEvents(missionId) {
  const contract = await getReadContract()
  const provider = await getReadProvider()
  const currentBlock = await provider.getBlockNumber()
  // Look back up to 5000 blocks (~17h on Sepolia). Ankr RPC has no strict block range limit.
  // safeQuery() handles errors gracefully if the provider imposes limits.
  const fromBlock = Math.max(0, currentBlock - 5000)

  // Helper: safe queryFilter that returns [] on RPC limits
  async function safeQuery(filter) {
    try {
      return await contract.queryFilter(filter, fromBlock)
    } catch {
      // Alchemy free tier or other provider limit — skip silently
      return []
    }
  }

  const events = []

  try {
    // Fetch InvestigationSubmitted events
    const investFilter = contract.filters.InvestigationSubmitted(missionId)
    const investLogs = await safeQuery(investFilter)
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
    const clueLogs = await safeQuery(clueFilter)
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
    const movedLogs = await safeQuery(movedFilter)
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
    const capturedLogs = await safeQuery(capturedFilter)
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
    const failedLogs = await safeQuery(failedFilter)
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
  const eip1193 = _externalEip1193 || window.ethereum
  if (!eip1193) throw new Error("No wallet detected")
  const chainId = await eip1193.request({ method: "eth_chainId" })
  const currentChainId = parseInt(chainId, 16)
  if (currentChainId === SEPOLIA_CHAIN_ID || currentChainId === HARDHAT_CHAIN_ID) {
    return
  }
  await eip1193.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: "0x" + SEPOLIA_CHAIN_ID.toString(16) }],
  })
  resetConnection()
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
 * Returns null if address or rpc not configured, or if MOCK_MODE is enabled.
 */
function getCityNodeGameplayContract(chainId) {
  if (MOCK_MODE) return null
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
  const eip1193 = _externalEip1193 || window.ethereum
  if (!eip1193) throw new Error("No wallet detected")
  const current = parseInt(await eip1193.request({ method: "eth_chainId" }), 16)
  if (current === chainId) return

  const params = CHAIN_PARAMS[chainId]
  if (!params) throw new Error(`Unknown chain ${chainId} — cannot switch wallet`)

  try {
    await eip1193.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: params.chainId }],
    })
  } catch (err) {
    if (err.code === 4902) {
      await eip1193.request({
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
async function getCityNodeWriteContract(chainId, cityId) {
  const address = chainId === 31337
    ? (cityId ? HARDHAT_CITYNODE_ADDRESSES[cityId] : null)
    : CITY_NODE_ADDRESSES[chainId]
  if (!address) throw new Error(`CityNode address not configured for chain ${chainId}`)
  await ensureCityNodeNetwork(chainId)
  const eip1193 = _externalEip1193 || window.ethereum
  const provider = new ethers.BrowserProvider(eip1193)
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
 * Returns false when MOCK_MODE is enabled, forcing all functions to use mock data.
 */
function isCityNodeConfigured(chainId, cityId) {
  if (MOCK_MODE) return false
  // Hardhat local: look up by cityId
  if (chainId === 31337) {
    return Boolean(cityId && HARDHAT_CITYNODE_ADDRESSES[cityId])
  }
  return Boolean(CITY_NODE_ADDRESSES[chainId] && CITY_NODE_RPC_URLS[chainId])
}

// ── Mock data generators (used when contracts are not deployed) ──

const MOCK_CLUE_DATA = Object.fromEntries(
  Object.keys(CITY_POOL_MAP).map((id) => [Number(id), getMockClueData(Number(id))])
)

/**
 * Pick a city on a DIFFERENT chain to serve as the [NEXT LEAD] destination.
 * Deterministic based on seed so the same clue always points to the same city.
 */
function _pickNextLeadCity(currentChainId, seed) {
  const candidates = CITY_POOL.filter((c) => c.chainId !== currentChainId)
  if (candidates.length === 0) return CITY_POOL[0]
  const idx = Math.abs(seed) % candidates.length
  return candidates[idx]
}

function _mockClueResult(cityId, locationIdx, clueIndex, txHash, blockNumber, isStartingClue = false, nodeStats = {}) {
  const clueTypes = ["BEHAVIOR_FINGERPRINT", "RELATIONSHIP", "IDENTITY_COMMIT", "FUNDING_TRAIL", "TECHNICAL_SIGNATURE", "DEAD_END"]
  const locationData = MOCK_CLUE_DATA[cityId]?.[locationIdx]
  const cityName = CITY_NODE_META[cityId]?.name || "unknown"

  const { totalCluesInCity = 0, hasStrongClue = false } = nodeStats

  // ── scripted route override ──
  const route = getActiveRoute()
  if (route) {
    const role = getCityRole(route, cityId)
    let strength, tier, clueData

    if (role === 'on_path') {
      // city on the scripted path: always strong
      strength = 75 + Math.floor(Math.random() * 16) // 75-90
      tier = 'strong'
      const nextCityId = getNextCity(route, cityId)
      if (locationData && locationData.strong) {
        clueData = locationData.strong[clueIndex % locationData.strong.length]
      } else {
        clueData = `Full analysis of ${cityName} confirms Carmen's network is active here. Transaction pattern decoded — extraction route mapped. [WALLET INTEL: suspect wallet interacted with contracts on this chain in the last 24 hours]`
      }
      if (nextCityId) {
        const nextCity = CITY_POOL_MAP[nextCityId]
        if (nextCity) {
          clueData += ` [NEXT LEAD: Cross-chain signals trace to ${nextCity.name} (${nextCity.chain}) — investigate that network next.]`
        }
      } else {
        clueData += ` [NEXT LEAD: All signals converge HERE. Carmen is in ${cityName}. Prepare for capture.]`
      }
    } else if (role === 'near_path') {
      // city shares chain with a path city: medium redirect
      strength = 45 + Math.floor(Math.random() * 16) // 45-60
      tier = 'medium'
      const correctCityId = getNearestPathCity(route, cityId)
      const correctCity = CITY_POOL_MAP[correctCityId]
      if (locationData && locationData.medium) {
        clueData = locationData.medium[clueIndex % locationData.medium.length]
      } else {
        clueData = `Cross-chain traffic at ${cityName} shows anomalous routing. Someone is moving assets through this node — the gas pattern is consistent with Carmen's operational style.`
      }
      if (correctCity) {
        clueData += ` Signals suggest activity closer to ${correctCity.name} (${correctCity.chain}).`
      }
    } else {
      // city completely off path: weak/dead-end
      strength = 10 + Math.floor(Math.random() * 11) // 10-20
      tier = 'weak'
      if (locationData && locationData.weak) {
        clueData = locationData.weak[clueIndex % locationData.weak.length]
      } else {
        clueData = `Faint residual signals at ${cityName} — trace too degraded to analyze. Could be anyone.`
      }
    }

    return {
      hash: txHash || `0x${Math.random().toString(16).slice(2, 14)}...mock`,
      blockNumber: blockNumber || 52884300 + Math.floor(Math.random() * 100),
      requestId: Date.now(),
      resolved: true,
      clueType: tier === 'weak' ? 'DEAD_END' : clueTypes[Math.floor(Math.random() * 5)],
      clueData,
      anomalyRefId: `0x${Math.random().toString(16).slice(2, 14)}`,
      strength,
    }
  }

  // ── default random behavior (no scripted route) ──

  // rules:
  // 1. first clue in the city node is never a dead end (player needs at least one useful lead)
  // 2. dead ends only appear from the second clue onwards (~15% chance)
  // 3. max one clue with strength > 70 per city node (prevents multiple strong leads from same node)
  const isFirstClueInCity = totalCluesInCity === 0
  const isDeadEnd = isStartingClue || isFirstClueInCity ? false : Math.random() < 0.15

  let strength
  if (isStartingClue) {
    strength = 70 + Math.floor(Math.random() * 26)  // 70-95
  } else if (isDeadEnd) {
    strength = 5 + Math.floor(Math.random() * 16)   // 5-20
  } else if (hasStrongClue) {
    // already has a strong clue in this node — cap at 65 to avoid multiple strong leads
    strength = 20 + Math.floor(Math.random() * 46)  // 20-65
  } else {
    strength = 20 + Math.floor(Math.random() * 76)  // 20-95
  }

  // determine tier from strength
  let tier
  if (strength <= 40) tier = "weak"
  else if (strength <= 65) tier = "medium"
  else tier = "strong"

  // pick clue text from the matching tier
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

  // Strong clues ALWAYS include a [NEXT LEAD] pointing to a city on a different chain
  if (tier === "strong") {
    const leadSeed = (cityId * 31 + locationIdx * 7 + clueIndex * 3) | 0
    const nextCity = _pickNextLeadCity(resolveChainId(cityId), leadSeed)
    const chainDef = nextCity.chain || 'unknown chain'
    clueData += ` [NEXT LEAD: Cross-chain signals trace to ${nextCity.name} (${chainDef}) — investigate that network next.]`
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

function _mockCityInfo(cityId) {
  const meta = CITY_NODE_META[cityId]
  return {
    city: meta?.name || `City ${cityId}`,
    countryCode: getCountryCode(cityId),
    chainId: resolveChainId(cityId),
    cityId,
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
  bcCity(`CityNode[${chainId}].cityInfo() + getSuspicionIndex()`)
  const contract = getCityNodeGameplayContract(chainId)
  if (!contract) { bcWarn(`CityNode[${chainId}] not configured — using mock`); return _mockCityInfo(chainId) }

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
    if (!MOCK_MODE) bcWarn(`CityNode[${chainId}] cityInfo failed: ${err.message} — using mock`)
    return _mockCityInfo(chainId)
  }
}

/**
 * Get locations for a CityNode (3 per city).
 * Calls getLocations(); enriches with display fields. Falls back to mock.
 */
export async function getCityNodeLocations(cityId) {
  const chainId = resolveChainId(cityId)
  const contract = getCityNodeGameplayContract(chainId)
  if (!contract) {
    return (MOCK_LOCATIONS[cityId] || []).map((loc, i) => ({
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
    if (!MOCK_MODE) console.warn(`[cityNode] getLocations real call failed for chain ${chainId}, using mock:`, err.message)
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
export async function getCityNodeAnomalyTxRefs(cityId) {
  const chainId = resolveChainId(cityId)
  const contract = getCityNodeGameplayContract(chainId)
  if (!contract) return _mockAnomalyTxRefs(cityId)

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
    if (!MOCK_MODE) console.warn(`[cityNode] getAnomalyTxRefs real call failed for chain ${chainId}, using mock:`, err.message)
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

function _seedFromParams(cityId, locationIdx) {
  let h = 5381
  const s = `${cityId}-${locationIdx}-txgen`
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

function _generateLocationTxs(cityId, locationIdx, carmenWallet, carmenLocationIdx) {
  const seed = _seedFromParams(cityId, locationIdx)
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

  // suspect wallet indices that appear in _mockSuspectWallets — spread across locations
  const SUSPECT_INDICES = [2, 7, 15]

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

  // inject 1 suspect wallet tx per location so suspects appear in the explorer
  const suspectIdx = SUSPECT_INDICES[locationIdx % SUSPECT_INDICES.length]
  const suspectWallet = WALLET_POOL[suspectIdx]
  const [counterparty] = pickTxWallets(seed * 71 + locationIdx * 53, carmenIdx)
  const sMIdx = Math.floor(rng() * normalMethods.length)
  const sVal = rng() * 4
  txs.push({
    txHashLike: `0x${_hexFromSeed(seed * 71 + locationIdx * 53, 64)}`,
    from: suspectWallet.address,
    to: counterparty.address,
    methodSigLike: normalMethods[sMIdx].sig,
    methodLabel: normalMethods[sMIdx].label,
    blockLike: 52884200 + Math.floor(rng() * 200),
    valueLike: BigInt(Math.floor(sVal * 1e18)),
    valueDisplay: sVal.toFixed(4),
    anomalyType: null,
    anomalyLabel: null,
    isAnomaly: false,
  })

  // in capture city of scripted route: inject Carmen's route wallet in additional locations
  // (carmenLocationIdx gets the main Carmen tx below, other locations get a secondary appearance)
  const route = getActiveRoute()
  if (route && carmenWallet && locationIdx !== carmenLocationIdx) {
    // Carmen also appears as TO in a tx at non-Carmen locations in the capture city
    const cityId_ = cityId
    const isCaptureCity = cityId_ === route.captureCity
    if (isCaptureCity) {
      const [normalFrom] = pickTxWallets(seed * 83 + locationIdx * 37, carmenIdx)
      const cMIdx2 = Math.floor(rng() * normalMethods.length)
      const cVal2 = rng() * 2
      txs.push({
        txHashLike: `0x${_hexFromSeed(seed * 83 + locationIdx * 37, 64)}`,
        from: normalFrom.address,
        to: carmenWallet.address,
        methodSigLike: normalMethods[cMIdx2].sig,
        methodLabel: normalMethods[cMIdx2].label,
        blockLike: 52884200 + Math.floor(rng() * 200),
        valueLike: BigInt(Math.floor(cVal2 * 1e18)),
        valueDisplay: cVal2.toFixed(4),
        anomalyType: null,
        anomalyLabel: null,
        isAnomaly: false,
      })
    }
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
export function buildLocationTransactions(cityId, locationIdx, anomalyTxRefs, numLocations = 3, carmenWallet = null, carmenLocationIdx = null) {
  const txs = _generateLocationTxs(cityId, locationIdx, carmenWallet, carmenLocationIdx)

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

function _mockAnomalyTxRefs(cityId) {
  const sigs = ["0xa9059cbb", "0x095ea7b3", "0x38ed1739", "0x3ce33bff", "0xd0e30db0"]
  const labels = ["transfer", "approve", "swap", "bridge", "deposit"]

  return Array.from({ length: 5 }, (_, i) => ({
    refId: i + 1,
    txHashLike: ethers.id(`mock-tx-${cityId}-${i}`),
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
export async function getCityNodeSuspectWallets(cityId) {
  const chainId = resolveChainId(cityId)
  const contract = getCityNodeGameplayContract(chainId)
  if (!contract) return _mockSuspectWallets(cityId)

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
    if (!MOCK_MODE) console.warn(`[cityNode] getSuspectWallets real call failed for chain ${chainId}, using mock:`, err.message)
    return _mockSuspectWallets()
  }
}

function _mockSuspectWallets(cityId) {
  const route = getActiveRoute()

  // scripted route: capture city gets Carmen's wallet as extremely suspicious + 3 suspicious decoys
  if (route && cityId === route.captureCity) {
    const decoyIndices = [2, 7, 15]
    const suspects = [
      {
        wallet: route.carmenWallet,
        suspicionLevel: 97,
        txRefIds: [1n, 2n, 3n, 4n, 5n, 6n],
        tagsBitmap: 19n, // high-freq + cross-chain + mixer
        tags: decodeTags(19n),
        _isCarmen: true,
      },
      ...decoyIndices.map((idx, i) => ({
        wallet: WALLET_POOL[idx].address,
        suspicionLevel: [68, 59, 52][i],
        txRefIds: [[2n, 5n], [3n, 4n], [1n]][i],
        tagsBitmap: [12n, 16n, 4n][i],
        tags: decodeTags([12n, 16n, 4n][i]),
      })),
    ]
    // shuffle so Carmen isn't always first
    for (let i = suspects.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [suspects[i], suspects[j]] = [suspects[j], suspects[i]]
    }
    return suspects
  }

  // default: 3 wallets from pool — moderate suspicion, none extreme
  const picks = [2, 7, 15]
  const levels = [62, 48, 35]
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
export async function getCityNodeEnergy(cityId, player) {
  const chainId = resolveChainId(cityId)
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
export async function getCityNodePlayerProgress(cityId, player) {
  const chainId = resolveChainId(cityId)
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
export async function getCityNodeEvidenceSummary(cityId, player) {
  const chainId = resolveChainId(cityId)
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
  bcCity(`CityNode[${chainId}].inspectLocation(idx=${locationIdx})`)
  if (!isCityNodeConfigured(chainId)) {
    if (MOCK_MODE) bcWarn(`CityNode[${chainId}] not configured — MOCK inspectLocation`)
    await new Promise((r) => setTimeout(r, 1500))
    return {
      hash: `0x${Math.random().toString(16).slice(2, 14)}...mock`,
      blockNumber: 52884300 + Math.floor(Math.random() * 100),
      noteHash: ethers.ZeroHash,
    }
  }

  // Try relay (gasless)
  const relayed = await relayInspectService(chainId, locationIdx)
  if (relayed) return { hash: relayed.txHash, blockNumber: relayed.blockNumber, noteHash: ethers.ZeroHash }

  // Fallback: direct contract call
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
    } catch { /* skip unparseable logs */ }
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
  bcCity(`CityNode[${chainId}].scanAnomalies(idx=${locationIdx})`)
  if (!isCityNodeConfigured(chainId)) {
    if (MOCK_MODE) bcWarn(`CityNode[${chainId}] not configured — MOCK scanAnomalies`)
    await new Promise((r) => setTimeout(r, 2000))
    return {
      hash: `0x${Math.random().toString(16).slice(2, 14)}...mock`,
      blockNumber: 52884300 + Math.floor(Math.random() * 100),
      anomaliesFound: 2 + Math.floor(Math.random() * 3),
      suspectsFound: 1 + Math.floor(Math.random() * 2),
    }
  }

  // Try relay (gasless)
  const relayed = await relayScanService(chainId, locationIdx)
  if (relayed) return { hash: relayed.txHash, blockNumber: relayed.blockNumber, anomaliesFound: 0, suspectsFound: 0 }

  // Fallback: direct contract call
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
    } catch { /* skip */ }
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
  bcCity(`CityNode[${chainId}].requestClue(loc=${locationIdx}, clue=${clueIndex})${isStartingClue ? " [STARTING CLUE]" : ""}`)
  bcCRE("CRE WASM workflow will process: clue request → analyze → resolve clue on-chain")
  if (!isCityNodeConfigured(chainId)) {
    if (MOCK_MODE) bcWarn(`CityNode[${chainId}] not configured — MOCK requestClue`)
    await new Promise((r) => setTimeout(r, 2500))
    return _mockClueResult(chainId, locationIdx, clueIndex, null, null, isStartingClue)
  }

  // Try relay (gasless) — returns basic result without event polling
  const relayed = await relayRequestClueService(chainId, locationIdx, clueIndex)
  if (relayed) {
    return _mockClueResult(chainId, locationIdx, clueIndex, relayed.txHash, relayed.blockNumber, isStartingClue)
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
      } catch { /* skip */ }
    }

    // Wait for ClueUnlocked or DeadEnd event from GM resolve (timeout 15s, then fallback)
    const readContract = getCityNodeGameplayContract(chainId)
    const CLUE_TYPE_NAMES = ["BEHAVIOR_FINGERPRINT", "RELATIONSHIP", "IDENTITY_COMMIT", "FUNDING_TRAIL", "TECHNICAL_SIGNATURE", "DEAD_END"]

    // Poll for both ClueUnlocked and DeadEnd events
    const clueFilter = readContract.filters.ClueUnlocked?.() || readContract.filters["ClueUnlocked"]?.()
    const deadEndFilter = readContract.filters.DeadEnd?.() || readContract.filters["DeadEnd"]?.()

    try {
      const result = await Promise.race([
        // Poll for ClueUnlocked
        ...(clueFilter ? [pollOnce(readContract, clueFilter, (parsed) => {
          if (parsed.name !== "ClueUnlocked") return null
          if (Number(parsed.args[1]) !== locationIdx || Number(parsed.args[2]) !== clueIndex) return null
          return {
            hash: receipt.hash,
            blockNumber: receipt.blockNumber,
            requestId,
            resolved: true,
            clueType: CLUE_TYPE_NAMES[Number(parsed.args[3])] || `Type ${parsed.args[3]}`,
            clueData: `Clue resolved: ${parsed.args[4].slice(0, 14)}...`,
            anomalyRefId: parsed.args[5],
            strength: 50 + Math.floor(Math.random() * 40),
          }
        }, 15000, 3000)] : []),
        // Poll for DeadEnd
        ...(deadEndFilter ? [pollOnce(readContract, deadEndFilter, (parsed) => {
          if (parsed.name !== "DeadEnd") return null
          if (Number(parsed.args[1]) !== locationIdx) return null
          return {
            hash: receipt.hash,
            blockNumber: receipt.blockNumber,
            requestId,
            resolved: true,
            clueType: "DEAD_END",
            clueData: "Dead end — no actionable intel at this position.",
            anomalyRefId: parsed.args[2],
            strength: 10,
          }
        }, 15000, 3000)] : []),
        // Timeout fallback
        new Promise((resolve) => setTimeout(() => {
          if (!MOCK_MODE) console.warn(`[cityNode] GM resolve timeout — using mock clue for location ${locationIdx}, clue ${clueIndex}`)
          resolve(_mockClueResult(chainId, locationIdx, clueIndex, receipt.hash, receipt.blockNumber))
        }, 16000)),
      ])
      return result
    } catch {
      if (!MOCK_MODE) console.warn(`[cityNode] pollOnce failed — using mock clue`)
      return _mockClueResult(chainId, locationIdx, clueIndex, receipt.hash, receipt.blockNumber)
    }
  } catch (err) {
    if (!MOCK_MODE) console.warn(`[cityNode] requestClue real call failed for chain ${chainId}, using mock:`, err.message)
    await new Promise((r) => setTimeout(r, 2000))
    return _mockClueResult(chainId, locationIdx, clueIndex, null, null, false)
  }
}

/**
 * Flag a transaction reference.
 * Direct tx. Contract takes bytes32 refId.
 */
export async function cityNodeFlagTx(cityId, refId) {
  const chainId = resolveChainId(cityId)
  if (!isCityNodeConfigured(chainId)) {
    if (MOCK_MODE) console.debug(`[cityNode] flagTx(${refId}) on chain ${chainId} — MOCK`)
    await new Promise((r) => setTimeout(r, 1000))
    return { hash: `0x${Math.random().toString(16).slice(2, 14)}...mock` }
  }

  // Contract expects bytes32; convert if needed
  let bytes32RefId = refId
  if (typeof refId === "number" || typeof refId === "bigint") {
    bytes32RefId = ethers.zeroPadValue(ethers.toBeHex(BigInt(refId)), 32)
  }

  // Try relay (gasless)
  const relayed = await relayFlagTxService(chainId, bytes32RefId)
  if (relayed) return { hash: relayed.txHash }

  // Fallback: direct contract call
  const contract = await getCityNodeWriteContract(chainId)
  const tx = await contract.flagTx(bytes32RefId)
  const receipt = await tx.wait()
  return { hash: receipt.hash }
}

/**
 * Request a dossier (evidence summary analysis).
 * Async tx — sends request, then waits for DossierResolved event.
 */
export async function cityNodeRequestDossier(cityId) {
  const chainId = resolveChainId(cityId)
  if (!isCityNodeConfigured(chainId)) {
    if (MOCK_MODE) console.debug(`[cityNode] requestDossier() on chain ${chainId} — MOCK`)
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

  // Try relay (gasless)
  const relayed = await relayRequestDossierService(chainId)
  if (relayed) {
    return {
      hash: relayed.txHash,
      requestId: 0,
      resolved: true,
      summary: "Dossier request relayed (gasless). Awaiting CRE resolution.",
      hypotheses: [],
      gaps: [],
      nextObjective: "Wait for cross-chain resolve.",
      confidence: 0,
    }
  }

  // Fallback: direct contract call
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
    } catch { /* skip */ }
  }

  // Wait for DossierResolved (timeout 60s) via polling
  const readContract = getCityNodeGameplayContract(chainId)
  const dossierFilter = readContract.filters.DossierResolved?.() || readContract.filters["DossierResolved"]?.()

  if (!dossierFilter) throw new Error("DossierResolved filter not available")

  return pollOnce(readContract, dossierFilter, (parsed) => {
    if (parsed.name !== "DossierResolved") return null
    if (Number(parsed.args[0]) !== requestId) return null
    return {
      hash: receipt.hash,
      requestId,
      resolved: true,
      summary: `Dossier compiled: ${parsed.args[2].slice(0, 14)}...`,
      hypotheses: ["Evidence pattern analysis complete."],
      gaps: [],
      nextObjective: `Next objective hint: ${parsed.args[4].slice(0, 14)}...`,
      confidence: Number(parsed.args[3]),
    }
  }, 60000, 3000)
}

/**
 * Request capture of a suspect wallet.
 * Async tx — sends request, then waits for CaptureResolved event.
 */
export async function cityNodeRequestCapture(cityId, suspectWallet, evidenceBundleHash) {
  const chainId = resolveChainId(cityId)
  if (!isCityNodeConfigured(chainId)) {
    if (MOCK_MODE) console.debug(`[cityNode] requestCapture(${suspectWallet}) on chain ${chainId} — MOCK`)
    await new Promise((r) => setTimeout(r, 3500))

    // scripted route override: deterministic capture result
    const route = getActiveRoute()
    if (route) {
      const isCaptureCityCorrect = cityId === route.captureCity
      const isWalletCorrect = suspectWallet?.toLowerCase() === route.carmenWallet?.toLowerCase()

      if (isCaptureCityCorrect && isWalletCorrect) {
        return {
          hash: `0x${Math.random().toString(16).slice(2, 14)}...mock`,
          requestId: Date.now(),
          resolved: true,
          success: true,
          reasonCode: "OK",
          gmNote: "Target confirmed! Carmen Sandiego apprehended.",
        }
      }
      // generate contextual failure message based on the suspect wallet
      let gmNote
      if (!isCaptureCityCorrect) {
        gmNote = `Capture failed. Carmen is not in ${CITY_NODE_META[cityId]?.name || 'this city'}. Follow the clues to her real location.`
      } else {
        // right city, wrong wallet — give a helpful dismissal
        const dismissals = [
          "Investigation complete. This wallet's transaction history is clean — no connection to Carmen's operations.",
          "Analysis shows this wallet is suspicious but linked to unrelated DeFi arbitrage activity, not Carmen.",
          "Despite high transaction volume, this wallet belongs to a known yield farming bot. Not our target.",
          "Cross-chain audit complete. This address shows mixer usage for privacy, but no match with Carmen's operational pattern.",
        ]
        gmNote = dismissals[Math.floor(Math.random() * dismissals.length)]
      }
      return {
        hash: `0x${Math.random().toString(16).slice(2, 14)}...mock`,
        requestId: Date.now(),
        resolved: true,
        success: false,
        reasonCode: isCaptureCityCorrect ? "WALLET_CLEARED" : "WRONG_CITY",
        gmNote,
      }
    }

    // default random behavior
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

  // Try relay (gasless)
  const relayed = await relayCaptureService(chainId, suspectWallet, bundleHash)
  if (relayed) {
    return {
      hash: relayed.txHash,
      requestId: 0,
      resolved: false,
      success: false,
      reasonCode: "PENDING",
      gmNote: "Capture request relayed (gasless). Awaiting CRE resolution.",
    }
  }

  // Fallback: direct contract call
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
    } catch { /* skip */ }
  }

  // Wait for CaptureResolved (timeout 60s) via polling
  const REASON_CODE_NAMES = ["OK", "INSUFFICIENT_EVIDENCE", "WALLET_MISMATCH", "WRONG_CITY", "EXPIRED_REQUEST", "INVALID_BUNDLE"]
  const readContract = getCityNodeGameplayContract(chainId)
  const captureFilter = readContract.filters.CaptureResolved?.() || readContract.filters["CaptureResolved"]?.()

  if (!captureFilter) throw new Error("CaptureResolved filter not available")

  return pollOnce(readContract, captureFilter, (parsed) => {
    if (parsed.name !== "CaptureResolved") return null
    if (Number(parsed.args[0]) !== requestId) return null
    const success = Boolean(parsed.args[3])
    return {
      hash: receipt.hash,
      requestId,
      resolved: true,
      success,
      reasonCode: REASON_CODE_NAMES[Number(parsed.args[4])] || `Code ${parsed.args[4]}`,
      gmNote: success
        ? "Target confirmed! Carmen Sandiego apprehended."
        : `Capture failed: ${parsed.args[5].slice(0, 14)}...`,
    }
  }, 60000, 3000)
}

// ── CityNode Event Listeners ──

/**
 * Listen for CityNode gameplay events for a specific player.
 * Returns an unsubscribe function.
 */
export async function onCityNodeEvents(cityId, playerAddress, callbacks) {
  const chainId = resolveChainId(cityId)
  const contract = getCityNodeGameplayContract(chainId)
  if (!contract) return () => {}

  const unsubs = []
  const addr = playerAddress.toLowerCase()

  if (callbacks.onLocationInspected) {
    const filter = contract.filters.LocationInspected(playerAddress)
    unsubs.push(pollEvents(contract, filter, (ev) => {
      const a = ev.args
      callbacks.onLocationInspected({ player: a[0], idx: Number(a[1]), noteHash: a[2] })
    }))
  }

  if (callbacks.onClueUnlocked) {
    const filter = contract.filters.ClueUnlocked(playerAddress)
    unsubs.push(pollEvents(contract, filter, (ev) => {
      const a = ev.args
      callbacks.onClueUnlocked({
        player: a[0],
        idx: Number(a[1]),
        clueIndex: Number(a[2]),
        clueType: Number(a[3]),
        clueDataHash: a[4],
        anomalyRefId: a[5],
      })
    }))
  }

  if (callbacks.onEnergySpent) {
    const filter = contract.filters.EnergySpent(playerAddress)
    unsubs.push(pollEvents(contract, filter, (ev) => {
      const a = ev.args
      callbacks.onEnergySpent({
        player: a[0],
        amount: Number(a[1]),
        remaining: Number(a[2]),
        actionType: Number(a[3]),
      })
    }))
  }

  if (callbacks.onCaptureResolved) {
    // CaptureResolved may not have player as first indexed param — use unfiltered + manual check
    const filter = contract.filters.CaptureResolved()
    unsubs.push(pollEvents(contract, filter, (ev) => {
      const a = ev.args
      if (a[1]?.toLowerCase() !== addr) return
      callbacks.onCaptureResolved({
        requestId: Number(a[0]),
        player: a[1],
        wallet: a[2],
        success: Boolean(a[3]),
        reasonCode: Number(a[4]),
        gmNoteHash: a[5],
      })
    }))
  }

  return () => unsubs.forEach((fn) => fn())
}

// ============================================================
//  Player Profile / MissionNFT
// ============================================================

export const MISSION_NFT_ADDRESS = import.meta.env.VITE_MISSION_NFT_ADDRESS || null

async function getMissionNFTContract() {
  if (!MISSION_NFT_ADDRESS) return null
  const provider = await getReadProvider()
  return new ethers.Contract(MISSION_NFT_ADDRESS, MissionNFTArtifact.abi, provider)
}

/** Get player global progress from GameMaster. */
export async function getPlayerGlobalProgress(playerAddress) {
  const contract = await getReadContract()
  const [citiesVisited, totalClues, identityCommitsCount] =
    await contract.getPlayerGlobalProgress(playerAddress)
  return {
    citiesVisited: Number(citiesVisited),
    totalClues: Number(totalClues),
    identityCommitsCount: Number(identityCommitsCount),
  }
}

/** Get player identity commit hashes from GameMaster. */
export async function getPlayerIdentityCommits(playerAddress) {
  const contract = await getReadContract()
  const commits = await contract.getPlayerIdentityCommits(playerAddress)
  return commits.map((c) => c)
}

/**
 * Get the number of clues a player has collected on a specific city.
 * @param {string} playerAddress
 * @param {string} cityNodeId - bytes32 city node identifier
 * @returns {number}
 */
export async function getPlayerCityClueCount(playerAddress, cityNodeId) {
  const contract = await getReadContract()
  return Number(await contract.getPlayerCityClueCount(playerAddress, cityNodeId))
}

/** Get the number of MissionNFT trophies owned by a player. */
export async function getMissionNFTBalance(playerAddress) {
  const nft = await getMissionNFTContract()
  if (!nft) return 0
  return Number(await nft.balanceOf(playerAddress))
}

/** Get the MissionRecord for a given tokenId. */
export async function getMissionRecord(tokenId) {
  const nft = await getMissionNFTContract()
  if (!nft) return null
  const r = await nft.getMissionRecord(tokenId)
  return {
    missionId: Number(r.missionId),
    player: r.player,
    capturedChainId: Number(r.capturedChainId),
    cluesCollected: Number(r.cluesCollected),
    investigationsUsed: Number(r.investigationsUsed),
    blocksUsed: Number(r.blocksUsed),
    reward: Number(r.reward),
    timestamp: Number(r.timestamp),
  }
}

/** Get tokenURI for a given tokenId. */
export async function getMissionNFTTokenURI(tokenId) {
  const nft = await getMissionNFTContract()
  if (!nft) return null
  try {
    return await nft.tokenURI(tokenId)
  } catch {
    return null
  }
}

/** Get the tokenId for a given missionId. */
export async function getMissionToTokenId(missionId) {
  const nft = await getMissionNFTContract()
  if (!nft) return null
  try {
    return Number(await nft.missionToTokenId(missionId))
  } catch {
    return null
  }
}

/**
 * Fetch all mission trophies for a player by scanning Transfer events.
 * Returns array of { tokenId, record, tokenURI }.
 */
export async function getPlayerMissionTrophies(playerAddress) {
  const nft = await getMissionNFTContract()
  if (!nft) return []

  const balance = Number(await nft.balanceOf(playerAddress))
  if (balance === 0) return []

  // Scan Transfer events to this player to discover their tokenIds
  const filter = nft.filters.Transfer(null, playerAddress)
  const events = await nft.queryFilter(filter, 0, 'latest')

  const trophies = []
  const seen = new Set()

  for (const event of events) {
    const tokenId = Number(event.args.tokenId)
    if (seen.has(tokenId)) continue
    seen.add(tokenId)

    // Verify current ownership (could have been transferred away)
    try {
      const owner = await nft.ownerOf(tokenId)
      if (owner.toLowerCase() !== playerAddress.toLowerCase()) continue
    } catch {
      continue
    }

    const record = await getMissionRecord(tokenId)
    const uri = await getMissionNFTTokenURI(tokenId)
    trophies.push({ tokenId, record, tokenURI: uri })
  }

  return trophies
}

// ============================================================
//  Chainlink CCIP — Cross-Chain Messaging Status
// ============================================================

/**
 * Get the CCIP cross-chain messaging status from GameMaster.
 * Returns whether CCIP is configured, how many destination chains are registered,
 * and the total number of cross-chain messages sent.
 *
 * CCIP Flow:
 * - GameMaster (Sepolia) broadcasts Carmen's location via CCIP Router
 * - Messages travel cross-chain through the Chainlink CCIP DON
 * - CityNodes (Arbitrum Sepolia, Base Sepolia) receive and update state
 *
 * @returns {{ configured: boolean, destinationCount: number, totalMessages: number }}
 */
export async function getCCIPStatus() {
  try {
    bcCCIP("GameMaster.getCCIPStatus() — cross-chain messaging status")
    const contract = await getReadContract()
    const [configured, destinationCount, totalMessages] = await contract.getCCIPStatus()
    bcCCIP(`CCIP: configured=${configured}, destinations=${Number(destinationCount)}, messages sent=${Number(totalMessages)}`)
    return {
      configured,
      destinationCount: Number(destinationCount),
      totalMessages: Number(totalMessages),
    }
  } catch (err) {
    bcWarn(`CCIP status unavailable: ${err.message}`)
    return { configured: false, destinationCount: 0, totalMessages: 0 }
  }
}

/**
 * Get the CCIP sync status from a specific CityNode.
 * Returns the latest Carmen location hash received via CCIP and metadata.
 *
 * @param {number} cityChainId - The chain ID of the CityNode.
 * @returns {{ locationHash: string, lastUpdate: number, sourceChain: string, messagesReceived: number }}
 */
export async function getCCIPSyncStatus(cityChainId) {
  try {
    bcCCIP(`CityNode[${cityChainId}].getCCIPSyncStatus() — received cross-chain messages`)
    const contract = getCityNodeReadContract(cityChainId)
    if (!contract) return null
    const [locationHash, lastUpdate, sourceChain, messagesReceived] = await contract.getCCIPSyncStatus()
    bcCCIP(`CityNode[${cityChainId}] sync: msgs=${Number(messagesReceived)}, lastUpdate=block ${Number(lastUpdate)}, source=${sourceChain}`)
    return {
      locationHash,
      lastUpdate: Number(lastUpdate),
      sourceChain: sourceChain.toString(),
      messagesReceived: Number(messagesReceived),
    }
  } catch (err) {
    bcWarn(`CCIP sync status unavailable for chain ${cityChainId}: ${err.message}`)
    return null
  }
}
