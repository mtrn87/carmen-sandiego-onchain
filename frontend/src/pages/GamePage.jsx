import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TerminalSidebar from '../components/TerminalSidebar'
import InteractiveMap from '../components/InteractiveMap'
import ContractExplorer from '../components/ContractExplorer'
import MissionBriefing from '../components/MissionBriefing'
import MissionOutcome from '../components/MissionOutcome'
import { useGameStore } from '../store/gameStore'
import styles from './GamePage.module.css'

export default function GamePage() {
  const navigate = useNavigate()
  const { isConnected, briefingDone, showOutcomeModal, setCurrentCase, initGame } = useGameStore()
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

  return (
    <div className={styles.layout}>
      {/* CRT scanlines + rolling bar over entire page */}
      <div className={styles.crtScanlines} />
      <div className={styles.crtRollingBar} />
      <div className={styles.vignette} />

      {/* mission briefing overlay — shown before game loads */}
      {!briefingDone && <MissionBriefing />}

      {/* victory/defeat overlay — shown when mission ends */}
      {showOutcomeModal && <MissionOutcome />}

      {/* left sidebar — terminal (empty until briefing done) */}
      <aside className={styles.sidebar}>
        <TerminalSidebar />
      </aside>

      {/* right area — explorer/map + evidence */}
      <main className={styles.main}>
        <div className={styles.mapArea}>
          {showMap ? (
            <>
              <InteractiveMap onSelectCase={(c) => {
                if (c?.id) setCurrentCase(c.id)
                setShowMap(false)
              }} />
              <button
                className={styles.backToExplorer}
                onClick={() => setShowMap(false)}
              >
                &#9664; BACK TO EXPLORER
              </button>
            </>
          ) : (
            <ContractExplorer onOpenMap={() => setShowMap(true)} />
          )}
        </div>
      </main>
    </div>
  )
}
