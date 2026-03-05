/**
 * Relay Service — gasless transaction relay for Carmen Sandiego On-Chain
 *
 * Routes player transactions through the paymaster/relayer server so players
 * never need ETH for gas. Uses signed-message pattern: player signs intent,
 * server validates signature and submits TX paying gas itself.
 *
 * Falls back to direct contract calls if relayer is unavailable.
 */

import { getSigner } from "./contractService"

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
const rlWarn = (...a) => _rl("RELAY ⚠  WARN  ", "#e74c3c", ...a)

// ============================================================
//  Configuration
// ============================================================

const RELAY_URL = import.meta.env.VITE_RELAYER_URL
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
  // Return cached result if recently checked
  if (_relayerAvailable !== null) return _relayerAvailable
  
  // If check is in progress, wait for it
  if (_relayerCheckPromise) {
    await _relayerCheckPromise
    return _relayerAvailable
  }

  // Perform health check
  _relayerCheckPromise = (async () => {
    try {
      rlOut(`Health check → ${RELAY_URL}/health`)
      const resp = await fetch(`${RELAY_URL}/health`, { signal: AbortSignal.timeout(3000) })
      if (resp.ok) {
        const data = await resp.json()
        rlIn("Relayer is UP ✓", data)
        _relayerAvailable = true
        // Retry failed relayer every 5 minutes
        setTimeout(() => { _relayerAvailable = null }, 300_000)
      } else {
        throw new Error(`HTTP ${resp.status}`)
      }
    } catch (err) {
      rlWarn("Relayer is DOWN ✗", err.message)
      _relayerAvailable = false
      // Retry failed relayer every 30 seconds
      setTimeout(() => { _relayerAvailable = null }, 30_000)
    } finally {
      _relayerCheckPromise = null
    }
  })()

  await _relayerCheckPromise
  return _relayerAvailable
}

// ============================================================
//  Generic relay function
// ============================================================

async function relayTransaction(endpoint, payload) {
  if (!(await checkRelayerAvailable())) {
    rlWarn("Relayer unavailable, skipping relay")
    return null
  }

  try {
    const url = `${RELAY_URL}${endpoint}`
    rlOut(`POST ${url}`, payload)

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })

    if (!resp.ok) {
      const error = await resp.text()
      throw new Error(`Relay error: ${resp.status} - ${error}`)
    }

    const result = await resp.json()
    rlIn("Relay SUCCESS ✓", result)
    return result
  } catch (err) {
    rlWarn("Relay FAILED ✗", err.message)
    // Mark relayer as temporarily unavailable
    _relayerAvailable = false
    setTimeout(() => { _relayerAvailable = null }, 30_000)
    return null
  }
}

// ============================================================
//  Specific relay functions for game actions
// ============================================================

export async function relayFlagTx(chainId, bytes32RefId) {
  const signer = await getSigner()
  if (!signer) return null

  const playerAddress = await signer.getAddress()
  const nonce = ++_nonce
  const message = `flag:${chainId}:${bytes32RefId}:${nonce}`
  const signature = await signer.signMessage(message)

  return await relayTransaction("/relay/flag", {
    chainId,
    playerAddress,
    bytes32RefId,
    nonce,
    signature
  })
}

export async function relayRequestClue(chainId, locationIdx, clueIndex) {
  const signer = await getSigner()
  if (!signer) return null

  const playerAddress = await signer.getAddress()
  const nonce = ++_nonce
  const message = `clue:${chainId}:${locationIdx}:${clueIndex}:${nonce}`
  const signature = await signer.signMessage(message)

  return await relayTransaction("/relay/clue", {
    chainId,
    playerAddress,
    locationIdx,
    clueIndex,
    nonce,
    signature
  })
}

export async function relayRequestDossier(chainId) {
  const signer = await getSigner()
  if (!signer) return null

  const playerAddress = await signer.getAddress()
  const nonce = ++_nonce
  const message = `dossier:${chainId}:${nonce}`
  const signature = await signer.signMessage(message)

  return await relayTransaction("/relay/dossier", {
    chainId,
    playerAddress,
    nonce,
    signature
  })
}

export async function relayRequestCapture(chainId, evidence) {
  const signer = await getSigner()
  if (!signer) return null

  const playerAddress = await signer.getAddress()
  const nonce = ++_nonce
  const message = `capture:${chainId}:${JSON.stringify(evidence)}:${nonce}`
  const signature = await signer.signMessage(message)

  return await relayTransaction("/relay/capture", {
    chainId,
    playerAddress,
    evidence,
    nonce,
    signature
  })
}

export async function relayInspectLocation(chainId, locationIdx) {
  const signer = await getSigner()
  if (!signer) return null

  const playerAddress = await signer.getAddress()
  const nonce = ++_nonce
  const message = `inspect:${chainId}:${locationIdx}:${nonce}`
  const signature = await signer.signMessage(message)

  return await relayTransaction("/relay/inspect", {
    chainId,
    playerAddress,
    locationIdx,
    nonce,
    signature
  })
}

export async function relayScanAnomalies(chainId, locationIdx) {
  const signer = await getSigner()
  if (!signer) return null

  const playerAddress = await signer.getAddress()
  const nonce = ++_nonce
  const message = `scan:${chainId}:${locationIdx}:${nonce}`
  const signature = await signer.signMessage(message)

  return await relayTransaction("/relay/scan", {
    chainId,
    playerAddress,
    locationIdx,
    nonce,
    signature
  })
}

// ============================================================
//  Registration relay (for player signup)
// ============================================================

export async function relayRegistration(playerAddress, nickname, signature) {
  return await relayTransaction("/relay", {
    playerAddress,
    nickname,
    signature,
    nonce: "0"
  })
}
