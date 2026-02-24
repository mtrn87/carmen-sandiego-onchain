import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import CyberGrid from '../components/CyberGrid'
import GlitchText from '../components/GlitchText'
import TypeWriter from '../components/TypeWriter'
import NeonButton from '../components/NeonButton'
import NicknameModal from '../components/NicknameModal'
import { useGameStore } from '../store/gameStore'
import { getEthereumAddressFromPrivy, generateMultiChainAddressesFromPrivy, getUserInfoFromPrivy } from '../utils/privyProvider'
import { saveAuthSession, clearAuthSession } from '../utils/authPersistence'
import { initializePlayerRegistry, getPlayerData } from '../services/creService'
import { getOrCreateKeyPair } from '../utils/ecies'
import { isPlayerRegistered, registerPlayer as registerPlayerOnChain, getPlayerActiveMission } from '../services/contractService'
import styles from './LoginPage.module.css'

const LEADERBOARD_MSG = 'Leaderboard coming soon! Complete missions to build your rank.'

const BOOT_LINES = [
  '> ACME DETECTIVE AGENCY :: MAINFRAME v3.1.4',
  '> CONNECTING TO DECENTRALIZED NETWORK...',
  '> CHAINLINK CRE RUNTIME DETECTED',
  '> MULTI-CHAIN BRIDGE: ONLINE',
  '> ENCRYPTION PROTOCOL: ECIES-secp256k1',
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
  const [showNicknameModal, setShowNicknameModal] = useState(false)
  const { connectWallet, isConnected, walletAddress, playerNickname, disconnectWallet, missionId, initGame } = useGameStore()
  const [startingMission, setStartingMission] = useState(false)

  // load on-chain state to detect existing mission
  useEffect(() => {
    if (isConnected && walletAddress) {
      initGame()
    }
  }, [isConnected, walletAddress, initGame])

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

  const { user, login, logout } = usePrivy()

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    try {
      console.log('Connecting with Privy...')
      
      // Privy login opens the social auth modal
      await login()
      
      setConnecting(false)
    } catch (error) {
      console.error('Connection failed:', error)
      setConnecting(false)
    }
  }, [login])

  const handleDisconnect = useCallback(async () => {
    try {
      await logout()
      disconnectWallet()
      clearAuthSession()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }, [logout, disconnectWallet])

  // Sync with Privy when user logs in
  useEffect(() => {
    if (user && !isConnected) {
      (async () => {
        try {
          console.log('[LoginPage] Syncing Privy user...', user)

          // Extract wallet address
          let address = null
          if (user.wallet) {
            try {
              address = await getEthereumAddressFromPrivy(user)
            } catch (walletError) {
              console.warn('[LoginPage] Wallet error:', walletError)
              address = user.wallet.address
            }
          }

          if (!address) {
            console.error('[LoginPage] No wallet address found')
            return
          }

          console.log('[LoginPage] Wallet address:', address)

          // Initialize PlayerRegistry contract
          const playerRegistryAddress = import.meta.env.VITE_PLAYER_REGISTRY_ADDRESS_SEPOLIA
          if (!playerRegistryAddress) {
            throw new Error('VITE_PLAYER_REGISTRY_ADDRESS_SEPOLIA not set in .env')
          }
          await initializePlayerRegistry(playerRegistryAddress)

          // Save session
          const userInfo = getUserInfoFromPrivy(user)
          connectWallet(address)
          localStorage.setItem('wallet_address', address)
          saveAuthSession(address, userInfo, null, null)

          // Check if player exists (simple read, no CRE)
          console.log('[LoginPage] Checking if player exists...')
          
          // Try to use the registered address if available (for returning players)
          const addressToCheck = localStorage.getItem('player_registered_address') || address
          const playerData = await getPlayerData(addressToCheck)

          if (playerData) {
            // Player exists, go to game
            console.log('[LoginPage] Player exists:', playerData)
            saveAuthSession(address, userInfo, null, playerData.nickname, addressToCheck)
            navigate('/game')
          } else {
            // Player doesn't exist, show nickname modal
            console.log('[LoginPage] Player does not exist, showing nickname modal')
            setShowNicknameModal(true)
          }
        } catch (error) {
          console.error('[LoginPage] Error syncing Privy user:', error)
          alert('Error: ' + error.message)
        }
      })()
    }
  }, [user, isConnected, connectWallet, navigate])

  const handleNicknameConfirm = useCallback((nickname) => {
    localStorage.setItem('player_nickname', nickname)
    setShowNicknameModal(false)
    navigate('/game')
  }, [navigate])

  return (
    <div className={`${styles.container} ${styles.crtScreen} ${flickerClass}`}>
      <CyberGrid />

      {/* vignette overlay */}
      <div className={styles.vignette} />

      {/* nickname modal */}
      {showNicknameModal && <NicknameModal onConfirm={handleNicknameConfirm} />}

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
                      Connect
                    </NeonButton>
                  </div>

                  <div className={styles.networkBadges}>
                    <span className={styles.badge}>SEPOLIA</span>
                    <span className={styles.badge}>ARBITRUM SEPOLIA</span>
                    <span className={styles.badge}>BASE SEPOLIA</span>
                  </div>
                </>
              ) : (
                <div className={styles.connectedSection}>
                  <div className={styles.walletInfo}>
                    <span className={styles.connectedDot} />
                    <span className={styles.walletAddr}>{walletAddress}</span>
                    <span className={styles.connectedLabel}>CONNECTED</span>
                  </div>

                  {playerNickname && (
                    <div className={styles.nicknameDisplay}>
                      <span className={styles.nicknameLabel}>AGENT:</span>
                      <span className={styles.nicknameBadge}>{playerNickname}</span>
                    </div>
                  )}

                  <NeonButton
                    variant="green"
                    loading={startingMission}
                    onClick={async () => {
                      if (missionId) {
                        // mission already active — skip briefing, load city and go to game
                        setStartingMission(true)
                        try {
                          const store = useGameStore.getState()
                          await store.selectCity(421614)
                          store.selectLocation(0)
                          store.hydrateMissionPlot(missionId)
                          await store._setupEventListeners(missionId)
                        } catch (err) {
                          console.warn('[LoginPage] City setup failed:', err.message)
                        }
                        useGameStore.setState({
                          briefingDone: true,
                          terminalLines: [
                            { text: '> ACME MAINFRAME :: INITIALIZING MISSION', color: 'cyan', type: 'system' },
                            { text: '> Agent connected. Welcome, Detective.', color: 'green', type: 'system' },
                            { text: `> RESUMING MISSION #${missionId}. Carmen's location committed.`, color: 'yellow', type: 'alert' },
                            { text: '> Type /MISSION in terminal to read your current assignment.', color: 'cyan', type: 'help' },
                          ],
                        })
                        setStartingMission(false)
                        navigate('/game')
                        return
                      }
                      // no active mission — navigate to game to start briefing
                      setStartingMission(false)
                      navigate('/game')
                    }}
                  >
                    {startingMission ? 'Starting Mission...' : missionId ? 'Continue Mission' : 'Start Investigation'}
                  </NeonButton>

                  <NeonButton variant="magenta" onClick={() => alert(LEADERBOARD_MSG)}>
                    Leaderboard
                  </NeonButton>

                  <NeonButton variant="red" onClick={handleDisconnect}>
                    Logout
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
                <span className={styles.infoValue}>ECIES-secp256k1</span>
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
