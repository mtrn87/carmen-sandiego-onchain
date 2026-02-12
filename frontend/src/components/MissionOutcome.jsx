import { useCallback, useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import styles from './MissionOutcome.module.css'

const REWARD_CONFIG = {
  GOLD: { icon: '\u{1F3C6}', sub: 'Solved in 20 blocks or fewer' },
  SILVER: { icon: '\u{1F948}', sub: 'Solved in 35 blocks or fewer' },
  BRONZE: { icon: '\u{1F949}', sub: 'Case closed within the limit' },
}

export default function MissionOutcome() {
  const {
    missionOutcome,
    missionId,
    startNewMission,
    closeOutcomeModal,
  } = useGameStore()

  const isVictory = missionOutcome?.type === 'captured'
  const variant = isVictory ? styles.terminalVictory : styles.terminalDefeat

  const handleNewMission = useCallback(() => {
    startNewMission()
  }, [startNewMission])

  // Enter key triggers new mission
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter') handleNewMission()
      if (e.key === 'Escape') closeOutcomeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleNewMission, closeOutcomeModal])

  const reward = REWARD_CONFIG[missionOutcome?.rewardLabel] || REWARD_CONFIG.BRONZE

  return (
    <div className={styles.overlay}>
      <div className={`${styles.terminal} ${variant}`}>
        {/* scanlines */}
        <div className={styles.scanlines} />

        {/* header */}
        <div className={styles.header}>
          <div className={styles.headerDots}>
            <span className={styles.dot} data-color="red" />
            <span className={styles.dot} data-color="yellow" />
            <span className={styles.dot} data-color="green" />
          </div>
          <span className={styles.headerTitle}>
            {isVictory
              ? 'acme_report.exe \u2014 MISSION COMPLETE'
              : 'acme_report.exe \u2014 MISSION FAILED'}
          </span>
          <span className={styles.headerBlink}>&#9679; END</span>
        </div>

        {/* body */}
        <div className={styles.body}>
          <div className={styles.banner}>
            {'\u2588'.repeat(48)}
          </div>

          <div className={styles.title}>
            {isVictory ? 'CARMEN SANDIEGO CAPTURED' : 'CARMEN SANDIEGO ESCAPED'}
          </div>

          <div className={styles.banner}>
            {'\u2588'.repeat(48)}
          </div>

          {isVictory ? (
            <>
              {/* stats */}
              <div className={styles.stats}>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>MISSION</span>
                  <span className={styles.statValue}>#{missionId}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>BLOCKS USED</span>
                  <span className={styles.statValue}>{missionOutcome.blocksUsed}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>REWARD</span>
                  <span className={styles.statValue}>{missionOutcome.reward} pts</span>
                </div>
              </div>

              {/* reward badge */}
              <div className={`${styles.rewardBadge} ${
                missionOutcome.rewardLabel === 'GOLD' ? styles.rewardGold
                  : missionOutcome.rewardLabel === 'SILVER' ? styles.rewardSilver
                    : styles.rewardBronze
              }`}>
                <span className={styles.rewardIcon}>{reward.icon}</span>
                <div className={styles.rewardInfo}>
                  <span className={styles.rewardTier}>{missionOutcome.rewardLabel} RATING</span>
                  <span className={styles.rewardSub}>{reward.sub}</span>
                </div>
              </div>

              {/* rank promotion */}
              <div className={styles.rankPromotion}>
                <span className={styles.rankLabel}>PROMOTED TO</span>
                <span className={styles.rankArrow}>&raquo;</span>
                <span className={styles.rankNew}>{missionOutcome.newRankTitle}</span>
              </div>

              {/* NFT */}
              <div className={styles.nftLine}>
                MissionNFT #{missionId} minted as trophy
              </div>
            </>
          ) : (
            <div className={styles.defeatMsg}>
              Carmen vanished before you could close in.<br />
              <strong>Too many blocks elapsed.</strong><br /><br />
              Every great detective learns from failure.<br />
              Regroup and try again &mdash; she can&apos;t hide forever.
            </div>
          )}
        </div>

        {/* action button */}
        <button className={styles.actionBtn} onClick={handleNewMission}>
          <span className={styles.btnFlicker}>
            {isVictory
              ? '> PRESS ENTER FOR NEW MISSION'
              : '> PRESS ENTER TO RETRY'}
          </span>
        </button>
      </div>
    </div>
  )
}
