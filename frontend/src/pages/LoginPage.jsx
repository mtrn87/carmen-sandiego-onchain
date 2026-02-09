import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import CyberGrid from '../components/CyberGrid'
import GlitchText from '../components/GlitchText'
import TypeWriter from '../components/TypeWriter'
import NeonButton from '../components/NeonButton'
import { useGameStore } from '../store/gameStore'
import styles from './LoginPage.module.css'

const MOCK_ADDRESS = '0x7a3B...F42d'

const BOOT_LINES = [
  '> ACME DETECTIVE AGENCY :: MAINFRAME v3.1.4',
  '> CONNECTING TO DECENTRALIZED NETWORK...',
  '> CHAINLINK CRE RUNTIME DETECTED',
  '> MULTI-CHAIN BRIDGE: ONLINE',
  '> ENCRYPTION PROTOCOL: ECDSA-256',
  '> STATUS: AWAITING AGENT CREDENTIALS',
]

export default function LoginPage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('boot') // boot -> title -> ready
  const [bootLine, setBootLine] = useState(0)
  const [showLogo, setShowLogo] = useState(false)
  const [showButtons, setShowButtons] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [flickerClass, setFlickerClass] = useState('')
  const { connectWallet, isConnected, walletAddress } = useGameStore()

  // boot sequence
  useEffect(() => {
    if (phase !== 'boot') return
    if (bootLine >= BOOT_LINES.length) {
      setTimeout(() => setPhase('title'), 600)
      return
    }
    const timeout = setTimeout(() => setBootLine((l) => l + 1), 350)
    return () => clearTimeout(timeout)
  }, [phase, bootLine])

  // title phase
  useEffect(() => {
    if (phase !== 'title') return
    setTimeout(() => setShowLogo(true), 300)
    setTimeout(() => {
      setPhase('ready')
      setShowButtons(true)
    }, 1800)
  }, [phase])

  // random screen flicker
  useEffect(() => {
    const interval = setInterval(() => {
      setFlickerClass(styles.flicker)
      setTimeout(() => setFlickerClass(''), 100)
    }, 5000 + Math.random() * 8000)
    return () => clearInterval(interval)
  }, [])

  const handleConnect = useCallback(() => {
    setConnecting(true)
    // mock wallet connection
    setTimeout(() => {
      connectWallet(MOCK_ADDRESS)
      setConnecting(false)
    }, 2000)
  }, [connectWallet])

  return (
    <div className={`${styles.container} ${styles.crtScreen} ${flickerClass}`}>
      <CyberGrid />

      {/* vignette overlay */}
      <div className={styles.vignette} />

      {/* boot sequence terminal */}
      {phase === 'boot' && (
        <div className={styles.terminal}>
          <div className={styles.terminalHeader}>
            <span className={styles.terminalDot} />
            <span className={styles.terminalDot} />
            <span className={styles.terminalDot} />
            <span className={styles.terminalTitle}>acme_mainframe.exe</span>
          </div>
          <div className={styles.terminalBody}>
            {BOOT_LINES.slice(0, bootLine).map((line, i) => (
              <div key={i} className={styles.bootLine}>
                {line}
              </div>
            ))}
            {bootLine < BOOT_LINES.length && (
              <span className={styles.cursor}>_</span>
            )}
          </div>
        </div>
      )}

      {/* main content */}
      {phase !== 'boot' && (
        <div className={styles.content}>
          {/* logo */}
          <div className={`${styles.logoContainer} ${showLogo ? styles.logoVisible : ''}`}>
            <div className={styles.logoGlow} />
            <img src="/logo.png" alt="Carmen Sandiego Web3" className={styles.logo} />
          </div>

          {/* subtitle */}
          {showLogo && (
            <div className={styles.subtitle}>
              <TypeWriter
                text="A DECENTRALIZED MYSTERY ACROSS THE BLOCKCHAIN"
                speed={30}
                delay={500}
                className={styles.subtitleText}
              />
            </div>
          )}

          {/* action buttons */}
          {showButtons && (
            <div className={styles.actions}>
              {!isConnected ? (
                <>
                  <div className={styles.walletSection}>
                    <GlitchText
                      text="[ AGENT IDENTIFICATION REQUIRED ]"
                      className={styles.walletLabel}
                    />
                    <NeonButton
                      onClick={handleConnect}
                      loading={connecting}
                      variant="cyan"
                    >
                      Connect Wallet
                    </NeonButton>
                  </div>

                  <div className={styles.networkBadges}>
                    <span className={styles.badge}>SEPOLIA</span>
                    <span className={styles.badge}>POLYGON AMOY</span>
                    <span className={styles.badge}>ARBITRUM SEPOLIA</span>
                  </div>
                </>
              ) : (
                <div className={styles.connectedSection}>
                  <div className={styles.walletInfo}>
                    <span className={styles.connectedDot} />
                    <span className={styles.walletAddr}>{walletAddress}</span>
                    <span className={styles.connectedLabel}>CONNECTED</span>
                  </div>

                  <NeonButton variant="green" onClick={() => navigate('/game')}>
                    Start Investigation
                  </NeonButton>

                  <NeonButton variant="magenta" onClick={() => {}}>
                    Leaderboard
                  </NeonButton>
                </div>
              )}
            </div>
          )}

          {/* bottom info bar */}
          {showButtons && (
            <div className={styles.infoBar}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>NETWORK</span>
                <span className={styles.infoValue}>MULTI-CHAIN</span>
              </div>
              <div className={styles.infoDivider} />
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>PROTOCOL</span>
                <span className={styles.infoValue}>CHAINLINK CRE</span>
              </div>
              <div className={styles.infoDivider} />
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>ENCRYPTION</span>
                <span className={styles.infoValue}>ECDSA-256</span>
              </div>
              <div className={styles.infoDivider} />
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>STATUS</span>
                <span className={`${styles.infoValue} ${styles.statusOnline}`}>
                  ONLINE
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* corner decorations */}
      <div className={`${styles.corner} ${styles.cornerTL}`} />
      <div className={`${styles.corner} ${styles.cornerTR}`} />
      <div className={`${styles.corner} ${styles.cornerBL}`} />
      <div className={`${styles.corner} ${styles.cornerBR}`} />
    </div>
  )
}
