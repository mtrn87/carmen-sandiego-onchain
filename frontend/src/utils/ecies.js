/**
 * ECIES secp256k1 encryption utilities for Carmen Sandiego On-Chain
 *
 * - Key pair stored in IndexedDB (private key never leaves the browser)
 * - Public key (65 bytes uncompressed) sent on-chain via registerPlayer()
 * - CRE encrypts clues with player's public key
 * - Frontend decrypts with private key from IndexedDB
 *
 * Cipher format: ephemeralPubKey(65) || iv(12) || ciphertext+tag
 */

import { secp256k1 } from "@noble/curves/secp256k1"
import { gcm } from "@noble/ciphers/aes"
import { hkdf } from "@noble/hashes/hkdf"
import { sha256 } from "@noble/hashes/sha256"

const DB_NAME = "carmen-sandiego"
const STORE_NAME = "keys"
const KEY_ID = "ecies-keypair"

// ============================================================
//  IndexedDB helpers
// ============================================================

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function dbGet(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const req = tx.objectStore(STORE_NAME).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

async function dbPut(record) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const req = tx.objectStore(STORE_NAME).put(record)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// ============================================================
//  Hex utilities
// ============================================================

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

// ============================================================
//  Key management
// ============================================================

/**
 * Get or create the player's ECIES key pair.
 * Private key stays in IndexedDB, public key goes on-chain.
 * @returns {{ privateKey: Uint8Array, publicKey: Uint8Array, publicKeyHex: string }}
 */
export async function getOrCreateKeyPair() {
  const existing = await dbGet(KEY_ID)
  if (existing) {
    const privateKey = hexToBytes(existing.privateKeyHex)
    const publicKey = secp256k1.getPublicKey(privateKey, false) // uncompressed 65 bytes
    return {
      privateKey,
      publicKey,
      publicKeyHex: "0x" + bytesToHex(publicKey),
    }
  }

  // Generate new key pair
  const privateKey = secp256k1.utils.randomPrivateKey()
  const publicKey = secp256k1.getPublicKey(privateKey, false)

  await dbPut({
    id: KEY_ID,
    privateKeyHex: bytesToHex(privateKey),
    createdAt: Date.now(),
  })

  return {
    privateKey,
    publicKey,
    publicKeyHex: "0x" + bytesToHex(publicKey),
  }
}

/**
 * Get the public key hex for on-chain registration.
 * Creates a new key pair if none exists.
 * @returns {string} 0x-prefixed uncompressed public key (130 hex chars + 0x)
 */
export async function getPublicKeyHex() {
  const { publicKeyHex } = await getOrCreateKeyPair()
  return publicKeyHex
}

// ============================================================
//  ECIES Decryption
// ============================================================

/**
 * Decrypt an ECIES-encrypted message using the player's private key.
 * Format: ephemeralPubKey(65) || iv(12) || ciphertext+tag(16)
 * @param {string} ciphertextHex - hex-encoded ciphertext (with or without 0x prefix)
 * @returns {string} decrypted plaintext
 */
export async function decryptClue(ciphertextHex) {
  const { privateKey } = await getOrCreateKeyPair()

  const data = hexToBytes(ciphertextHex)

  // Parse components
  const ephemeralPubKey = data.slice(0, 65)
  const iv = data.slice(65, 65 + 12)
  const ciphertext = data.slice(65 + 12) // includes 16-byte GCM tag

  // ECDH shared secret
  const sharedPoint = secp256k1.getSharedSecret(privateKey, ephemeralPubKey)
  const sharedX = sharedPoint.slice(1, 33)

  // Derive AES key via HKDF (must match CRE side label)
  const aesKey = hkdf(sha256, sharedX, undefined, "carmen-ecies", 32)

  // Decrypt with AES-256-GCM
  const decipher = gcm(aesKey, iv)
  const plaintext = decipher.decrypt(ciphertext)

  return new TextDecoder().decode(plaintext)
}

/**
 * Check if the player has a stored key pair.
 * @returns {boolean}
 */
export async function hasKeyPair() {
  const existing = await dbGet(KEY_ID)
  return existing !== null
}