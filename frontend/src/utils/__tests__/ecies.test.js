import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import { secp256k1 } from '@noble/curves/secp256k1'
import { gcm } from '@noble/ciphers/aes'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { randomBytes } from '@noble/ciphers/webcrypto'
import { getOrCreateKeyPair, getPublicKeyHex, decryptClue, hasKeyPair } from '../../utils/ecies.js'

// NOTE: No beforeEach DB cleanup — openDB() in ecies.js keeps connections open,
// and deleteDatabase hangs waiting for them to close. Tests share the same keypair
// which is fine since getOrCreateKeyPair is idempotent.

// Helper: encrypt (mirrors CRE eciesEncrypt)
function eciesEncrypt(recipientPubKey, plaintext) {
  const ephPriv = secp256k1.utils.randomPrivateKey()
  const ephPub = secp256k1.getPublicKey(ephPriv, false)
  const shared = secp256k1.getSharedSecret(ephPriv, recipientPubKey)
  const sharedX = shared.slice(1, 33)
  const aesKey = hkdf(sha256, sharedX, undefined, 'carmen-ecies', 32)
  const iv = randomBytes(12)
  const ct = gcm(aesKey, iv).encrypt(new TextEncoder().encode(plaintext))
  const result = new Uint8Array(65 + 12 + ct.length)
  result.set(ephPub, 0)
  result.set(iv, 65)
  result.set(ct, 77)
  return Array.from(result, (b) => b.toString(16).padStart(2, '0')).join('')
}

describe('ECIES Utilities', () => {
  it('generates a valid secp256k1 keypair', async () => {
    const kp = await getOrCreateKeyPair()
    expect(kp.privateKey).toBeInstanceOf(Uint8Array)
    expect(kp.privateKey.length).toBe(32)
    expect(kp.publicKey).toBeInstanceOf(Uint8Array)
    expect(kp.publicKey.length).toBe(65) // uncompressed
    expect(kp.publicKey[0]).toBe(0x04) // uncompressed prefix
  })

  it('returns publicKeyHex with 0x prefix and 130 hex chars', async () => {
    const hex = await getPublicKeyHex()
    expect(hex.startsWith('0x')).toBe(true)
    expect(hex.length).toBe(132) // 0x + 130
  })

  it('returns same keypair on second call (IndexedDB persistence)', async () => {
    const kp1 = await getOrCreateKeyPair()
    const kp2 = await getOrCreateKeyPair()
    expect(kp1.publicKeyHex).toBe(kp2.publicKeyHex)
  })

  it('hasKeyPair returns true after key creation', async () => {
    await getOrCreateKeyPair()
    const has = await hasKeyPair()
    expect(has).toBe(true)
  })

  it('encrypt → decrypt round-trip produces original plaintext', async () => {
    const kp = await getOrCreateKeyPair()
    const plaintext = 'Carmen was last seen near the Tokyo staking vault.'
    const ciphertextHex = eciesEncrypt(kp.publicKey, plaintext)
    const decrypted = await decryptClue(ciphertextHex)
    expect(decrypted).toBe(plaintext)
  })

  it('decrypt with wrong key throws', async () => {
    await getOrCreateKeyPair()
    const plaintext = 'Secret clue'
    const otherKey = secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey(), false)
    const ciphertextHex = eciesEncrypt(otherKey, plaintext)
    await expect(decryptClue(ciphertextHex)).rejects.toThrow()
  })
})
