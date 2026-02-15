import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '../store/gameStore'
import WalletEvidence from './WalletEvidence'
import styles from './EvidencePanel.module.css'

const CLUE_TYPE_ICONS = {
  BEHAVIOR_FINGERPRINT: '\u{1F9EC}',
  RELATIONSHIP: '\u{1F517}',
  IDENTITY_COMMIT: '\u{1F464}',
  FUNDING_TRAIL: '\u{1F4B0}',
  TECHNICAL_SIGNATURE: '\u{1F527}',
  DEAD_END: '\u{26D4}',
}

export default function EvidencePanel() {
  const {
    cityEvidence,
    citySuspectWallets,
    cityAnomalyTxRefs,
    gameplayRequestDossier,
    showDossierModal,
    dossierData,
    closeDossierModal,
    gameplayLoading,
    cityLocations,
    evidenceCount,
  } = useGameStore()

  const [selectedClue, setSelectedClue] = useState(null)

  const clues = cityEvidence.filter((e) => !e.isDeadEnd)
  const deadEnds = cityEvidence.filter((e) => e.isDeadEnd)
  const confidence = clues.length > 0
    ? Math.min(100, Math.round(clues.reduce((sum, c) => sum + c.strength, 0) / clues.length))
    : 0

  return (
    <div className={styles.panel}>
      {/* stats bar */}
      <div className={styles.statsBar}>
        <div className={styles.stat}>
          <span className={styles.statNum}>{clues.length}</span>
          <span className={styles.statLabel}>CLUES</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{citySuspectWallets.length}</span>
          <span className={styles.statLabel}>SUSPECTS</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{cityAnomalyTxRefs.length}</span>
          <span className={styles.statLabel}>TX REFS</span>
        </div>
        <div className={styles.stat}>
          <span className={`${styles.statNum} ${evidenceCount > 0 ? styles.confHigh : ''}`}>{evidenceCount}</span>
          <span className={styles.statLabel}>EVIDENCE</span>
        </div>
        <div className={`${styles.stat} ${styles.confidenceStat}`}>
          <span className={`${styles.statNum} ${confidence >= 70 ? styles.confHigh : confidence >= 40 ? styles.confMed : styles.confLow}`}>
            {confidence}%
          </span>
          <span className={styles.statLabel}>CONF.</span>
        </div>
      </div>

      <div className={styles.content}>
        {/* clues section */}
        <div className={styles.section}>
          <span className={styles.sectionTitle}>CLUES OBTAINED</span>
          {clues.length === 0 ? (
            <div className={styles.empty}>No clues yet. Investigate locations to find intel.</div>
          ) : (
            <div className={styles.clueList}>
              {clues.map((clue) => (
                <div key={clue.id} className={styles.clueCard} onClick={() => setSelectedClue(clue)} role="button" tabIndex={0}>
                  <span className={styles.clueIcon}>{CLUE_TYPE_ICONS[clue.clueType] || '\u{1F50D}'}</span>
                  <div className={styles.clueInfo}>
                    <div className={styles.clueTop}>
                      <span className={styles.clueType}>{clue.clueType}</span>
                      <span className={`${styles.clueStrength} ${clue.strength >= 70 ? styles.strHigh : clue.strength >= 40 ? styles.strMed : styles.strLow}`}>
                        STR {clue.strength}
                      </span>
                    </div>
                    <span className={styles.clueData}>{clue.data}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {deadEnds.length > 0 && (
            <div className={styles.deadEndNote}>
              {deadEnds.length} dead end{deadEnds.length > 1 ? 's' : ''} encountered
            </div>
          )}
        </div>

        {/* anomaly tx refs — only visible after scanning a location */}
        <div className={styles.section}>
          <span className={styles.sectionTitle}>ANOMALY TX REFS</span>
          {!cityLocations.some((l) => l.scanned) ? (
            <div className={styles.empty}>Run scanAnomalies() on a location first.</div>
          ) : cityAnomalyTxRefs.length === 0 ? (
            <div className={styles.empty}>Scan complete. No anomaly refs found.</div>
          ) : (
            <div className={styles.txList}>
              {cityAnomalyTxRefs.slice(0, 5).map((tx, i) => (
                <div key={i} className={styles.txRow}>
                  <span className={styles.txHash}>{typeof tx.txHashLike === 'string' && tx.txHashLike.length > 16 ? `${tx.txHashLike.slice(0, 10)}...${tx.txHashLike.slice(-4)}` : tx.txHashLike}</span>
                  <span className={styles.txMethod}>{tx.methodLabel || tx.methodSigLike}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* suspect wallets */}
        <div className={styles.section}>
          <span className={styles.sectionTitle}>SUSPECT WALLETS</span>
          {citySuspectWallets.length === 0 ? (
            <div className={styles.empty}>No suspects identified. Scan anomalies first.</div>
          ) : (
            <div className={styles.suspectList}>
              {citySuspectWallets.map((s, i) => (
                <div key={i} className={styles.suspectCard}>
                  <span className={styles.suspectAddr}>{`${s.wallet.slice(0, 8)}...${s.wallet.slice(-4)}`}</span>
                  <div className={styles.suspectMeta}>
                    <span className={`${styles.suspectLevel} ${s.suspicionLevel >= 70 ? styles.strHigh : s.suspicionLevel >= 40 ? styles.strMed : styles.strLow}`}>
                      {s.suspicionLevel}%
                    </span>
                    <span className={styles.suspectRefs}>{s.txRefIds.length} refs</span>
                  </div>
                  <div className={styles.suspectTags}>
                    {s.tags.map((t) => (
                      <span key={t} className={styles.tag}>{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* wallet evidence */}
        <div className={styles.section}>
          <WalletEvidence />
        </div>

        {/* confidence meter */}
        <div className={styles.confidenceMeter}>
          <span className={styles.meterLabel}>EVIDENCE CONFIDENCE</span>
          <div className={styles.meterBar}>
            <div
              className={`${styles.meterFill} ${confidence >= 70 ? styles.meterHigh : confidence >= 40 ? styles.meterMed : styles.meterLow}`}
              style={{ width: `${confidence}%` }}
            />
          </div>
          <span className={styles.meterValue}>{confidence}%</span>
        </div>

        {/* dossier button */}
        <button
          className={styles.dossierBtn}
          onClick={gameplayRequestDossier}
          disabled={cityEvidence.length === 0 || gameplayLoading}
        >
          {gameplayLoading ? 'COMPILING...' : 'REQUEST DOSSIER (1 E)'}
        </button>
      </div>

      {/* clue detail modal — portaled to body to escape overflow containers */}
      {selectedClue && createPortal(
        <div className={styles.modalOverlay} onClick={() => setSelectedClue(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>
                {CLUE_TYPE_ICONS[selectedClue.clueType] || '\u{1F50D}'} {selectedClue.clueType}
              </span>
              <span className={`${styles.modalConf} ${selectedClue.strength >= 70 ? styles.strHigh : selectedClue.strength >= 40 ? styles.strMed : styles.strLow}`}>
                STR {selectedClue.strength}
              </span>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalSection}>
                <span className={styles.modalSectionTitle}>INTEL</span>
                <p className={styles.modalText}>{selectedClue.data}</p>
              </div>
              <div className={styles.modalSection}>
                <span className={styles.modalSectionTitle}>METADATA</span>
                <p className={styles.modalTextCyan}>
                  Location: {selectedClue.locationIdx !== undefined ? `Slot ${selectedClue.locationIdx}` : 'Unknown'}
                  {' | '}Clue #{(selectedClue.clueIndex ?? 0) + 1}
                  {selectedClue.anomalyRefId && (<>{' | '}Ref: {selectedClue.anomalyRefId.slice(0, 10)}...</>)}
                </p>
                <p className={styles.modalTextCyan}>
                  {selectedClue.timestamp ? new Date(selectedClue.timestamp).toLocaleString() : ''}
                </p>
              </div>
              {selectedClue.strength > 65 && (
                <div className={styles.modalSection}>
                  <span className={styles.evidenceBadge}>EVIDENCE COLLECTED</span>
                </div>
              )}
            </div>
            <button className={styles.modalClose} onClick={() => setSelectedClue(null)}>
              CLOSE
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* dossier modal — portaled to body */}
      {showDossierModal && dossierData && createPortal(
        <div className={styles.modalOverlay} onClick={closeDossierModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>EVIDENCE DOSSIER</span>
              <span className={styles.modalConf}>Confidence: {dossierData.confidence}%</span>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalSection}>
                <span className={styles.modalSectionTitle}>SUMMARY</span>
                <p className={styles.modalText}>{dossierData.summary}</p>
              </div>
              <div className={styles.modalSection}>
                <span className={styles.modalSectionTitle}>HYPOTHESES</span>
                {dossierData.hypotheses.map((h, i) => (
                  <p key={i} className={styles.modalText}>&#8226; {h}</p>
                ))}
              </div>
              <div className={styles.modalSection}>
                <span className={styles.modalSectionTitle}>GAPS</span>
                {dossierData.gaps.map((g, i) => (
                  <p key={i} className={styles.modalTextWarn}>&#9888; {g}</p>
                ))}
              </div>
              <div className={styles.modalSection}>
                <span className={styles.modalSectionTitle}>NEXT OBJECTIVE</span>
                <p className={styles.modalTextCyan}>{dossierData.nextObjective}</p>
              </div>
            </div>
            <button className={styles.modalClose} onClick={closeDossierModal}>
              ACKNOWLEDGE
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
