import { useState, useCallback } from 'react'
import { useGameStore } from '../store/gameStore'
import { registerPlayerFlow, signRegistrationMessage, callChainlinkFunctionsForRegistration } from '../services/creService'
import { saveAuthSession } from '../utils/authPersistence'
import NeonButton from './NeonButton'
import styles from './NicknameModal.module.css'

// Reserved names that cannot be used as nicknames
const RESERVED_NICKNAMES = ['admin', 'carmen', 'sandiego', 'system', 'acme', 'gamemaster']

export default function NicknameModal({ onConfirm }) {
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const { setPlayerNickname } = useGameStore()

  const validateNickname = useCallback((value) => {
    setError('')

    if (!value) {
      setError('Nickname is required')
      return false
    }

    if (value.length < 3) {
      setError('Nickname must be at least 3 characters')
      return false
    }

    if (value.length > 20) {
      setError('Nickname must be at most 20 characters')
      return false
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      setError('Nickname can only contain letters, numbers, underscores, and hyphens')
      return false
    }

    if (RESERVED_NICKNAMES.includes(value.toLowerCase())) {
      setError('This nickname is reserved')
      return false
    }

    return true
  }, [])

  const handleInputChange = (e) => {
    const value = e.target.value
    setNickname(value)
    if (value) {
      validateNickname(value)
    }
  }

  const handleConfirm = async () => {
    if (!validateNickname(nickname)) {
      return
    }

    setLoading(true)
    try {
      console.log('[NicknameModal] Registering player with nickname:', nickname)
      
      // Get wallet address from localStorage
      const walletAddress = localStorage.getItem('wallet_address')
      if (!walletAddress) {
        throw new Error('Wallet address not found. Please reconnect.')
      }
      
      // Step 1: Sign message (zero gas)
      console.log('[NicknameModal] Signing registration message...')
      const signedData = await signRegistrationMessage(walletAddress, nickname)
      
      // Step 2: Call Chainlink Functions to relay (Chainlink pays gas)
      console.log('[NicknameModal] Calling Chainlink Functions...')
      try {
        await callChainlinkFunctionsForRegistration(signedData)
      } catch (err) {
        // Fallback: If Chainlink Functions not available, use direct call
        console.warn('[NicknameModal] Chainlink Functions not available, using fallback:', err.message)
        console.log('[NicknameModal] Using fallback: direct registration request')
        await registerPlayerFlow(nickname, walletAddress)
      }
      
      console.log('[NicknameModal] Registration request sent')
      
      // Save nickname to store and session
      setPlayerNickname(nickname)
      const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}')
      saveAuthSession(walletAddress, userInfo, null, nickname)
      
      setSuccess(true)

      setTimeout(() => {
        onConfirm(nickname)
      }, 800)
    } catch (err) {
      console.error('[NicknameModal] Registration error:', err)
      setError(err.message || 'Failed to register nickname. Please try again.')
      setLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !loading && nickname && !error) {
      handleConfirm()
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={`${styles.modal} ${success ? styles.success : ''}`}>
        <div className={styles.header}>
          <div className={styles.headerGlow} />
          <h2 className={styles.title}>[ AGENT REGISTRATION ]</h2>
        </div>

        <div className={styles.content}>
          <p className={styles.subtitle}>Enter your detective alias</p>

          <div className={styles.inputGroup}>
            <input
              type="text"
              value={nickname}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="Your nickname..."
              className={`${styles.input} ${error ? styles.inputError : ''}`}
              disabled={loading || success}
              maxLength={20}
            />
            <span className={styles.charCount}>
              {nickname.length}/20
            </span>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          {success && (
            <div className={styles.successMessage}>
              ✓ NICKNAME REGISTERED
            </div>
          )}

          <div className={styles.hint}>
            <span className={styles.hintLabel}>REQUIREMENTS:</span>
            <ul className={styles.hintList}>
              <li>3-20 characters</li>
              <li>Letters, numbers, _, - only</li>
              <li>Must be unique</li>
            </ul>
          </div>
        </div>

        <div className={styles.footer}>
          <NeonButton
            onClick={handleConfirm}
            loading={loading}
            disabled={!nickname || !!error || success}
            variant="cyan"
          >
            {success ? 'CONFIRMED' : 'REGISTER ALIAS'}
          </NeonButton>
        </div>

        <div className={styles.scanlines} />
      </div>
    </div>
  )
}
