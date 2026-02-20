import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TerminalSidebar from '../components/TerminalSidebar'
import InteractiveMap from '../components/InteractiveMap'
import ContractExplorer from '../components/ContractExplorer'
import CaptureMode from '../components/CaptureMode'
import MissionBriefing from '../components/MissionBriefing'
import MissionOutcome from '../components/MissionOutcome'
import MissionPlotModal from '../components/MissionPlotModal'
import ClueModal from '../components/ClueModal'

import { useGameStore } from '../store/gameStore'
import { CITY_POOL_MAP } from '../data/cityRegistry'
import styles from './GamePage.module.css'

export default function GamePage() {
  const navigate = useNavigate()
  const {
    isConnected,
    briefingDone,
    showOutcomeModal,
    showPlotModal,
    showCityClueModal,
    setCurrentCase,
    initGame,
    selectCity,
    selectLocation,
    currentCityId,
    captureMode,
  } = useGameStore()
  const [showMap, setShowMap] = useState(false)

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
