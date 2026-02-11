/**
 * ECIES encryption/decryption for Carmen Sandiego On-Chain
 *
 * Uses secp256k1 ECDH + HKDF-SHA256 + AES-256-GCM
 * Compatible with @noble/curves + @noble/ciphers + @noble/hashes
 *
 * Ciphertext format: ephemeralPubKey(65) || iv(12) || ciphertext || tag(16)
 * All encoded as hex string for on-chain storage
 */

import { secp256k1 } from "@noble/curves/secp256k1"
import { gcm } from "@noble/ciphers/aes"
import { hkdf } from "@noble/hashes/hkdf"
import { sha256 } from "@noble/hashes/sha256"
import { randomBytes } from "@noble/ciphers/webcrypto"

const IV_LENGTH = 12 // AES-GCM standard IV length

/**
 * Encrypt a plaintext string with the recipient's secp256k1 public key.
 *
 * @param recipientPubKey - 65-byte uncompressed public key (0x04 + X + Y)
 * @param plaintext - UTF-8 string to encrypt
 * @returns hex-encoded ciphertext (ephemeralPub + iv + encrypted + tag)
 */
export function eciesEncrypt(recipientPubKey: Uint8Array, plaintext: string): string {
  // 1. Generate ephemeral keypair
  const ephemeralPrivKey = secp256k1.utils.randomPrivateKey()
  const ephemeralPubKey = secp256k1.getPublicKey(ephemeralPrivKey, false) // uncompressed (65 bytes)

  // 2. ECDH: compute shared secret
  const sharedPoint = secp256k1.getSharedSecret(ephemeralPrivKey, recipientPubKey)
  // Use X coordinate only (skip 0x04 prefix byte)
  const sharedX = sharedPoint.slice(1, 33)

  // 3. HKDF: derive AES-256 key from shared secret
  const aesKey = hkdf(sha256, sharedX, undefined, "carmen-ecies", 32)

  // 4. AES-256-GCM encrypt
  const iv = randomBytes(IV_LENGTH)
  const plaintextBytes = new TextEncoder().encode(plaintext)
  const cipher = gcm(aesKey, iv)
  const ciphertext = cipher.encrypt(plaintextBytes) // includes 16-byte tag appended

  // 5. Concatenate: ephemeralPubKey(65) + iv(12) + ciphertext+tag
  const result = new Uint8Array(ephemeralPubKey.length + iv.length + ciphertext.length)
  result.set(ephemeralPubKey, 0)
  result.set(iv, ephemeralPubKey.length)
  result.set(ciphertext, ephemeralPubKey.length + iv.length)

  return bytesToHex(result)
}

/**
 * Decrypt ECIES ciphertext with the recipient's private key.
 *
 * @param privateKey - 32-byte secp256k1 private key
 * @param ciphertextHex - hex-encoded ciphertext from eciesEncrypt
 * @returns decrypted UTF-8 string
 */
export function eciesDecrypt(privateKey: Uint8Array, ciphertextHex: string): string {
  const data = hexToBytes(ciphertextHex)

  // 1. Extract components
  const ephemeralPubKey = data.slice(0, 65)
  const iv = data.slice(65, 65 + IV_LENGTH)
  const ciphertext = data.slice(65 + IV_LENGTH) // includes tag

  // 2. ECDH: compute shared secret
  const sharedPoint = secp256k1.getSharedSecret(privateKey, ephemeralPubKey)
  const sharedX = sharedPoint.slice(1, 33)

  // 3. HKDF: derive AES-256 key
  const aesKey = hkdf(sha256, sharedX, undefined, "carmen-ecies", 32)

  // 4. AES-256-GCM decrypt
  const decipher = gcm(aesKey, iv)
  const plaintext = decipher.decrypt(ciphertext)

  return new TextDecoder().decode(plaintext)
}

/**
 * Generate a secp256k1 keypair for ECIES.
 */
export function generateKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = secp256k1.utils.randomPrivateKey()
  const publicKey = secp256k1.getPublicKey(privateKey, false) // uncompressed
  return { privateKey, publicKey }
}

// --- Hex utilities ---
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
