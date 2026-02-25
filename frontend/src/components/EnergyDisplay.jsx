import { useState, useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import styles from './EnergyDisplay.module.css'

export default function EnergyDisplay() {
  const { energy, energyNextRegen } = useGameStore()
  const [regenCountdown, setRegenCountdown] = useState(null)

  useEffect(() => {
    if (!energyNextRegen || energy.current >= energy.max) {
      setRegenCountdown(null)
      return
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((energyNextRegen - Date.now()) / 1000))
      if (remaining <= 0) {
        setRegenCountdown(null)
      } else {
        const min = Math.floor(remaining / 60)
        const sec = remaining % 60
        setRegenCountdown(`${min}:${String(sec).padStart(2, '0')}`)
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [energyNextRegen, energy, energy.max])

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
      {regenCountdown && (
        <span className={styles.timer}>{regenCountdown}</span>
      )}
    </div>
  )
}
