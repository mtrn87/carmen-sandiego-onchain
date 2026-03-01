/**
 * ECIES encryption for Carmen Sandiego On-Chain
 *
 * Uses secp256k1 ECDH + HKDF-SHA256 + AES-256-GCM
 * Compatible with @noble/curves + @noble/ciphers + @noble/hashes
 *
 * Ciphertext format: ephemeralPubKey(65) || iv(12) || ciphertext || tag(16)
 * All encoded as hex string for on-chain storage
 *
 * NOTE: This is an encrypt-only copy of mission-start/ecies.ts.
 * CRE compiles each workflow into a separate WASM module, so cross-workflow
 * imports are not supported. The full version (with decrypt + keygen) lives
 * in cre-workflows/mission-start/ecies.ts. If you modify the encryption
 * logic, update both files to keep them in sync.
 */

import { secp256k1 } from "@noble/curves/secp256k1"
import { gcm } from "@noble/ciphers/aes"
import { hkdf } from "@noble/hashes/hkdf"
import { sha256 } from "@noble/hashes/sha256"

const IV_LENGTH = 12

/**
 * Deterministic ECIES encrypt.
 *
 * Instead of true randomness (not available in Javy/WASM), the ephemeral
 * private key and IV are derived deterministically from the VRF salt via
 * HKDF(sha256, salt, sha256(plaintext), "carmen-ecies-ephem", 44).
 *
 * This is required for DON consensus: all nodes must produce identical output.
 * Security comes from the VRF salt uniqueness, not from randomness at encrypt time.
 */
export function eciesEncrypt(recipientPubKey: Uint8Array, plaintext: string, seed: Uint8Array): string {
  // Derive ephemeral key (32 bytes) + IV (12 bytes) from seed + plaintext hash
  const plaintextHash = sha256(new TextEncoder().encode(plaintext))
  const derived = hkdf(sha256, seed, plaintextHash, "carmen-ecies-ephem", 44)
  const ephemeralPrivKey = derived.slice(0, 32)
  const iv = derived.slice(32, 44)

  const ephemeralPubKey = secp256k1.getPublicKey(ephemeralPrivKey, false)

  const sharedPoint = secp256k1.getSharedSecret(ephemeralPrivKey, recipientPubKey)
  const sharedX = sharedPoint.slice(1, 33)

  const aesKey = hkdf(sha256, sharedX, undefined, "carmen-ecies", 32)

  const plaintextBytes = new TextEncoder().encode(plaintext)
  const cipher = gcm(aesKey, iv)
  const ciphertext = cipher.encrypt(plaintextBytes)

  const result = new Uint8Array(ephemeralPubKey.length + iv.length + ciphertext.length)
  result.set(ephemeralPubKey, 0)
  result.set(iv, ephemeralPubKey.length)
  result.set(ciphertext, ephemeralPubKey.length + iv.length)

  return bytesToHex(result)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
