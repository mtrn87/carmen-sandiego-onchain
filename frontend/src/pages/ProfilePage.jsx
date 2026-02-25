import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import {
  getPlayerGlobalProgress,
  getMissionNFTBalance,
  getPlayerMissionTrophies,
  CITY_MAP,
  MISSION_NFT_ADDRESS,
} from '../services/contractService'
import styles from './ProfilePage.module.css'

const REWARD_TIERS = {
  GOLD: { label: 'GOLD', icon: '🏆', maxBlocks: 20 },
  SILVER: { label: 'SILVER', icon: '🥈', maxBlocks: 35 },
  BRONZE: { label: 'BRONZE', icon: '🥉', maxBlocks: 50 },
}

function getMedalTier(blocksUsed) {
  if (blocksUsed <= REWARD_TIERS.GOLD.maxBlocks) return 'GOLD'
  if (blocksUsed <= REWARD_TIERS.SILVER.maxBlocks) return 'SILVER'
  if (blocksUsed <= REWARD_TIERS.BRONZE.maxBlocks) return 'BRONZE'
  return null
}

export default function ProfilePage() {
  const { address } = useParams()
  const navigate = useNavigate()
  const { walletAddress, isConnected } = useGameStore()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(null)
  const [trophies, setTrophies] = useState([])
  const [stats, setStats] = useState(null)

  const targetAddress = address || walletAddress

  useEffect(() => {
    if (!targetAddress) return

    const fetchProfile = async () => {
      setLoading(true)
      setError(null)
      try {
        const [progressData, playerTrophies] = await Promise.all([
          getPlayerGlobalProgress(targetAddress),
          getPlayerMissionTrophies(targetAddress),
        ])

        setProgress(progressData)
        setTrophies(playerTrophies)

        // Compute stats from trophies
        const missionsCompleted = playerTrophies.length
        let gold = 0, silver = 0, bronze = 0, totalBlocks = 0
        for (const t of playerTrophies) {
          const tier = getMedalTier(t.record.blocksUsed)
          if (tier === 'GOLD') gold++
          else if (tier === 'SILVER') silver++
          else if (tier === 'BRONZE') bronze++
          totalBlocks += t.record.blocksUsed
        }

        setStats({
          missionsCompleted,
          gold,
          silver,
          bronze,
          totalBlocks,
          avgBlocks: missionsCompleted > 0 ? Math.round(totalBlocks / missionsCompleted) : 0,
        })
      } catch (err) {
        console.error('Failed to load profile:', err)
        setError('Failed to load profile data from chain.')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [targetAddress])

  if (!targetAddress) {
    return (
      <div className={styles.page}>
        <div className={styles.terminal}>
          <div className={styles.header}>
            <span className={styles.headerTitle}>// PROFILE_ERROR</span>
          </div>
          <div className={styles.body}>
            <p className={styles.emptyText}>No wallet address provided.</p>
            <button className={styles.backBtn} onClick={() => navigate('/game')}>
              &#9664; BACK TO HQ
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.scanlines} />

      <div className={styles.terminal}>
        {/* header */}
        <div className={styles.header}>
          <div className={styles.headerDots}>
            <span className={styles.dot} data-color="red" />
            <span className={styles.dot} data-color="yellow" />
            <span className={styles.dot} data-color="green" />
          </div>
          <span className={styles.headerTitle}>
            // AGENT_DOSSIER — {targetAddress.slice(0, 6)}...{targetAddress.slice(-4)}
          </span>
          <span className={styles.blink}>●</span>
        </div>

        <div className={styles.body}>
          {loading && (
            <div className={styles.loading}>
              <span className={styles.loadingText}>ACCESSING INTERPOL DATABASE</span>
              <span className={styles.loadingDots}>...</span>
            </div>
          )}

          {error && <p className={styles.errorText}>{error}</p>}

          {!loading && !error && stats && (
            <>
              {/* ── Stats Grid ── */}
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>&#9656; MISSION STATISTICS</h2>
                <div className={styles.statsGrid}>
                  <div className={styles.statCard}>
                    <span className={styles.statValue}>{stats.missionsCompleted}</span>
                    <span className={styles.statLabel}>MISSIONS</span>
                  </div>
                  <div className={`${styles.statCard} ${styles.statGold}`}>
                    <span className={styles.statValue}>{REWARD_TIERS.GOLD.icon} {stats.gold}</span>
                    <span className={styles.statLabel}>GOLD</span>
                  </div>
                  <div className={`${styles.statCard} ${styles.statSilver}`}>
                    <span className={styles.statValue}>{REWARD_TIERS.SILVER.icon} {stats.silver}</span>
                    <span className={styles.statLabel}>SILVER</span>
                  </div>
                  <div className={`${styles.statCard} ${styles.statBronze}`}>
                    <span className={styles.statValue}>{REWARD_TIERS.BRONZE.icon} {stats.bronze}</span>
                    <span className={styles.statLabel}>BRONZE</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statValue}>{stats.totalBlocks}</span>
                    <span className={styles.statLabel}>TOTAL BLOCKS</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statValue}>{stats.avgBlocks}</span>
                    <span className={styles.statLabel}>AVG BLOCKS</span>
                  </div>
                </div>
              </div>

              {/* ── Progress Bars ── */}
              {progress && (
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>&#9656; GLOBAL PROGRESS</h2>
                  <div className={styles.progressGroup}>
                    <div className={styles.progressItem}>
                      <div className={styles.progressHeader}>
                        <span className={styles.progressLabel}>CITIES VISITED</span>
                        <span className={styles.progressValue}>
                          {progress.citiesVisited} / {Object.keys(CITY_MAP).length}
                        </span>
                      </div>
                      <div className={styles.progressTrack}>
                        <div
                          className={styles.progressFill}
                          style={{
                            width: `${Math.min(100, (progress.citiesVisited / Object.keys(CITY_MAP).length) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className={styles.progressItem}>
                      <div className={styles.progressHeader}>
                        <span className={styles.progressLabel}>IDENTITY COMMITS</span>
                        <span className={styles.progressValue}>{progress.identityCommitsCount}</span>
                      </div>
                      <div className={styles.progressTrack}>
                        <div
                          className={styles.progressFill}
                          data-variant="cyan"
                          style={{
                            width: `${Math.min(100, progress.identityCommitsCount * 10)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className={styles.progressItem}>
                      <div className={styles.progressHeader}>
                        <span className={styles.progressLabel}>TOTAL CLUES</span>
                        <span className={styles.progressValue}>{progress.totalClues}</span>
                      </div>
                      <div className={styles.progressTrack}>
                        <div
                          className={styles.progressFill}
                          data-variant="magenta"
                          style={{
                            width: `${Math.min(100, progress.totalClues * 10)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Mission History ── */}
              {trophies.length > 0 && (
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>&#9656; MISSION HISTORY</h2>
                  <div className={styles.missionList}>
                    {trophies.map((t) => {
                      const tier = getMedalTier(t.record.blocksUsed)
                      const tierInfo = tier ? REWARD_TIERS[tier] : null
                      const cityName = CITY_MAP[t.record.capturedChainId]?.name || `Chain ${t.record.capturedChainId}`
                      const date = new Date(t.record.timestamp * 1000)
                      return (
                        <div key={t.tokenId} className={styles.missionRow}>
                          <span className={styles.missionId}>#{t.record.missionId}</span>
                          <span className={styles.missionCity}>{cityName}</span>
                          <span className={styles.missionBlocks}>{t.record.blocksUsed} blocks</span>
                          <span className={styles.missionClues}>{t.record.cluesCollected} clues</span>
                          <span className={`${styles.missionMedal} ${tier ? styles[`medal${tier}`] : ''}`}>
                            {tierInfo ? `${tierInfo.icon} ${tierInfo.label}` : '—'}
                          </span>
                          <span className={styles.missionDate}>
                            {date.toLocaleDateString()}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── NFT Gallery ── */}
              {trophies.length > 0 && (
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>&#9656; NFT TROPHY GALLERY</h2>
                  <div className={styles.nftGrid}>
                    {trophies.map((t) => {
                      const tier = getMedalTier(t.record.blocksUsed)
                      return (
                        <div
                          key={t.tokenId}
                          className={`${styles.nftCard} ${tier ? styles[`nft${tier}`] : ''}`}
                        >
                          <div className={styles.nftTokenId}>#{t.tokenId}</div>
                          <div className={styles.nftIcon}>
                            {tier ? REWARD_TIERS[tier].icon : '🎖️'}
                          </div>
                          <div className={styles.nftMission}>
                            Mission #{t.record.missionId}
                          </div>
                          <div className={styles.nftBlocks}>
                            {t.record.blocksUsed} blocks
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {trophies.length === 0 && stats.missionsCompleted === 0 && (
                <div className={styles.emptyState}>
                  <p className={styles.emptyText}>NO COMPLETED MISSIONS FOUND</p>
                  <p className={styles.emptySubtext}>
                    Start a mission to build your agent dossier.
                  </p>
                </div>
              )}
            </>
          )}

          {/* back button */}
          <button className={styles.backBtn} onClick={() => navigate('/game')}>
            &#9664; BACK TO HQ
          </button>
        </div>
      </div>
    </div>
  )
}
