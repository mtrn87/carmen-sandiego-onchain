import { useState, useEffect } from 'react'
import { fetchLeaderboardData } from '../services/leaderboardService'
import NeonButton from './NeonButton'
import styles from './LeaderboardModal.module.css'

const SORT_OPTIONS = [
  { key: 'totalReward', label: 'REWARDS' },
  { key: 'missionsCompleted', label: 'MISSIONS' },
  { key: 'avgBlocks', label: 'AVG BLOCKS', ascending: true },
  { key: 'bestBlocks', label: 'BEST TIME', ascending: true },
]

export default function LeaderboardModal({ onClose }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('totalReward')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchLeaderboardData()
      .then((data) => {
        if (!cancelled) {
          setEntries(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [])

  const sortOption = SORT_OPTIONS.find((o) => o.key === sortKey)
  const sorted = [...entries].sort((a, b) => {
    const aVal = a[sortKey] ?? Infinity
    const bVal = b[sortKey] ?? Infinity
    return sortOption?.ascending ? aVal - bVal : bVal - aVal
  })

  function getRewardTier(reward) {
    if (reward >= 100) return 'gold'
    if (reward >= 75) return 'silver'
    if (reward >= 50) return 'bronze'
    return 'none'
  }

  function getRankDisplay(index) {
    if (index === 0) return '01'
    if (index === 1) return '02'
    if (index === 2) return '03'
    return String(index + 1).padStart(2, '0')
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon}>[</span>
            <span className={styles.headerTitle}>LEADERBOARD</span>
            <span className={styles.headerIcon}>]</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>X</button>
        </div>

        {/* sort tabs */}
        <div className={styles.sortTabs}>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={`${styles.sortTab} ${sortKey === opt.key ? styles.sortTabActive : ''}`}
              onClick={() => setSortKey(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* content */}
        <div className={styles.content}>
          {loading && (
            <div className={styles.loadingState}>
              <span className={styles.loadingDot} />
              <span className={styles.loadingText}>QUERYING BLOCKCHAIN...</span>
            </div>
          )}

          {error && (
            <div className={styles.errorState}>
              <span className={styles.errorText}>ERROR: {error}</span>
            </div>
          )}

          {!loading && !error && sorted.length === 0 && (
            <div className={styles.emptyState}>
              <span className={styles.emptyText}>NO AGENTS RANKED YET</span>
              <span className={styles.emptySubtext}>Complete missions to appear on the leaderboard</span>
            </div>
          )}

          {!loading && !error && sorted.length > 0 && (
            <>
              {/* table header */}
              <div className={styles.tableHeader}>
                <span className={styles.colRank}>#</span>
                <span className={styles.colAgent}>AGENT</span>
                <span className={styles.colStat}>RANK</span>
                <span className={styles.colStat}>MISSIONS</span>
                <span className={styles.colStat}>REWARDS</span>
                <span className={styles.colStat}>AVG BLK</span>
                <span className={styles.colStat}>BEST</span>
              </div>

              {/* rows */}
              <div className={styles.tableBody}>
                {sorted.map((entry, idx) => (
                  <div
                    key={entry.address}
                    className={`${styles.row} ${idx < 3 ? styles[`top${idx + 1}`] : ''}`}
                  >
                    <span className={`${styles.colRank} ${styles.rankNum}`}>
                      {getRankDisplay(idx)}
                    </span>
                    <span className={styles.colAgent}>
                      <span className={styles.agentName}>{entry.nickname}</span>
                      <span className={styles.agentAddr}>{entry.address.slice(0, 10)}...</span>
                    </span>
                    <span className={styles.colStat}>{entry.rankLabel || '-'}</span>
                    <span className={styles.colStat}>{entry.missionsCompleted}</span>
                    <span className={`${styles.colStat} ${styles[getRewardTier(entry.totalReward)]}`}>
                      {entry.totalReward}
                    </span>
                    <span className={styles.colStat}>{entry.avgBlocks || '-'}</span>
                    <span className={styles.colStat}>{entry.bestBlocks ?? '-'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* footer */}
        <div className={styles.footer}>
          <span className={styles.footerText}>
            {sorted.length} AGENTS RANKED
          </span>
          <NeonButton variant="cyan" onClick={onClose}>
            CLOSE
          </NeonButton>
        </div>
      </div>
    </div>
  )
}
