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
    clearLocation,
    gameplayInspectLocation,
    gameplayScanAnomalies,
    gameplayRequestClue,
    gameplayLoading,
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

      {/* clue slots */}
      <div className={styles.clueSlots}>
        <span className={styles.slotsLabel}>CLUE SLOTS</span>
        <div className={styles.slots}>
          {loc.clueSlots.map((clue, i) => (
            <div key={i} className={`${styles.slot} ${clue ? styles.slotFilled : ''} ${clue?.isDeadEnd ? styles.slotDeadEnd : ''}`}>
              {clue ? (
                <>
                  <span className={styles.slotIcon}>{CLUE_TYPE_ICONS[clue.clueType] || '\u{1F50D}'}</span>
                  <span className={styles.slotType}>{clue.clueType}</span>
                  <span className={styles.slotStrength}>STR: {clue.strength}</span>
                </>
              ) : (
                <>
                  <span className={styles.slotEmpty}>#{i + 1}</span>
                  <span className={styles.slotEmptyLabel}>EMPTY</span>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

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
        {[0, 1, 2].map((ci) => (
          <button
            key={ci}
            className={`${styles.actionBtn} ${styles.clueBtn} ${loc.clueSlots[ci] ? styles.actionDone : ''}`}
            disabled={!loc.scanned || loc.clueSlots[ci] !== null || gameplayLoading}
            onClick={() => gameplayRequestClue(currentLocationIdx, ci)}
          >
            {loc.clueSlots[ci]
              ? `CLUE #${ci + 1} \u2713`
              : `REQ CLUE #${ci + 1} (5 E)`}
          </button>
        ))}
      </div>
    </div>
  )
}
