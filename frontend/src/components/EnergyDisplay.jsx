import { useGameStore } from '../store/gameStore'
import styles from './EnergyDisplay.module.css'

export default function EnergyDisplay() {
  const { energy } = useGameStore()
  const pct = energy.max > 0 ? (energy.current / energy.max) * 100 : 0
  const isLow = energy.current <= 3
  const isCritical = energy.current <= 1

  return (
    <div className={`${styles.container} ${isCritical ? styles.critical : isLow ? styles.low : ''}`}>
      <span className={styles.label}>ENERGY</span>
      <div className={styles.barOuter}>
        <div
          className={styles.barInner}
          style={{ width: `${pct}%` }}
        />
        {Array.from({ length: energy.max }).map((_, i) => (
          <div
            key={i}
            className={styles.pip}
            style={{ left: `${((i + 1) / energy.max) * 100}%` }}
          />
        ))}
      </div>
      <span className={styles.value}>
        {energy.current}<span className={styles.sep}>/</span>{energy.max}
      </span>
    </div>
  )
}
