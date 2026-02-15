import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { getWalletByAddress } from '../data/walletPool'
import { CHAIN_DEFS } from '../data/cityRegistry'
import WalletEvidence from './WalletEvidence'
import styles from './CaptureMode.module.css'

function WalletPanel({ direction, address, isSelected, onSelect }) {
  const wallet = getWalletByAddress(address)
  const isKnown = Boolean(wallet)

  return (
    <div
      className={`${styles.walletPanel} ${isSelected ? styles.walletPanelSelected : ''}`}
      onClick={onSelect}
    >
      <div className={styles.walletPanelHeader}>
        <span className={styles.walletDirection}>{direction}</span>
        {isKnown ? (
          <span className={styles.walletAlias}>{wallet.alias}</span>
        ) : (
          <span className={styles.unknownWallet}>UNKNOWN WALLET</span>
        )}
      </div>

      <div className={styles.walletFullAddr}>{address}</div>

      {isKnown && wallet.tags.length > 0 && (
        <div className={styles.tagRow}>
          {wallet.tags.map((tag) => (
            <span key={tag} className={styles.walletTag}>{tag}</span>
          ))}
        </div>
      )}

      {isKnown ? (
        <>
          {Object.entries(wallet.assets).map(([chainId, tokens]) => {
            const chain = CHAIN_DEFS[chainId]
            return (
              <div key={chainId} className={styles.chainSection}>
                <div
                  className={styles.chainHeader}
                  style={{ borderColor: chain?.color || '#555' }}
                >
                  {chain?.name || `Chain ${chainId}`}
                </div>
                <div className={styles.assetList}>
                  {tokens.map((tok, i) => (
                    <div key={i} className={styles.assetRow}>
                      <span className={styles.assetSymbol}>{tok.symbol}</span>
                      <span className={styles.assetAmount}>{tok.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {wallet.nfts.length > 0 && (
            <div className={styles.nftSection}>
              <div className={styles.chainHeader} style={{ borderColor: '#ff6bff' }}>
                NFTs ({wallet.nfts.length})
              </div>
              {wallet.nfts.map((nft, i) => (
                <div key={i} className={styles.nftRow}>
                  <span className={styles.nftName}>{nft.name}</span>
                  <span className={styles.nftCollection}>{nft.collection}</span>
                  {nft.stolen && <span className={styles.nftStolen}>STOLEN</span>}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className={styles.assetList}>
          <div className={styles.assetRow}>
            <span className={styles.assetSymbol}>???</span>
            <span className={styles.assetAmount}>---</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CaptureMode() {
  const {
    captureState,
    captureResult,
    toggleCaptureMode,
    gameplayRequestCapture,
    walletCaptureAvailable,
    captureSelectedTx,
  } = useGameStore()

  const [captureTab, setCaptureTab] = useState('transaction') // 'transaction' | 'wallet'
  const [selectedTarget, setSelectedTarget] = useState(null) // 'from' | 'to'

  const fromAddr = captureSelectedTx?.from ? String(captureSelectedTx.from) : null
  const toAddr = captureSelectedTx?.to ? String(captureSelectedTx.to) : null

  const handleCapture = () => {
    const wallet = selectedTarget === 'from' ? fromAddr : toAddr
    if (!wallet) return
    gameplayRequestCapture(wallet)
  }

  const truncAddr = (addr) => {
    if (!addr || addr.length < 12) return addr
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`
  }

  return (
    <div className={styles.bar}>
      <div className={styles.barHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIcon}>&#9888;</span>
          <span className={styles.headerTitle}>CAPTURE MODE</span>
          <span className={styles.blockCost}>SELECT A TRANSACTION TO INSPECT</span>
        </div>
        <button className={styles.exitBtn} onClick={toggleCaptureMode}>
          &#10005; EXIT
        </button>
      </div>

      {captureState === 'ready' && (
        <div className={styles.barContent}>
          <div className={styles.tabBar}>
            <button
              className={`${styles.tabBtn} ${captureTab === 'transaction' ? styles.tabActive : ''}`}
              onClick={() => setCaptureTab('transaction')}
            >
              TX INSPECTION
            </button>
            <button
              className={`${styles.tabBtn} ${captureTab === 'wallet' ? styles.tabActive : ''}`}
              onClick={() => setCaptureTab('wallet')}
            >
              WALLET EVIDENCE {walletCaptureAvailable ? '(!)' : ''}
            </button>
          </div>

          {captureTab === 'wallet' && (
            <div className={styles.walletEvidenceTab}>
              <WalletEvidence />
            </div>
          )}

          {captureTab === 'transaction' && (
            <div className={styles.txInspection}>
              {!captureSelectedTx ? (
                <div className={styles.empty}>
                  Click a transaction in the explorer above to inspect its wallets.
                </div>
              ) : (
                <>
                  {/* tx info summary */}
                  <div className={styles.txSummary}>
                    <span className={styles.txSummaryHash}>
                      TX {typeof captureSelectedTx.txHashLike === 'string' && captureSelectedTx.txHashLike.length > 16
                        ? `${captureSelectedTx.txHashLike.slice(0, 10)}...${captureSelectedTx.txHashLike.slice(-4)}`
                        : captureSelectedTx.txHashLike}
                    </span>
                    <span className={styles.txSummaryMethod}>
                      {captureSelectedTx.methodLabel || 'unknown'}
                    </span>
                    {captureSelectedTx.isAnomaly && (
                      <span className={styles.txSummaryAnomaly}>
                        {captureSelectedTx.anomalyLabel || 'ANOMALY'}
                      </span>
                    )}
                  </div>

                  {/* from / to wallet panels */}
                  <div className={styles.walletPanels}>
                    <WalletPanel
                      direction="FROM"
                      address={fromAddr}
                      isSelected={selectedTarget === 'from'}
                      onSelect={() => setSelectedTarget(selectedTarget === 'from' ? null : 'from')}
                    />

                    <div className={styles.walletArrow}>&#10132;</div>

                    <WalletPanel
                      direction="TO"
                      address={toAddr}
                      isSelected={selectedTarget === 'to'}
                      onSelect={() => setSelectedTarget(selectedTarget === 'to' ? null : 'to')}
                    />
                  </div>

                  {/* capture button */}
                  {selectedTarget && (
                    <button
                      className={styles.captureBtn}
                      onClick={handleCapture}
                    >
                      CAPTURE {truncAddr(selectedTarget === 'from' ? fromAddr : toAddr)} (3 BLOCKS)
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {captureState === 'pending' && (
        <div className={styles.pendingState}>
          <div className={styles.spinner} />
          <span className={styles.pendingText}>SUBMITTING...</span>
        </div>
      )}

      {captureState === 'success' && captureResult && (
        <div className={styles.resultState}>
          <span className={styles.successIcon}>&#9733;</span>
          <span className={styles.successTitle}>CAPTURED!</span>
          <p className={styles.resultNote}>{captureResult.gmNote}</p>
          <button className={styles.resultBtn} onClick={toggleCaptureMode}>CLOSE</button>
        </div>
      )}

      {captureState === 'fail' && captureResult && (
        <div className={styles.resultState}>
          <span className={styles.failIcon}>&#10005;</span>
          <span className={styles.failTitle}>FAILED</span>
          <span className={styles.failReasonCode}>{captureResult.reasonCode}</span>
          <p className={styles.resultNote}>{captureResult.gmNote}</p>
          <button className={styles.resultBtn} onClick={() => {
            useGameStore.setState({ captureState: 'ready', captureResult: null })
          }}>
            RETRY
          </button>
        </div>
      )}
    </div>
  )
}
