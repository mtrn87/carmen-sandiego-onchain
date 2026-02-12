import { useState, useCallback } from 'react'
import { useGameStore } from '../store/gameStore'
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
      await new Promise((resolve) => setTimeout(resolve, 1500))

      setPlayerNickname(nickname)
      setSuccess(true)

      setTimeout(() => {
        onConfirm(nickname)
      }, 800)
    } catch (err) {
      setError('Failed to register nickname. Please try again.')
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
