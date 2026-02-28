/**
 * Relay Service — gasless transaction relay for Carmen Sandiego On-Chain
 *
 * Routes player transactions through the paymaster/relayer server so players
 * never need ETH for gas. Uses signed-message pattern: player signs intent,
 * server validates signature and submits TX paying gas itself.
 *
 * Falls back to direct contract calls if relayer is unavailable.
 */

import { ethers } from "ethers"
import { getSigner, GAME_MASTER_ADDRESS } from "./contractService"

// ============================================================
//  Visual Logging for Video Demo
// ============================================================

const _rl = (tag, color, ...args) => {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(
    `%c[${ts}] %c${tag}`,
    "color:#888;font-weight:bold",
    `color:${color};font-weight:bold;font-size:11px`,
    ...args
  )
}
const rlOut  = (...a) => _rl("RELAY →  SERVER", "#e67e22", ...a)
const rlIn   = (...a) => _rl("RELAY ←  SERVER", "#27ae60", ...a)
const rlSign = (...a) => _rl("RELAY 🔑 SIGN  ", "#9b59b6", ...a)
const rlWarn = (...a) => _rl("RELAY ⚠  WARN  ", "#e74c3c", ...a)

// ============================================================
//  Configuration
// ============================================================

const RELAY_URL = import.meta.env.VITE_RELAYER_URL
  || import.meta.env.VITE_RELAY_URL
  || import.meta.env.VITE_CHAINLINK_FUNCTIONS_URL
  || "http://localhost:3001"

/** Whether relayer is available (set to false on first failure, retried periodically) */
let _relayerAvailable = null // null = untested
let _relayerCheckPromise = null

/** Per-player nonce counter for replay protection (timestamp-based to survive page refresh) */
let _nonce = Date.now()

// ============================================================
//  Relay availability check
// ============================================================

async function checkRelayerAvailable() {
  try {
    rlOut(`Health check → ${RELAY_URL}/health`)
    const resp = await fetch(`${RELAY_URL}/health`, { signal: AbortSignal.timeout(3000) })
    if (resp.ok) {
      _relayerAvailable = true
      rlIn("Relayer is UP ✓")
      return true
    }
  } catch {
    // relayer not reachable
  }
  _relayerAvailable = false
  rlWarn("Relayer is DOWN — will use direct contract calls")
  return false
}

/**
 * Check if the relayer is available (cached, re-checks every 60s if down).
 */
export async function isRelayerAvailable() {
  if (_relayerAvailable === true) return true
  if (_relayerAvailable === false) {
    // Re-check periodically (every 60s)
    if (!_relayerCheckPromise) {
      _relayerCheckPromise = new Promise((resolve) => {
        setTimeout(async () => {
          _relayerCheckPromise = null
          resolve(await checkRelayerAvailable())
        }, 60000)
      })
    }
    return false
  }
  // First check
  return checkRelayerAvailable()
}

// ============================================================
//  Signing
// ============================================================

/**
 * Sign a relay intent message.
 * Message: keccak256(abi.encodePacked(playerAddress, action, nonce, gameMasterAddress))
 */
async function signRelayIntent(action) {
  const signer = await getSigner()
  const playerAddress = await signer.getAddress()
  const nonce = _nonce++

  rlSign(`Action: "${action}" | Player: ${playerAddress.slice(0, 10)}... | Nonce: ${nonce}`)

  const messageHash = ethers.keccak256(
    ethers.solidityPacked(
      ["address", "string", "uint256", "address"],
      [playerAddress, action, nonce, GAME_MASTER_ADDRESS]
    )
  )

  rlSign(`Hash: ${messageHash.slice(0, 18)}... → Requesting wallet signature...`)
  const signature = await signer.signMessage(ethers.getBytes(messageHash))
  rlSign(`Signature: ${signature.slice(0, 18)}... ✓`)

  return { playerAddress, signature, nonce: nonce.toString() }
}

// ============================================================
//  Relay helpers
// ============================================================

/**
 * Send a relay request to the server.
 * @returns {{ success, txHash, blockNumber }} or throws on failure
 */
