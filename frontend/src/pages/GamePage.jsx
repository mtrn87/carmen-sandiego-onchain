import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import TerminalSidebar from '../components/TerminalSidebar'

const InteractiveMap = lazy(() => import('../components/InteractiveMap'))
const ContractExplorer = lazy(() => import('../components/ContractExplorer'))
const CaptureMode = lazy(() => import('../components/CaptureMode'))
const MissionBriefing = lazy(() => import('../components/MissionBriefing'))
const MissionOutcome = lazy(() => import('../components/MissionOutcome'))
const MissionPlotModal = lazy(() => import('../components/MissionPlotModal'))
const ClueModal = lazy(() => import('../components/ClueModal'))
const LeaderboardModal = lazy(() => import('../components/LeaderboardModal'))

import { useWallets } from '@privy-io/react-auth'
import { useGameStore } from '../store/gameStore'
import { clearAuthSession } from '../utils/authPersistence'
import { initializeExternalProvider, getSigner, getCCIPStatus } from '../services/contractService'
import { CITY_POOL_MAP } from '../data/cityRegistry'
import styles from './GamePage.module.css'

export default function GamePage() {
  const navigate = useNavigate()
  const { logout } = usePrivy()
  const {
    isConnected,
    briefingDone,
    autoOpenHomeCity,
    showOutcomeModal,
    showPlotModal,
    showCityClueModal,
    showLeaderboard,
    closeLeaderboard,
    setCurrentCase,
    initGame,
    selectCity,
    selectLocation,
    currentCityId,
    captureMode,
    captureSelectedTx,
    disconnectWallet,
    playerNickname,
    walletAddress,
    backToCityPanel,
  } = useGameStore()
  const { wallets } = useWallets()
  const [showMap, setShowMap] = useState(true)
  const [ccipStatus, setCcipStatus] = useState(null)

  const handleLogout = useCallback(async () => {
    try {
      await logout()
      disconnectWallet()
      clearAuthSession()
      navigate('/')
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }, [logout, disconnectWallet, navigate])

  // Initialize Privy wallet provider (handles page refresh on /game)
  const { connectWallet } = useGameStore()
  useEffect(() => {
    if (!wallets.length) return
    const wallet = wallets[0]
    ;(async () => {
      try {
        await wallet.switchChain(11155111)
        const eip1193 = await wallet.getEthereumProvider()
        initializeExternalProvider(eip1193)
        // Ensure we use the actual signer address (may differ from Privy display)
        const signer = await getSigner()
        const signerAddr = await signer.getAddress()
        console.log('[GamePage] Privy EIP-1193 provider initialized on Sepolia')
        const stored = localStorage.getItem('wallet_address')
        if (stored && stored.toLowerCase() !== signerAddr.toLowerCase()) {
          console.warn('[GamePage] Updating wallet address to signer:', signerAddr)
          localStorage.setItem('wallet_address', signerAddr)
          connectWallet(signerAddr)
        }
      } catch (err) {
        console.warn('[GamePage] Could not get Privy provider:', err.message)
      }
    })()
  }, [wallets, connectWallet])

  // redirect to login if not connected
  useEffect(() => {
    if (!isConnected) {
      navigate('/')
    }
  }, [isConnected, navigate])

  // load on-chain state on mount (handles page refresh)
  useEffect(() => {
    if (isConnected) {
      initGame()
    }
  }, [isConnected, initGame])

  // open map automatically when briefing ends on a new mission
  useEffect(() => {
    if (briefingDone && autoOpenHomeCity) {
      setShowMap(true)
    }
  }, [briefingDone, autoOpenHomeCity])

  // Fetch Chainlink CCIP cross-chain messaging status
  useEffect(() => {
    if (!isConnected) return
    getCCIPStatus().then(setCcipStatus).catch(() => setCcipStatus(null))
  }, [isConnected])

  if (!isConnected) return null

  const handleSelectCase = async (c) => {
    // CityNode cities: load city data and set location index
    // Use unique cityId (from InteractiveMap) to identify the city
    const cityId = c?.cityId
    if (cityId && CITY_POOL_MAP[cityId]) {
      const locIdx = c.locationIdx ?? 0
      if (!currentCityId || currentCityId !== cityId) {
        selectCity(cityId).then(() => selectLocation(locIdx))
      } else {
        selectLocation(locIdx)
      }
    } else if (c?.id) {
      setCurrentCase(c.id)
    }
    setShowMap(false)
  }

  // back to city location panel (preserves city state, reopens map with panel)
  const handleBackToCityPanel = () => {
    backToCityPanel()
    useGameStore.setState({ autoOpenHomeCity: true })
    setShowMap(true)
  }

  // determine what to show in the main area
  const renderMainContent = () => {
    if (showMap) {
      return (
        <Suspense fallback={null}>
          <InteractiveMap
            onSelectCase={handleSelectCase}
          />
        </Suspense>
      )
    }

    return (
      <Suspense fallback={null}>
        <ContractExplorer
          onOpenMap={() => setShowMap(true)}
          onBackToCityPanel={handleBackToCityPanel}
        />
      </Suspense>
    )
  }

  return (
    <div className={`${styles.layout} ${captureMode ? styles.layoutCapture : ''}`}>
      {/* CRT scanlines + rolling bar over entire page */}
      <div className={styles.crtScanlines} />
      <div className={styles.crtRollingBar} />
      <div className={styles.vignette} />

      {/* mission briefing overlay — shown before game loads */}
      <Suspense fallback={null}>
        {!briefingDone && <MissionBriefing />}
      </Suspense>

      {/* victory/defeat overlay — only after briefing is done */}
      <Suspense fallback={null}>
        {briefingDone && showOutcomeModal && <MissionOutcome />}
      </Suspense>

      {/* mission plot overlay — opened from terminal command */}
      <Suspense fallback={null}>
        {showPlotModal && <MissionPlotModal />}
      </Suspense>

      {/* city clue modal — shown after requesting a clue */}
      <Suspense fallback={null}>
        {showCityClueModal && <ClueModal />}
      </Suspense>

      {/* leaderboard modal — opened from terminal /leaderboard command */}
      <Suspense fallback={null}>
        {showLeaderboard && <LeaderboardModal onClose={closeLeaderboard} />}
      </Suspense>

      {/* top bar — agent info + CCIP status + logout */}
      <div className={styles.topBar}>
        <span className={styles.agentInfo}>
          {playerNickname || (walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : '')}
        </span>
        {ccipStatus && (
          <span className={styles.ccipStatus} title={`CCIP: ${ccipStatus.destinationCount} chains, ${ccipStatus.totalMessages} messages sent`}>
            {ccipStatus.configured
              ? `Cross-chain sync: ACTIVE (${ccipStatus.destinationCount} chains)`
              : 'Cross-chain sync: STANDBY'}
          </span>
        )}
        <button
          className={styles.profileBtn}
          onClick={() => navigate(`/profile/${walletAddress}`)}
          disabled={!walletAddress}
        >
          DOSSIER
        </button>
        <button className={styles.logoutBtn} onClick={handleLogout}>
          LOGOUT
        </button>
      </div>

      {/* left sidebar — terminal (dimmed in capture mode) */}
      <aside className={`${styles.sidebar} ${captureMode && captureSelectedTx ? styles.sidebarDimmed : ''}`}>
        <TerminalSidebar />
      </aside>

      {/* right area — explorer/map */}
      <main className={styles.main}>
        <div className={styles.mapArea}>
          {renderMainContent()}
        </div>
      </main>

      {/* capture modal — opens when a tx is selected in capture mode */}
      <Suspense fallback={null}>
        {captureMode && captureSelectedTx && !showMap && <CaptureMode />}
      </Suspense>

    </div>
  )
}
