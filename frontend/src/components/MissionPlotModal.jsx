import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import styles from './MissionPlotModal.module.css'

export default function MissionPlotModal() {
  const {
    missionId,
    currentPlot,
    lastKnownLocation,
    closeMissionPlotModal,
  } = useGameStore()

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') closeMissionPlotModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeMissionPlotModal])

  if (!currentPlot) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.scanlines} />

        <div className={styles.header}>
          <div className={styles.headerDots}>
            <span className={styles.dot} data-color="red" />
            <span className={styles.dot} data-color="yellow" />
            <span className={styles.dot} data-color="green" />
          </div>
          <span className={styles.headerTitle}>acme_mission_briefing.exe</span>
          <span className={styles.headerBlink}>&#9679; LIVE</span>
        </div>

        <div className={styles.body}>
          <div className={styles.banner}>{'█'.repeat(48)}</div>
          <div className={styles.title}>MISSION #{missionId} :: {currentPlot.title}</div>
          <div className={styles.banner}>{'█'.repeat(48)}</div>

          <div className={styles.sectionLabel}>PLOT</div>
          <p className={styles.briefingText}>{currentPlot.briefing}</p>

          <div className={styles.sectionLabel}>LAST KNOWN LOCATION</div>
          <div className={styles.lastLocationBox}>
            {lastKnownLocation
              ? `${lastKnownLocation.name} (${lastKnownLocation.chain})`
              : 'No location investigated yet.'}
          </div>
        </div>

        <button className={styles.closeBtn} onClick={closeMissionPlotModal}>
          <span className={styles.btnFlicker}>&gt; PRESS ENTER / ESC TO CLOSE</span>
        </button>
      </div>
    </div>
  )
}
