import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import styles from './WalletEvidence.module.css'

/**
 * WalletEvidence — displays collected wallet fragments as a 40-cell hex grid.
 * Revealed chars are shown in cyan at their correct positions.
 * When 3+ fragments are collected, player can input the full wallet and submit.
 */
export default function WalletEvidence() {
  const {
    walletFragments,
    walletFragmentCount,
    walletCaptureAvailable,
    submitWalletCapture,
    captureState,
  } = useGameStore()

  const [walletInput, setWalletInput] = useState('')

  // Build revealed map: position => char
  const revealedMap = {}
  for (const frag of walletFragments) {
    for (let i = 0; i < frag.length && i < frag.chars.length; i++) {
      revealedMap[frag.startIndex + i] = frag.chars[i]
    }
  }

  const revealedCount = Object.keys(revealedMap).length

  const handleBuildCase = () => {
    let addr = walletInput.trim()
    if (!addr.startsWith('0x')) addr = '0x' + addr
    if (addr.length !== 42) return
    submitWalletCapture(addr)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>WALLET EVIDENCE</span>
        <span className={`${styles.fragmentCount} ${walletCaptureAvailable ? styles.available : ''}`}>
          <strong>{walletFragmentCount}</strong>/3 fragments
        </span>
      </div>

      {walletFragmentCount === 0 ? (
        <div className={styles.empty}>
          No wallet fragments yet. Investigate the correct city to find evidence.
        </div>
      ) : (
        <>
          {/* 40-cell hex grid */}
          <span className={styles.prefix}>0x</span>
          <div className={styles.walletGrid}>
            {Array.from({ length: 40 }, (_, i) => (
              <div
                key={i}
                className={`${styles.cell} ${revealedMap[i] ? styles.cellRevealed : ''}`}
              >
                {revealedMap[i] || '?'}
              </div>
            ))}
          </div>

          {/* fragment list */}
          <div className={styles.fragmentList}>
            {walletFragments.map((frag) => (
              <div key={frag.fragmentIndex} className={styles.fragmentItem}>
                <span className={styles.fragmentIdx}>#{frag.fragmentIndex}</span>
                <span className={styles.fragmentChars}>{frag.chars}</span>
                <span className={styles.fragmentPos}>pos {frag.startIndex}-{frag.startIndex + frag.length - 1}</span>
              </div>
            ))}
          </div>

          {/* capture input (only when 3+ fragments) */}
          {walletCaptureAvailable && captureState !== 'pending' && (
            <div className={styles.captureSection}>
              <div className={styles.inputRow}>
                <span className={styles.inputPrefix}>0x</span>
                <input
                  className={styles.walletInput}
                  placeholder="Enter full 40-char hex wallet..."
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  maxLength={42}
                />
              </div>
              <button
                className={styles.buildBtn}
                onClick={handleBuildCase}
                disabled={walletInput.replace(/^0x/, '').length !== 40}
              >
                BUILD CASE
              </button>
              <span className={styles.hint}>
                {revealedCount}/40 chars revealed — fill in the missing chars to capture Carmen
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
