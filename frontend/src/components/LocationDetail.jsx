import { useGameStore } from '../store/gameStore'
import styles from './LocationDetail.module.css'

const CLUE_TYPE_ICONS = {
  BEHAVIOR_FINGERPRINT: '\u{1F9EC}',
  RELATIONSHIP: '\u{1F517}',
  IDENTITY_COMMIT: '\u{1F464}',
  FUNDING_TRAIL: '\u{1F4B0}',
  TECHNICAL_SIGNATURE: '\u{1F527}',
  DEAD_END: '\u{26D4}',
}

export default function LocationDetail() {
  const {
    cityLocations,
    currentLocationIdx,
    currentCityId,
    clearLocation,
    gameplayInspectLocation,
    gameplayScanAnomalies,
    gameplayRequestClue,
    gameplayLoading,
    cityClue,
    isInvestigating,
  } = useGameStore()

  if (currentLocationIdx === null || !cityLocations[currentLocationIdx]) return null
  const loc = cityLocations[currentLocationIdx]

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={clearLocation}>&#9664; BACK</button>
        <div className={styles.headerInfo}>
          <span className={styles.category}>{loc.categoryLabel}</span>
          <h3 className={styles.name}>{loc.name}</h3>
        </div>
        <div className={styles.risk}>
          <span className={styles.riskLabel}>RISK</span>
          <span className={`${styles.riskValue} ${loc.riskLevel >= 4 ? styles.riskHigh : loc.riskLevel >= 3 ? styles.riskMed : styles.riskLow}`}>
            {loc.riskLevel}/5
          </span>
        </div>
      </div>

      <p className={styles.description}>{loc.description}</p>

      {/* progress indicator */}
      <div className={styles.progress}>
        <div className={`${styles.step} ${loc.inspected ? styles.stepDone : ''}`}>
          <span className={styles.stepDot} />
          <span>INSPECTED</span>
        </div>
        <div className={styles.stepLine} />
        <div className={`${styles.step} ${loc.scanned ? styles.stepDone : ''}`}>
          <span className={styles.stepDot} />
          <span>SCANNED</span>
        </div>
        <div className={styles.stepLine} />
        <div className={`${styles.step} ${loc.clueSlots?.some(Boolean) ? styles.stepDone : ''}`}>
          <span className={styles.stepDot} />
          <span>CLUES</span>
        </div>
      </div>

      {/* city clue */}
      {cityClue && cityClue[currentCityId] && (
        <div className={styles.clueSlots}>
          <span className={styles.slotsLabel}>CITY INTEL</span>
          <div className={styles.slots}>
            <div className={`${styles.slot} ${styles.slotFilled}`}>
              <span className={styles.slotIcon}>🔍</span>
              <span className={styles.slotType}>{cityClue[currentCityId].type?.toUpperCase() || 'TEXT'}</span>
              <span className={styles.slotStrength}>{cityClue[currentCityId].text?.slice(0, 60)}...</span>
            </div>
          </div>
        </div>
      )}

      {/* action buttons */}
      <div className={styles.actions}>
        <button
          className={`${styles.actionBtn} ${loc.inspected ? styles.actionDone : ''}`}
          disabled={loc.inspected || gameplayLoading}
          onClick={() => gameplayInspectLocation(currentLocationIdx)}
        >
          {loc.inspected ? 'INSPECTED' : 'INSPECT (1 E)'}
        </button>
        <button
          className={`${styles.actionBtn} ${loc.scanned ? styles.actionDone : ''}`}
          disabled={!loc.inspected || loc.scanned || gameplayLoading}
          onClick={() => gameplayScanAnomalies(currentLocationIdx)}
        >
          {loc.scanned ? 'SCANNED' : 'SCAN (3 E)'}
        </button>
        {(() => {
          const hasCityClue = cityClue && cityClue[currentCityId]
          return (
            <button
              className={`${styles.actionBtn} ${styles.clueBtn} ${hasCityClue ? styles.actionDone : ''}`}
              disabled={!loc.scanned || isInvestigating || hasCityClue}
              onClick={() => gameplayRequestClue(currentLocationIdx)}
            >
              {isInvestigating
                ? '⏳ INVESTIGATING...'
                : hasCityClue
                ? 'INTEL RECEIVED ✓'
                : 'INVESTIGATE CITY (5 E)'}
            </button>
          )
        })()}
      </div>
    </div>
  )
}
