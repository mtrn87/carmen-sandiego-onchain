import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import CyberGrid from '../components/CyberGrid'
import GlitchText from '../components/GlitchText'
import TypeWriter from '../components/TypeWriter'
import NeonButton from '../components/NeonButton'
import NicknameModal from '../components/NicknameModal'
import LeaderboardModal from '../components/LeaderboardModal'
import { useGameStore } from '../store/gameStore'
import { getEthereumAddressFromPrivy, getUserInfoFromPrivy } from '../utils/privyProvider'
import { saveAuthSession, clearAuthSession } from '../utils/authPersistence'
import { initializePlayerRegistry, getPlayerData } from '../services/creService'
import { initializeExternalProvider, getSigner } from '../services/contractService'
import styles from './LoginPage.module.css'

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
  const [showLeaderboard, setShowLeaderboard] = useState(false)

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

  const { user, login, logout, ready: privyReady, createWallet } = usePrivy()
  const { wallets } = useWallets()

  // if user is authenticated but has no wallet yet, create one automatically
  useEffect(() => {
    if (user && privyReady && wallets?.length === 0) {
      createWallet().catch((err) => {
        // "already has wallet" is expected when wallets array is momentarily empty during hydration
        if (!err.message?.includes('already has')) {
          console.warn('[LoginPage] createWallet failed:', err.message)
        }
      })
    }
  }, [user, privyReady, wallets, createWallet])

  const handleConnect = useCallback(async () => {
    if (user) return // already authenticated, sync is in progress
    setConnecting(true)
    try {
      console.log('Connecting with Privy...')
      await login()
      setConnecting(false)
    } catch (error) {
      console.error('Connection failed:', error)
      setConnecting(false)
    }
  }, [login, user])

  const handleDisconnect = useCallback(async () => {
    try {
      await logout()
      disconnectWallet()
      clearAuthSession()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }, [logout, disconnectWallet])

  // Sync with Privy when user logs in (wait for wallets to be available)
  useEffect(() => {
    if (user && !isConnected && wallets?.length > 0) {
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

          // Initialize Privy wallet provider for signing transactions
          const privyWallet = wallets.find(w => w.address?.toLowerCase() === address.toLowerCase()) || wallets[0]
          let signerAddress = address
          if (privyWallet) {
            try {
              // Switch to Sepolia before getting the provider
              await privyWallet.switchChain(11155111)
              const eip1193 = await privyWallet.getEthereumProvider()
              initializeExternalProvider(eip1193)
              // Get the REAL signer address (may differ from Privy user.wallet.address)
              const signer = await getSigner()
              signerAddress = await signer.getAddress()
              console.log('[LoginPage] Privy EIP-1193 provider initialized on Sepolia')
              console.log('[LoginPage] Actual signer address:', signerAddress)
              if (signerAddress.toLowerCase() !== address.toLowerCase()) {
                console.warn('[LoginPage] Signer address differs from Privy address!', { privy: address, signer: signerAddress })
                address = signerAddress
              }
            } catch (provErr) {
              console.warn('[LoginPage] Could not get Privy provider:', provErr.message)
            }
          }

          // Initialize PlayerRegistry contract
          const playerRegistryAddress = import.meta.env.VITE_PLAYER_REGISTRY_ADDRESS_SEPOLIA
          if (!playerRegistryAddress) {
            throw new Error('VITE_PLAYER_REGISTRY_ADDRESS_SEPOLIA not set in .env')
          }
          await initializePlayerRegistry(playerRegistryAddress)

          // Auto-fund player wallet (gasless UX — relayer sends testnet ETH)
          const paymasterUrl = import.meta.env.VITE_RELAYER_URL || import.meta.env.VITE_PAYMASTER_URL || 'http://localhost:3001'
          if (paymasterUrl) {
            try {
              const faucetRes = await fetch(`${paymasterUrl}/faucet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address }),
              })
              const faucetData = await faucetRes.json()
              if (faucetData.success) {
                console.log('[LoginPage] Paymaster:', faucetData.skipped ? 'wallet already funded' : `funded ${faucetData.amount} ETH`)
              }
            } catch (faucetErr) {
              console.warn('[LoginPage] Paymaster unavailable:', faucetErr.message)
            }
          }

          // Save session (use actual signer address for on-chain lookups)
          const userInfo = getUserInfoFromPrivy(user)
          connectWallet(address)
          localStorage.setItem('wallet_address', address)
          saveAuthSession(address, userInfo, null, null)

          // Check if player exists (simple read, no CRE)
          console.log('[LoginPage] Checking if player exists for:', address)

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
  }, [user, isConnected, wallets, connectWallet, navigate])

  const handleNicknameConfirm = useCallback((nickname) => {
    localStorage.setItem('player_nickname', nickname)
    useGameStore.getState().setPlayerNickname(nickname)
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

      {/* leaderboard modal */}
      {showLeaderboard && <LeaderboardModal onClose={() => setShowLeaderboard(false)} />}

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
              {/* privy authenticated + wallet present but game store still syncing */}
              {user && wallets?.length > 0 && !isConnected ? (
                <div className={styles.walletSection}>
                  <GlitchText
                    text="[ AUTHENTICATING AGENT... ]"
                    className={styles.walletLabel}
                  />
                  <NeonButton variant="cyan" loading={true}>
                    Connecting...
                  </NeonButton>
                </div>
              ) : user && wallets?.length === 0 ? (
                <div className={styles.walletSection}>
                  <GlitchText
                    text="[ CREATING AGENT WALLET... ]"
                    className={styles.walletLabel}
                  />
                  <NeonButton variant="cyan" loading={true}>
                    Preparing...
                  </NeonButton>
                </div>
              ) : !user ? (
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
                        // mission already active — skip briefing, restore discovery + city state
                        setStartingMission(true)
                        try {
                          const store = useGameStore.getState()
                          // restore discovered cities, visited cities, trail from localStorage
                          await store.initDiscovery(missionId)
                          // restore saved evidence from localStorage
                          const saved = JSON.parse(localStorage.getItem('carmen_investigation_progress') || '{}')
                          const restored = {}
                          if (saved.evidence?.length > 0) restored.evidence = saved.evidence
                          if (saved.cityEvidence?.length > 0) restored.cityEvidence = saved.cityEvidence
                          if (saved.walletFragments?.length > 0) {
                            restored.walletFragments = saved.walletFragments
                            restored.walletFragmentCount = saved.walletFragmentCount || saved.walletFragments.length
                            restored.walletCaptureAvailable = (restored.walletFragmentCount || 0) >= 3
                          }
                          if (saved.evidenceCount > 0) restored.evidenceCount = saved.evidenceCount
                          if (Object.keys(restored).length > 0) useGameStore.setState(restored)
                          // restore last visited city or fall back to home
                          const resumeCityId = saved.currentCityId || useGameStore.getState().discoveredCityIds?.[0] || 80002
                          const resumeLocIdx = saved.currentLocationIdx ?? 0
                          await store.selectCity(resumeCityId)
                          store.selectLocation(resumeLocIdx)
                          store.hydrateMissionPlot(missionId)
                          await store._setupEventListeners(missionId)
                        } catch (err) {
                          console.warn('[LoginPage] City setup failed:', err.message)
                        }
                        useGameStore.setState({
                          briefingDone: true,
                          showOutcomeModal: false,
                          missionOutcome: null,
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

                  <NeonButton variant="magenta" onClick={() => setShowLeaderboard(true)}>
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