async function relayRequest(endpoint, body) {
  const url = `${RELAY_URL}${endpoint}`
  rlOut(`POST ${endpoint}`, { player: body.playerAddress?.slice(0, 10), action: body.action })
  const t0 = performance.now()

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const result = await resp.json()
  const dt = (performance.now() - t0).toFixed(0)

  if (!result.success) {
    rlWarn(`${endpoint} FAILED (${dt}ms): ${result.error}`)
    throw new Error(result.error || "Relay request failed")
  }

  rlIn(`${endpoint} OK (${dt}ms) | tx: ${result.txHash?.slice(0, 18)}... | block: ${result.blockNumber}`)
  return result
}

// ============================================================
//  Relayed GameMaster Actions
// ============================================================

/**
 * Relay registerPlayer(publicKeyHex) through server.
 * Returns relay result or null if relay unavailable.
 */
export async function relayRegisterPlayer(publicKeyHex) {
  if (!(await isRelayerAvailable())) { rlWarn("Relayer unavailable — registerPlayer will use direct TX"); return null }
  try {
    rlOut("▶ registerPlayer (gasless relay)")
    const signed = await signRelayIntent("registerPlayer")
    return await relayRequest("/relay/register-player", {
      ...signed,
      publicKeyHex,
    })
  } catch (err) {
    rlWarn(`registerPlayer relay failed, falling back: ${err.message}`)
    return null
  }
}

/**
 * Relay startMission() through server.
 * Returns relay result or null if relay unavailable.
 */
export async function relayStartMission() {
  if (!(await isRelayerAvailable())) { rlWarn("Relayer unavailable — startMission will use direct TX"); return null }
  try {
    rlOut("▶ startMission (gasless relay) — triggers Chainlink VRF v2.5")
    const signed = await signRelayIntent("startMission")
    return await relayRequest("/relay/start-mission", signed)
  } catch (err) {
    rlWarn(`startMission relay failed, falling back: ${err.message}`)
    return null
  }
}

/**
 * Relay submitInvestigation(chainId) through server.
 * Returns relay result or null if relay unavailable.
 */
export async function relaySubmitInvestigation(chainId) {
  if (!(await isRelayerAvailable())) { rlWarn("Relayer unavailable — submitInvestigation will use direct TX"); return null }
  try {
    rlOut(`▶ submitInvestigation(chainId=${chainId}) (gasless relay)`)
    const signed = await signRelayIntent(`submitInvestigation:${chainId}`)
    return await relayRequest("/relay/submit-investigation", {
      ...signed,
      chainId: chainId.toString(),
    })
  } catch (err) {
    rlWarn(`submitInvestigation relay failed, falling back: ${err.message}`)
    return null
  }
}

/**
 * Relay a CityNode action through server.
 * @param {number} chainId
 * @param {string} action - e.g. "inspectLocation", "requestClue", "flagTx"
 * @param {object} params - action-specific parameters
 * Returns relay result or null if relay unavailable.
 */
export async function relayCityAction(chainId, action, params = {}) {
  if (!(await isRelayerAvailable())) { rlWarn(`Relayer unavailable — city:${action} will use direct TX`); return null }
  try {
    rlOut(`▶ CityNode.${action}(chain=${chainId})`, params)
    const signed = await signRelayIntent(`city:${action}:${chainId}`)
    return await relayRequest("/relay/city-action", {
      ...signed,
      chainId: chainId.toString(),
      action,
      params,
    })
  } catch (err) {
    rlWarn(`city ${action} relay failed, falling back: ${err.message}`)
    return null
  }
}

// ============================================================
//  Convenience wrappers for CityNode actions
// ============================================================

export async function relayInspectLocation(chainId, locationIdx) {
  return relayCityAction(chainId, "inspectLocation", { locationIdx })
}

export async function relayScanAnomalies(chainId, locationIdx) {
  return relayCityAction(chainId, "scanAnomalies", { locationIdx })
}

export async function relayRequestClue(chainId, locationIdx, clueIndex) {
  return relayCityAction(chainId, "requestClue", { locationIdx, clueIndex })
}

export async function relayRequestDossier(chainId) {
  return relayCityAction(chainId, "requestDossier")
}

export async function relayRequestCapture(chainId, suspectWallet, evidenceBundleHash) {
  return relayCityAction(chainId, "requestCapture", { suspectWallet, evidenceBundleHash })
}

export async function relayFlagTx(chainId, refId) {
  return relayCityAction(chainId, "flagTx", { refId })
}
