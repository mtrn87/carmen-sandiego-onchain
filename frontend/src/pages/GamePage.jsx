import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import TerminalSidebar from '../components/TerminalSidebar'
import InteractiveMap from '../components/InteractiveMap'
import ContractExplorer from '../components/ContractExplorer'
import CaptureMode from '../components/CaptureMode'
import MissionBriefing from '../components/MissionBriefing'
import MissionOutcome from '../components/MissionOutcome'
import MissionPlotModal from '../components/MissionPlotModal'
import ClueModal from '../components/ClueModal'
import LeaderboardModal from '../components/LeaderboardModal'

import { useWallets } from '@privy-io/react-auth'
import { useGameStore } from '../store/gameStore'
import { clearAuthSession } from '../utils/authPersistence'
import { initializeExternalProvider, getSigner, getCCIPStatus } from '../services/contractService'
import styles from './GamePage.module.css'

export default function GamePage() {
  const navigate = useNavigate()
  const { logout } = usePrivy()
  const {
    isConnected,
    briefingDone,
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
    disconnectWallet,
    playerNickname,
    walletAddress,
  } = useGameStore()
  const { wallets } = useWallets()
  const [showMap, setShowMap] = useState(false)
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

  // Fetch Chainlink CCIP cross-chain messaging status
  useEffect(() => {
    if (!isConnected) return
    getCCIPStatus().then(setCcipStatus).catch(() => setCcipStatus(null))
  }, [isConnected])

  if (!isConnected) return null

  const handleSelectCase = async (c) => {
    // CityNode cities: load city data and set location index
    const cityNodeChains = [421614, 84532, 51]
    if (c?.chainId && cityNodeChains.includes(c.chainId)) {
      const locIdx = c.locationIdx ?? 0
      if (!currentCityId || currentCityId !== c.chainId) {
        await selectCity(c.chainId)
        selectLocation(locIdx)
      } else {
        selectLocation(locIdx)
      }
    } else if (c?.id) {
      setCurrentCase(c.id)
    }
    setShowMap(false)
  }

  // determine what to show in the main area
  const renderMainContent = () => {
    if (showMap) {
      return (
        <>
          <InteractiveMap
            onSelectCase={handleSelectCase}
          />
          <button
            className={styles.backToExplorer}
            onClick={() => setShowMap(false)}
          >
            &#9664; BACK TO EXPLORER
          </button>
        </>
      )
    }

    return <ContractExplorer onOpenMap={() => setShowMap(true)} />
  }

  return (
    <div className={`${styles.layout} ${captureMode ? styles.layoutCapture : ''}`}>
      {/* CRT scanlines + rolling bar over entire page */}
      <div className={styles.crtScanlines} />
      <div className={styles.crtRollingBar} />
      <div className={styles.vignette} />

      {/* mission briefing overlay — shown before game loads */}
      {!briefingDone && <MissionBriefing />}

      {/* victory/defeat overlay — shown when mission ends */}
      {showOutcomeModal && <MissionOutcome />}

      {/* mission plot overlay — opened from terminal command */}
      {showPlotModal && <MissionPlotModal />}

      {/* city clue modal — shown after requesting a clue */}
      {showCityClueModal && <ClueModal />}

      {/* leaderboard modal — opened from terminal /leaderboard command */}
      {showLeaderboard && <LeaderboardModal onClose={closeLeaderboard} />}

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
        <button className={styles.logoutBtn} onClick={handleLogout}>
          LOGOUT
        </button>
      </div>

      {/* left sidebar — terminal (dimmed in capture mode) */}
      <aside className={`${styles.sidebar} ${captureMode ? styles.sidebarDimmed : ''}`}>
        <TerminalSidebar />
      </aside>

      {/* right area — explorer/map + capture bar */}
      <main className={styles.main}>
        <div className={styles.mapArea}>
          {renderMainContent()}
        </div>
        {captureMode && <CaptureMode />}
      </main>

    </div>
  )
}
