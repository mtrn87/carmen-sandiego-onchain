import { useGameStore } from '../store/gameStore'
import styles from './EvidencePanel.module.css'

const RARITY_COLORS = {
  common: 'var(--text-muted)',
  rare: 'var(--cyan)',
  epic: 'var(--magenta)',
  legendary: 'var(--yellow)',
}

const ICON_MAP = {
  receipt: '\u{1F4C4}',
  audio: '\u{1F50A}',
  hot: '\u{1F525}',
  cold: '\u{2744}\uFE0F',
  key: '\u{1F511}',
}

export default function EvidencePanel() {
  const { evidence, clues } = useGameStore()

  return (
    <div className={styles.panel}>
      {/* header */}
      <div className={styles.header}>
        <div className={styles.headerTab}>
          <span className={styles.tabIcon}>&#128188;</span>
          <span>EVIDENCE INVENTORY</span>
        </div>
        <div className={styles.headerStats}>
          <span className={styles.stat}>
            <span className={styles.statNum}>{evidence.length}</span> ITEMS
          </span>
          <span className={styles.statDivider}>|</span>
          <span className={styles.stat}>
            <span className={styles.statNum}>{clues.length}</span> CLUES
          </span>
        </div>
      </div>

      {/* evidence items */}
      <div className={styles.items}>
        {evidence.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>&#128269;</span>
            <span>No evidence collected yet. Investigate locations to gather intel.</span>
          </div>
        ) : (
          evidence.map((item) => (
            <div
              key={item.id}
              className={styles.card}
              style={{ '--rarity': RARITY_COLORS[item.rarity] || RARITY_COLORS.common }}
            >
              <div className={styles.cardIcon}>
                {ICON_MAP[item.icon] || '\u{1F4CE}'}
              </div>
              <div className={styles.cardContent}>
                <div className={styles.cardTop}>
                  <span className={styles.cardName}>{item.name}</span>
                  <span
                    className={styles.cardRarity}
                    style={{ color: RARITY_COLORS[item.rarity] }}
                  >
                    {item.rarity.toUpperCase()}
                  </span>
                </div>
                <span className={styles.cardDesc}>{item.description}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
