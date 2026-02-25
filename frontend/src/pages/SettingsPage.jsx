import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import NeonButton from '../components/NeonButton'
import { useGameStore } from '../store/gameStore'
import styles from './SettingsPage.module.css'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { walletAddress, playerNickname, disconnectWallet } = useGameStore()
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem('carmen_sound') !== 'off'
  )

  function handleSoundToggle() {
    const next = !soundEnabled
    setSoundEnabled(next)
    localStorage.setItem('carmen_sound', next ? 'on' : 'off')
  }

  function handleDisconnect() {
    disconnectWallet()
    navigate('/')
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <span className={styles.headerIcon}>[</span>
          <span className={styles.headerTitle}>SETTINGS</span>
          <span className={styles.headerIcon}>]</span>
        </div>

        <div className={styles.sections}>
          {/* Account */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>ACCOUNT</h2>
            <div className={styles.row}>
              <span className={styles.rowLabel}>AGENT</span>
              <span className={styles.rowValue}>{playerNickname || 'Not registered'}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>WALLET</span>
              <span className={styles.rowValue}>
                {walletAddress
                  ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`
                  : 'Not connected'}
              </span>
            </div>
          </div>

          {/* Preferences */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>PREFERENCES</h2>
            <div className={styles.row}>
              <span className={styles.rowLabel}>SOUND</span>
              <button
                className={`${styles.toggle} ${soundEnabled ? styles.toggleOn : ''}`}
                onClick={handleSoundToggle}
              >
                {soundEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Danger zone */}
          {walletAddress && (
            <div className={styles.section}>
              <h2 className={`${styles.sectionTitle} ${styles.danger}`}>DANGER ZONE</h2>
              <NeonButton variant="red" onClick={handleDisconnect}>
                Disconnect Wallet
              </NeonButton>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <NeonButton variant="cyan" onClick={() => navigate(-1)}>
            BACK
          </NeonButton>
        </div>
      </div>
    </div>
  )
}
