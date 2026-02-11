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

export const GAME_MASTER_ADDRESS = "0x19281fB23Fa8C423c22A8856DD168c1eb0e9a8aD"
export const SEPOLIA_CHAIN_ID = 11155111

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
