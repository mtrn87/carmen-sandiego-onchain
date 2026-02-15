import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import styles from './ClueModal.module.css'

const CLUE_TYPE_COLORS = {
  BEHAVIOR_FINGERPRINT: '#00e5ff',
  RELATIONSHIP: '#ba68c8',
  IDENTITY_COMMIT: '#ffd740',
  FUNDING_TRAIL: '#69f0ae',
  TECHNICAL_SIGNATURE: '#ff8a65',
  DEAD_END: '#ff5252',
}

export default function ClueModal() {
  const {
    showCityClueModal,
    activeCityClue,
    closeCityClueModal,
    cityLocations,
  } = useGameStore()

  useEffect(() => {
    if (!showCityClueModal) return
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') closeCityClueModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showCityClueModal, closeCityClueModal])

  if (!showCityClueModal || !activeCityClue) return null

  const clue = activeCityClue
  const location = cityLocations[clue.locationIdx]
  const locationName = location?.name || `Location ${clue.locationIdx}`
  const typeColor = CLUE_TYPE_COLORS[clue.clueType] || '#00e5ff'
  const strengthPct = Math.min(100, Math.max(0, clue.strength || 0))
  const refShort = clue.anomalyRefId
    ? `${clue.anomalyRefId.slice(0, 10)}...`
    : '????'

  return (
    <div className={styles.overlay} onClick={closeCityClueModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.scanlines} />

        {/* header */}
        <div className={styles.header}>
          <div className={styles.headerDots}>
            <span className={styles.dot} data-color="red" />
            <span className={styles.dot} data-color="yellow" />
            <span className={styles.dot} data-color="green" />
          </div>
          <span className={styles.headerTitle}>acme_clue_interceptor.exe</span>
          <span className={styles.headerBlink}>&#9679; LIVE</span>
        </div>

        {/* body */}
        <div className={styles.body}>
          {/* clue type tag + hit/dead-end indicator */}
          <div className={styles.tagRow}>
            <span
              className={styles.clueTypeTag}
              style={{ borderColor: typeColor, color: typeColor }}
            >
              {clue.clueType}
            </span>
            <span
              className={clue.isDeadEnd ? styles.deadEndBadge : styles.hitBadge}
            >
              {clue.isDeadEnd ? 'DEAD END' : 'HIT'}
            </span>
          </div>

          {/* source location */}
          <div className={styles.sourceRow}>
            <span className={styles.sourceLabel}>SOURCE:</span>
            <span className={styles.sourceValue}>{locationName}</span>
          </div>

          {/* clue text */}
          <div
            className={
              clue.isDeadEnd ? styles.clueTextDeadEnd : styles.clueText
            }
          >
            {clue.data}
          </div>

          {/* strength bar */}
          <div className={styles.strengthSection}>
            <div className={styles.strengthLabel}>
              <span>SIGNAL STRENGTH</span>
              <span>{strengthPct}/100</span>
            </div>
            <div className={styles.strengthTrack}>
              <div
                className={styles.strengthFill}
                style={{
                  width: `${strengthPct}%`,
                  background:
                    strengthPct >= 75
                      ? '#69f0ae'
                      : strengthPct >= 50
                        ? '#ffd740'
                        : '#ff5252',
                }}
              />
            </div>
          </div>

          {/* anomaly ref */}
          <div className={styles.refId}>anomaly ref: {refShort}</div>
        </div>

        {/* footer */}
        <button className={styles.closeBtn} onClick={closeCityClueModal}>
          <span className={styles.btnFlicker}>&gt; ACKNOWLEDGE</span>
        </button>
      </div>
    </div>
  )
}
