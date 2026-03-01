import { useState, useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'
import { getWalletByAddress } from '../data/walletPool'
import { CHAIN_DEFS, CITY_POOL_MAP } from '../data/cityRegistry'
import styles from './CaptureMode.module.css'

// token icon map
const TOKEN_ICONS = {
  ETH: '/blockchain_icon/eth.png',
  ARB: '/blockchain_icon/arbitrum.png',
  USDC: '/blockchain_icon/usdc.png',
  LINK: '/blockchain_icon/chainlink.png',
  DAI: '/blockchain_icon/dai.png',
  cbETH: '/blockchain_icon/eth.png',
  BNB: '/blockchain_icon/bnb.png',
  CAKE: '/blockchain_icon/bnb.png',
  BUSD: '/blockchain_icon/bnb.png',
  XVS: '/blockchain_icon/bnb.png',
  MATIC: '/blockchain_icon/polygon.png',
  USDT: '/blockchain_icon/usdt.png',
  AAVE: '/blockchain_icon/eth.png',
  WETH: '/blockchain_icon/eth.png',
  WBTC: '/blockchain_icon/eth.png',
  UNI: '/blockchain_icon/eth.png',
  TXDC: '/blockchain_icon/xdc.png',
  SRX: '/blockchain_icon/xdc.png',
  PLI: '/blockchain_icon/xdc.png',
}

const CAPTURE_STAGES = [
  { label: 'Analyzing evidence...', pct: 25 },
  { label: 'Searching transactions...', pct: 50 },
  { label: 'Consolidating data...', pct: 75 },
  { label: 'Capturing target...', pct: 100 },
]

function getWalletProfile(wallet, suspectData) {
  const profiles = []
  const tags = wallet?.tags || suspectData?.tags || []

  if (tags.includes('new-account')) profiles.push({ label: 'New wallet', color: 'yellow', icon: '!' })
  if (tags.includes('high-freq') || tags.includes('mev-bot')) profiles.push({ label: 'High-frequency trader', color: 'red', icon: 'H' })
  if (tags.includes('nft-trader')) profiles.push({ label: 'Frequent NFT trader', color: 'magenta', icon: 'N' })
  if (tags.includes('whale') || tags.includes('high-value')) profiles.push({ label: 'Whale account', color: 'cyan', icon: 'W' })
  if (tags.includes('mixer')) profiles.push({ label: 'Uses mixing services', color: 'red', icon: '!' })
  if (tags.includes('bridge-user') || tags.includes('cross-chain')) profiles.push({ label: 'Cross-chain activity', color: 'cyan', icon: 'X' })
  if (tags.includes('flash-loan')) profiles.push({ label: 'Flash loan user', color: 'yellow', icon: 'F' })
  if (tags.includes('deployer')) profiles.push({ label: 'Contract deployer', color: 'green', icon: 'D' })
  if (tags.includes('yield-farmer')) profiles.push({ label: 'Yield farmer', color: 'green', icon: 'Y' })
  if (tags.includes('dao-voter')) profiles.push({ label: 'DAO participant', color: 'muted', icon: 'V' })
  if (tags.includes('multi-sig')) profiles.push({ label: 'Multi-sig signer', color: 'cyan', icon: 'M' })
  if (tags.includes('fee-recipient')) profiles.push({ label: 'Fee recipient', color: 'muted', icon: '$' })

  if (suspectData?.suspicionLevel > 90) {
    profiles.unshift({ label: 'EXTREMELY SUSPICIOUS', color: 'red', icon: '!!' })
  } else if (suspectData?.suspicionLevel > 75) {
    profiles.unshift({ label: 'Highly suspicious', color: 'red', icon: '!' })
  } else if (suspectData?.suspicionLevel > 50) {
    profiles.unshift({ label: 'Moderately suspicious', color: 'yellow', icon: '?' })
  } else if (suspectData?.suspicionLevel > 0) {
    profiles.unshift({ label: 'Low suspicion', color: 'muted', icon: '-' })
  }

  if (wallet?.nfts?.some(n => n.stolen)) {
    profiles.push({ label: 'Holds stolen NFTs', color: 'red', icon: '!' })
  }

  if (profiles.length === 0) {
    profiles.push({ label: 'No intel available', color: 'muted', icon: '?' })
  }

  return profiles
}

function CaptureProgress({ onComplete }) {
  const [stageIdx, setStageIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const completedRef = useRef(false)

  useEffect(() => {
    const stageDuration = 2200
    const tickInterval = 40
    let elapsed = 0

    const timer = setInterval(() => {
      elapsed += tickInterval
      const totalDuration = stageDuration * CAPTURE_STAGES.length
      const totalPct = Math.min((elapsed / totalDuration) * 100, 100)
      const currentStage = Math.min(Math.floor(elapsed / stageDuration), CAPTURE_STAGES.length - 1)

      setProgress(totalPct)
      setStageIdx(currentStage)

      if (totalPct >= 100 && !completedRef.current) {
        completedRef.current = true
        clearInterval(timer)
        setTimeout(() => onComplete(), 400)
      }
    }, tickInterval)

    return () => clearInterval(timer)
  }, [onComplete])

  const stage = CAPTURE_STAGES[stageIdx]

  return (
    <div className={styles.progressContainer}>
      <div className={styles.progressStageLabel}>{stage.label}</div>
      <div className={styles.progressBarTrack}>
        <div
          className={styles.progressBarFill}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className={styles.progressPct}>{Math.round(progress)}%</div>
      <div className={styles.progressSteps}>
        {CAPTURE_STAGES.map((s, i) => (
          <span
            key={i}
            className={`${styles.progressStep} ${i <= stageIdx ? styles.progressStepActive : ''}`}
          >
            {s.label.replace('...', '')}
          </span>
        ))}
      </div>
    </div>
  )
}

function WalletCard({ direction, address, isSelected, onSelect, hasAnomalyScan, suspectData }) {
  const wallet = getWalletByAddress(address)
  const isKnown = Boolean(wallet)

  // collect top assets
  const topAssets = []
  if (isKnown && wallet.assets) {
    for (const [chainId, tokens] of Object.entries(wallet.assets)) {
      for (const tok of tokens) {
        topAssets.push({ ...tok, chainId: Number(chainId) })
      }
    }
    topAssets.sort((a, b) => b.amount - a.amount)
  }
  const displayAssets = topAssets.slice(0, 5)

  const profiles = hasAnomalyScan ? getWalletProfile(wallet, suspectData) : []
  const suspicionPct = suspectData?.suspicionLevel || 0

  return (
    <div
      className={`${styles.walletCard} ${isSelected ? styles.walletCardSelected : ''}`}
      onClick={onSelect}
    >
      {/* direction label */}
      <div className={styles.walletDirection}>{direction}</div>

      {/* identity */}
      <div className={styles.suspectHeader}>
        <div className={styles.suspectIdentity}>
          {isKnown ? (
            <span className={styles.suspectAlias}>{wallet.alias}</span>
          ) : (
            <span className={styles.suspectUnknown}>UNKNOWN</span>
          )}
          {suspectData && (
            <span
              className={styles.suspicionBadge}
              data-level={suspicionPct > 90 ? 'extreme' : suspicionPct > 75 ? 'high' : suspicionPct > 50 ? 'med' : 'low'}
            >
              {suspicionPct}%
            </span>
          )}
        </div>
        <div className={styles.suspectAddr}>
          {address ? `${address.slice(0, 10)}...${address.slice(-6)}` : '???'}
        </div>
      </div>

      {/* crypto assets */}
      <div className={styles.assetIcons}>
        {displayAssets.length > 0 ? (
          displayAssets.map((tok, i) => {
            const iconSrc = TOKEN_ICONS[tok.symbol]
            const chain = CHAIN_DEFS[tok.chainId]
            return (
              <div key={i} className={styles.assetChip} title={`${tok.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${tok.symbol}`}>
                {iconSrc ? (
                  <img src={iconSrc} alt={tok.symbol} className={styles.tokenIcon} />
                ) : (
                  <span className={styles.tokenFallback} style={{ borderColor: chain?.color || '#555' }}>
                    {tok.symbol.slice(0, 2)}
                  </span>
                )}
                <span className={styles.assetAmount}>
                  {tok.amount >= 1000 ? `${(tok.amount / 1000).toFixed(1)}k` : tok.amount.toFixed(1)}
                </span>
                <span className={styles.assetSymbol}>{tok.symbol}</span>
              </div>
            )
          })
        ) : (
          <span className={styles.noAssets}>no assets data</span>
        )}
      </div>

      {/* nfts */}
      {isKnown && wallet.nfts?.length > 0 && (
        <div className={styles.nftRow}>
          {wallet.nfts.slice(0, 3).map((nft, i) => (
            <span key={i} className={`${styles.nftChip} ${nft.stolen ? styles.nftStolen : ''}`}>
              {nft.name}
              {nft.stolen && <span className={styles.stolenFlag}>STOLEN</span>}
            </span>
          ))}
        </div>
      )}

      {/* profile intel */}
      <div className={styles.profileSection}>
        {hasAnomalyScan ? (
          profiles.map((p, i) => (
            <span key={i} className={styles.profileTag} data-color={p.color}>
              <span className={styles.profileIcon}>{p.icon}</span>
              {p.label}
            </span>
          ))
        ) : (
          <span className={styles.noScanMsg}>run anomaly scan to profile this wallet</span>
        )}
      </div>

      {/* selected indicator */}
      {isSelected && (
        <div className={styles.selectedIndicator}>TARGET LOCKED</div>
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
    citySuspectWallets,
    cityLocations,
    currentCityId,
    captureSelectedTx,
    setCaptureSelectedTx,
  } = useGameStore()

  const [selectedWallet, setSelectedWallet] = useState(null)
  const [showProgress, setShowProgress] = useState(false)
  const pendingWalletRef = useRef(null)

  // check if the specific location of this tx was scanned for anomalies
  const txLocationIdx = captureSelectedTx?._locationIdx
  const hasAnomalyScan = txLocationIdx != null
    ? Boolean(cityLocations[txLocationIdx]?.scanned)
    : false
  const cityName = CITY_POOL_MAP[currentCityId]?.name || 'Unknown'

  const fromAddr = captureSelectedTx?.from ? String(captureSelectedTx.from) : null
  const toAddr = captureSelectedTx?.to ? String(captureSelectedTx.to) : null
  const txHash = captureSelectedTx?.txHashLike
  const txLabel = txHash && typeof txHash === 'string' && txHash.length > 16
    ? `${txHash.slice(0, 10)}...${txHash.slice(-4)}`
    : txHash

  // find suspect data for from/to addresses
  const suspectMap = {}
  for (const s of citySuspectWallets) {
    suspectMap[s.wallet?.toLowerCase()] = s
  }
  const fromSuspect = fromAddr ? suspectMap[fromAddr.toLowerCase()] : null
  const toSuspect = toAddr ? suspectMap[toAddr.toLowerCase()] : null

  const handleCapture = () => {
    if (!selectedWallet) return
    pendingWalletRef.current = selectedWallet
    setShowProgress(true)
  }

  const handleProgressComplete = () => {
    setShowProgress(false)
    if (pendingWalletRef.current) {
      gameplayRequestCapture(pendingWalletRef.current)
      pendingWalletRef.current = null
    }
  }

  const handleClose = () => {
    setCaptureSelectedTx(null)
    setSelectedWallet(null)
  }

  const truncAddr = (addr) => {
    if (!addr || addr.length < 12) return addr
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`
  }

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon}>&#9888;</span>
            <span className={styles.headerTitle}>CAPTURE MODE</span>
            <span className={styles.headerCity}>{cityName}</span>
            {txLabel && (
              <span className={styles.headerTx}>TX {txLabel}</span>
            )}
          </div>
          <button className={styles.exitBtn} onClick={handleClose}>
            &#10005;
          </button>
        </div>

        {/* tx summary */}
        {captureSelectedTx && captureState === 'ready' && !showProgress && (
          <div className={styles.txSummary}>
            <span className={styles.txSummaryMethod}>
              {captureSelectedTx.methodLabel || 'unknown'}
            </span>
            <span className={styles.txSummaryValue}>
              {captureSelectedTx.valueDisplay || '—'}
            </span>
            {captureSelectedTx.isAnomaly && (
              <span className={styles.txSummaryAnomaly}>
                {captureSelectedTx.anomalyLabel || 'ANOMALY'}
              </span>
            )}
          </div>
        )}

        {/* wallet cards: FROM and TO */}
        {captureState === 'ready' && !showProgress && (
          <>
            <div className={styles.walletsRow}>
              <WalletCard
                direction="FROM"
                address={fromAddr}
                isSelected={selectedWallet === fromAddr}
                onSelect={() => setSelectedWallet(selectedWallet === fromAddr ? null : fromAddr)}
                hasAnomalyScan={hasAnomalyScan}
                suspectData={fromSuspect}
              />

              <div className={styles.walletArrow}>&#10132;</div>

              <WalletCard
                direction="TO"
                address={toAddr}
                isSelected={selectedWallet === toAddr}
                onSelect={() => setSelectedWallet(selectedWallet === toAddr ? null : toAddr)}
                hasAnomalyScan={hasAnomalyScan}
                suspectData={toSuspect}
              />
            </div>

            {/* capture action bar */}
            {selectedWallet && (
              <div className={styles.captureActionBar}>
                <div className={styles.captureTarget}>
                  <span className={styles.captureTargetLabel}>TARGET:</span>
                  <span className={styles.captureTargetAddr}>{truncAddr(selectedWallet)}</span>
                </div>
                <button className={styles.captureBtn} onClick={handleCapture}>
                  CAPTURE (30 BLOCKS)
                </button>
              </div>
            )}
          </>
        )}

        {/* progress bar */}
        {captureState === 'ready' && showProgress && (
          <CaptureProgress onComplete={handleProgressComplete} />
        )}

        {captureState === 'pending' && (
          <div className={styles.pendingState}>
            <div className={styles.spinner} />
            <span className={styles.pendingText}>SUBMITTING TO CHAIN...</span>
            <span className={styles.pendingSub}>cross-chain verification in progress</span>
          </div>
        )}

        {captureState === 'success' && captureResult && (
          <div className={styles.resultState}>
            <div className={styles.successBanner}>
              <span className={styles.successIcon}>&#9733;</span>
              <span className={styles.successTitle}>CARMEN SANDIEGO CAPTURED!</span>
            </div>
            <p className={styles.resultNote}>{captureResult.gmNote}</p>
            <button className={styles.resultBtn} onClick={handleClose}>CLOSE</button>
          </div>
        )}

        {captureState === 'fail' && captureResult && (
          <div className={styles.resultState}>
            <div className={styles.failBanner}>
              <span className={styles.failIcon}>&#10005;</span>
              <span className={styles.failTitle}>CAPTURE FAILED</span>
            </div>
            <span className={styles.failReasonCode}>{captureResult.reasonCode}</span>
            <p className={styles.resultNote}>{captureResult.gmNote}</p>
            <button className={styles.resultBtn} onClick={() => {
              useGameStore.setState({ captureState: 'ready', captureResult: null })
              setSelectedWallet(null)
              setCaptureSelectedTx(null)
            }}>
              RETRY
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
