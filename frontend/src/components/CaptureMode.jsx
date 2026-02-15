import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import styles from './CaptureMode.module.css'

export default function CaptureMode() {
  const {
    captureMode,
    captureState,
    captureResult,
    citySuspectWallets,
    toggleCaptureMode,
    gameplayRequestCapture,
    blocksElapsed,
  } = useGameStore()

  const [search, setSearch] = useState('')
  const [selectedWallet, setSelectedWallet] = useState(null)

  if (!captureMode) return null

  const filtered = search
    ? citySuspectWallets.filter((s) => s.wallet.toLowerCase().includes(search.toLowerCase()))
    : citySuspectWallets

  const handleCapture = () => {
    if (!selectedWallet) return
    gameplayRequestCapture(selectedWallet.wallet)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.scanlines} />

      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon}>&#9888;</span>
            <span className={styles.headerTitle}>CAPTURE MODE</span>
          </div>
          <button className={styles.exitBtn} onClick={toggleCaptureMode}>
            &#10005; EXIT
          </button>
        </div>

        {captureState === 'ready' && (
          <>
            {/* search */}
            <div className={styles.searchBar}>
              <span className={styles.searchPrefix}>0x</span>
              <input
                className={styles.searchInput}
                placeholder="Search suspect wallet..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* block cost info */}
            <div className={styles.confidenceBar}>
              <span className={styles.confidenceLabel}>BLOCKS ELAPSED</span>
              <span className={styles.confidenceValue}>{blocksElapsed}</span>
              <span className={styles.confWarn}>CAPTURE COSTS 3 BLOCKS</span>
            </div>

            {/* suspect list */}
            <div className={styles.suspectList}>
              {filtered.length === 0 ? (
                <div className={styles.empty}>
                  {citySuspectWallets.length === 0
                    ? 'No suspects identified. Investigate locations first.'
                    : 'No matches found.'}
                </div>
              ) : (
                filtered.map((s, i) => (
                  <div
                    key={i}
                    className={`${styles.suspectCard} ${selectedWallet?.wallet === s.wallet ? styles.suspectSelected : ''}`}
                    onClick={() => setSelectedWallet(selectedWallet?.wallet === s.wallet ? null : s)}
                  >
                    <div className={styles.suspectMain}>
                      <span className={styles.suspectAddr}>{`${s.wallet.slice(0, 8)}...${s.wallet.slice(-4)}`}</span>
                      <span className={`${styles.suspectLevel} ${s.suspicionLevel >= 70 ? styles.levelHigh : s.suspicionLevel >= 40 ? styles.levelMed : styles.levelLow}`}>
                        {s.suspicionLevel}%
                      </span>
                    </div>
                    <div className={styles.suspectSub}>
                      <span>{s.txRefIds.length} tx refs</span>
                      <div className={styles.suspectTags}>
                        {s.tags.map((t) => (
                          <span key={t} className={styles.tag}>{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* capture button */}
            {selectedWallet && (
              <div className={styles.captureBar}>
                <div className={styles.captureTarget}>
                  <span className={styles.captureTargetLabel}>TARGET</span>
                  <span className={styles.captureTargetAddr}>{`${selectedWallet.wallet.slice(0, 10)}...${selectedWallet.wallet.slice(-6)}`}</span>
                </div>
                <button
                  className={styles.captureBtn}
                  onClick={handleCapture}
                  disabled={false}
                >
                  ATTEMPT CAPTURE (3 BLOCKS)
                </button>
              </div>
            )}
          </>
        )}

        {captureState === 'pending' && (
          <div className={styles.pendingState}>
            <div className={styles.spinner} />
            <span className={styles.pendingText}>SUBMITTING EVIDENCE BUNDLE...</span>
            <span className={styles.pendingSub}>Awaiting GameMaster resolution</span>
          </div>
        )}

        {captureState === 'success' && captureResult && (
          <div className={styles.resultState}>
            <div className={styles.successBanner}>
              <span className={styles.successIcon}>&#9733;</span>
              <span className={styles.successTitle}>CARMEN CAPTURED!</span>
            </div>
            <p className={styles.resultNote}>{captureResult.gmNote}</p>
            <button className={styles.resultBtn} onClick={toggleCaptureMode}>
              CLOSE
            </button>
          </div>
        )}

        {captureState === 'fail' && captureResult && (
          <div className={styles.resultState}>
            <div className={styles.failBanner}>
              <span className={styles.failIcon}>&#10005;</span>
              <span className={styles.failTitle}>CAPTURE FAILED</span>
            </div>
            <div className={styles.failReason}>
              <span className={styles.failReasonLabel}>REASON</span>
              <span className={styles.failReasonCode}>{captureResult.reasonCode}</span>
            </div>
            <p className={styles.resultNote}>{captureResult.gmNote}</p>
            <button className={styles.resultBtn} onClick={() => {
              useGameStore.setState({ captureState: 'ready', captureResult: null })
            }}>
              TRY AGAIN
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
