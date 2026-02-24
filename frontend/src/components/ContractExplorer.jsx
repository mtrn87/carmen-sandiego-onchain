import { useState, useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { CHAIN_CONFIG, CASE_DATA, DEFAULT_CASE } from '../data/contractData'
import {
  CITY_MAP,
  CATEGORY_MAP,
  ANOMALY_TYPE_MAP,
  getCityNodeInfo,
  getCityNodeLocations,
  getCityNodeAnomalyTxRefs,
  getCityNodeSuspectWallets,
  getCityNodeEvidenceSummary,
} from '../services/contractService'
import { getLocationNarratives as getRegistryNarratives, getLocationImages as getRegistryImages } from '../data/cityRegistry'
import styles from './ContractExplorer.module.css'

function getLocationNarrative(chainId, locationIdx) {
  const narratives = getRegistryNarratives(chainId)
  return narratives?.[locationIdx] || null
}

// Build detective-style narrative from anomaly txRefs data
function buildAnomalyNarrative(anomalyData) {
  if (!anomalyData || !Array.isArray(anomalyData) || anomalyData.length === 0) {
    return {
      title: 'Anomaly Scan Results',
      status: 'NO ANOMALIES DETECTED',
      statusColor: 'green',
      analysis: 'Network scan complete. No suspicious transaction patterns found at this location. All transfers appear legitimate and within normal parameters. This area may be clean — or the suspect is covering their tracks well.',
    }
  }

  const ANOMALY_LABELS = {
    UNUSUAL_GAS: 'gas spike',
    LARGE_TRANSFER: 'large transfer',
    RAPID_SEQUENCE: 'rapid sequence',
    KNOWN_MIXER: 'mixer interaction',
    FLASH_LOAN: 'flash loan',
  }

  const count = anomalyData.length
  const types = [...new Set(anomalyData.map((tx) => tx.anomalyLabel || ANOMALY_LABELS[tx.anomalyType] || 'unknown'))]
  const totalValue = anomalyData.reduce((sum, tx) => sum + parseFloat(tx.valueDisplay || '0'), 0)
  const wallets = [...new Set(anomalyData.map((tx) => tx.from))]

  const threatLevel = count >= 5 ? 'HIGH' : count >= 2 ? 'MEDIUM' : 'LOW'
  const threatColor = count >= 5 ? 'red' : count >= 2 ? 'yellow' : 'green'

  const typeStr = types.map((t) => t.toLowerCase()).join(', ')
  const lines = [
    `Scanner detected ${count} anomalous transaction${count > 1 ? 's' : ''} across this node.`,
    `Anomaly types: ${typeStr}.`,
    `${wallets.length} unique wallet${wallets.length > 1 ? 's' : ''} involved — total flagged volume: ${totalValue.toFixed(4)} units.`,
  ]

  if (count >= 3) {
    lines.push('Pattern density suggests coordinated activity — possible extraction operation in progress.')
  }
  if (types.includes('UNUSUAL_GAS') || types.includes('gas spike')) {
    lines.push('Gas spikes indicate embedded metadata in overpaid transactions — a known obfuscation technique.')
  }
  if (types.includes('LARGE_TRANSFER') || types.includes('large transfer')) {
    lines.push('Large transfers flagged — possible asset staging for cross-chain exit.')
  }

  return {
    title: 'Anomaly Scan Results',
    status: `${count} ANOMAL${count > 1 ? 'IES' : 'Y'} — ${threatLevel} THREAT`,
    statusColor: threatColor,
    analysis: lines.join(' '),
  }
}

export default function ContractExplorer({ onOpenMap, onBackToCityPanel }) {
  const {
    gas,
    gasFlash,
    spendGas,
    addEvidence,
    addTerminalLine,
    tourActive,
    tourStep,
    advanceTour,
    endTour,
    currentCase,
    missionEvents,
    missionId,
    // CityNode state
    currentCityId,
    currentLocationIdx,
    cityLocations,
    cityAnomalyTxRefs,
    blocksElapsed,
    backToMap,
    backToCityPanel,
    gameplayScanAnomalies,
    gameplayRequestClue,
    walletAddress,
    captureMode,
    captureSelectedTx,
    setCaptureSelectedTx,
    toggleCaptureMode,
    gameplayLoading,
  } = useGameStore()

  const [selectedTx, setSelectedTx] = useState(null)
  const [activeSection, setActiveSection] = useState('transactions')
  const [investigationModal, setInvestigationModal] = useState(null)
  const [investigatedTxs, setInvestigatedTxs] = useState(new Set())

  // read method results (for Contract tab)
  const [readResults, setReadResults] = useState({})
  const [readLoading, setReadLoading] = useState({})
  const [readViewMode, setReadViewMode] = useState({}) // 'analysis' (default) | 'raw'

  // CityNode mode: active whenever a city is selected (legacy mode is disabled)
  const isCityNodeMode = Boolean(currentCityId)

  // reset state when case or city changes
  useEffect(() => {
    setSelectedTx(null)
    setActiveSection('transactions')
    setInvestigationModal(null)
    setReadResults({})
  }, [currentCase, currentCityId, currentLocationIdx])

  // ── Legacy mock data mode ──
  const caseData = !isCityNodeMode ? (CASE_DATA[currentCase] || CASE_DATA[DEFAULT_CASE]) : null
  const chain = !isCityNodeMode ? (CHAIN_CONFIG[caseData?.chain] || CHAIN_CONFIG['BNB Chain']) : null
  const transactions = !isCityNodeMode ? (caseData?.transactions || []) : []
  const events = !isCityNodeMode ? (caseData?.events || []) : []

  // ── CityNode mode data ──
  const cityMeta = isCityNodeMode
    ? (CITY_MAP[currentCityId] || { name: `City ${currentCityId}`, chain: 'Unknown', color: '#00ffff', emoji: '' })
    : null
  const currentLocation = isCityNodeMode && currentLocationIdx !== null ? cityLocations[currentLocationIdx] : null

  // Location images from city registry (supports all 16 cities)
  const locationImages = isCityNodeMode ? getRegistryImages(currentCityId) : []
  const locationImage = isCityNodeMode && currentLocationIdx !== null
    ? locationImages[currentLocationIdx] || null
    : null

  // ── Legacy handlers ──
  const handleTxClick = (tx) => {
    setSelectedTx(tx.id === selectedTx ? null : tx.id)
    if (tourActive && tourStep === 0 && tx.id === 'tx-bridge') {
      advanceTour()
    }
  }

  const handleInvestigate = (tx) => {
    if (gas < tx.gasCost) return
    spendGas(tx.gasCost)
    setInvestigatedTxs((prev) => new Set(prev).add(tx.id))
    setInvestigationModal(tx)
    addTerminalLine(`> INVESTIGATE: ${tx.method} [${tx.hash}] — cost ${tx.gasCost} GAS`, 'cyan', 'action')
    if (tourActive && tourStep === 1) advanceTour()
  }

  const handleAddEvidence = (tx) => {
    if (!tx.investigation.evidenceName) return
    const ev = {
      id: `ev-${Date.now()}`,
      name: tx.investigation.evidenceName,
      description: tx.investigation.evidenceDesc,
      icon: tx.investigation.audioSrc ? 'audio' : 'clue',
      fromLocation: currentCase,
      rarity: tx.investigation.audioSrc ? 'legendary' : 'rare',
    }
    if (tx.investigation.audioSrc) ev.audioSrc = tx.investigation.audioSrc
    addEvidence(ev)
    addTerminalLine(`> EVIDENCE COLLECTED: ${tx.investigation.evidenceName}`, 'yellow', 'alert')
    if (tx.investigation.audioSrc) {
      addTerminalLine('> ENCRYPTED AUDIO INTERCEPTED — check evidence panel to listen.', 'green', 'alert')
    }
    setInvestigationModal(null)
    if (tourActive && tourStep === 2) advanceTour()
  }

  const selectedTxData = !isCityNodeMode ? transactions.find((t) => t.id === selectedTx) : null

  // ── CityNode read method handler ──
  const handleReadMethod = async (methodName) => {
    if (!currentCityId) return
    setReadLoading((s) => ({ ...s, [methodName]: true }))
    try {
      let result
      switch (methodName) {
        case 'cityInfo':
          result = await getCityNodeInfo(currentCityId)
          break
        case 'getLocationMeta': {
          const idx = currentLocationIdx ?? 0
          const locs = await getCityNodeLocations(currentCityId)
          result = locs[idx] || null
          break
        }
        case 'getAnomalyTxRefs':
          result = await getCityNodeAnomalyTxRefs(currentCityId)
          break
        case 'getSuspectWallets':
          result = await getCityNodeSuspectWallets(currentCityId)
          break
        case 'getEvidenceSummary':
          result = await getCityNodeEvidenceSummary(currentCityId, walletAddress)
          break
        default:
          result = 'Method not implemented'
      }
      setReadResults((s) => ({ ...s, [methodName]: result }))
    } catch (error) {
      setReadResults((s) => ({ ...s, [methodName]: { error: error.message } }))
    }
    setReadLoading((s) => ({ ...s, [methodName]: false }))
  }

  // ── Render ──
  if (isCityNodeMode && gameplayLoading && cityLocations.length === 0) {
    return (
      <div className={styles.explorer} data-tour="explorer">
        <div className={styles.placeholderSection} style={{ marginTop: '40%' }}>
          <span className={styles.placeholderIcon}>&#9211;</span>
          <span>CONNECTING TO {cityMeta?.name?.toUpperCase() || 'NETWORK'}...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.explorer} data-tour="explorer">
      {/* top bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          {isCityNodeMode ? (
            <>
              <button className={styles.backBtn} onClick={() => {
                if (onBackToCityPanel) {
                  onBackToCityPanel()
                } else {
                  backToMap()
                  onOpenMap()
                }
              }}>&#9664; BACK</button>
              <div
                className={styles.chainDot}
                style={{ backgroundColor: cityMeta.color, boxShadow: `0 0 6px ${cityMeta.color}` }}
              />
              <span className={styles.chainLabel}>{cityMeta.chain}</span>
              <span className={styles.chainSep}>|</span>
              <span className={styles.chainLocation}>{cityMeta.emoji} {cityMeta.name}</span>
              {currentLocation && (
                <>
                  <span className={styles.chainSep}>|</span>
                  <span className={styles.explorerLabel}>{currentLocation.name}</span>
                </>
              )}
              {!currentLocation && (
                <>
                  <span className={styles.chainSep}>|</span>
                  <span className={styles.explorerLabel}>BLOCK EXPLORER</span>
                </>
              )}
            </>
          ) : (
            <>
              <div
                className={styles.chainDot}
                style={{ backgroundColor: chain.color, boxShadow: `0 0 6px ${chain.color}` }}
              />
              <span className={styles.chainLabel}>{chain.name}</span>
              {chain.location && (
                <>
                  <span className={styles.chainSep}>|</span>
                  <span className={styles.chainLocation}>{chain.flag} {chain.location}</span>
                </>
              )}
              <span className={styles.chainSep}>|</span>
              <span className={styles.explorerLabel}>BLOCK EXPLORER</span>
            </>
          )}
        </div>
        <div className={styles.topBarRight}>
          <div className={`${styles.gasInfo} ${gasFlash ? styles.gasFlash : ''}`}>
            <span className={styles.gasLabel}>BLOCKS</span>
            <span className={styles.gasValue}>{blocksElapsed}</span>
          </div>
          <button
            className={`${styles.mapBtn} ${tourActive && tourStep === 4 ? styles.tourHighlight : ''}`}
            data-tour="map-btn"
            onClick={() => {
              if (tourActive && tourStep === 4) endTour()
              onOpenMap()
            }}
          >
            &#9741; MAP
          </button>
        </div>
      </div>

      {/* scrollable content */}
      <div className={styles.content}>
        {/* CityNode mode: location card when selected */}
        {isCityNodeMode && currentLocation && (
          <div className={styles.contractCard}>
            {locationImage && (
              <div className={styles.contractImageWrap}>
                <img src={locationImage} alt={currentLocation.name} className={styles.contractImage} />
                <div className={styles.contractImageOverlay} />
              </div>
            )}
            <div className={styles.contractDetails}>
              <div className={styles.contractHeader}>
                <div>
                  <span className={styles.contractType}>{CATEGORY_MAP[currentLocation.category] || 'Unknown'}</span>
                  <h2 className={styles.contractName}>{currentLocation.name}</h2>
                </div>
                <div className={styles.contractCaseId}>
                  <span className={styles.caseIdLabel}>RISK</span>
                  <span className={styles.caseIdValue}>{currentLocation.riskLevel}/5</span>
                </div>
              </div>
              <div className={styles.nftMeta}>
                <div className={styles.nftMetaRow}>
                  <span className={styles.metaLabel}>Location Index</span>
                  <span className={styles.metaValueMono}>{currentLocationIdx}</span>
                </div>
                <div className={styles.nftMetaRow}>
                  <span className={styles.metaLabel}>Category</span>
                  <span className={styles.metaValue}>{CATEGORY_MAP[currentLocation.category] || `Type ${currentLocation.category}`}</span>
                </div>
                <div className={styles.nftMetaRow}>
                  <span className={styles.metaLabel}>Status</span>
                  <span className={styles.metaValue}>
                    {currentLocation.inspected ? 'Inspected' : 'Not Inspected'}
                    {currentLocation.scanned ? ' | Scanned' : ''}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Legacy: NFT header */}
        {!isCityNodeMode && caseData?.headerType === 'nft' && caseData.nft && (
          <div className={styles.nftCard}>
            <div className={styles.nftImageWrap}>
              <img src={caseData.locationImage} alt={caseData.nft.name} className={styles.nftImage} />
              <div className={styles.nftImageOverlay} />
            </div>
            <div className={styles.nftDetails}>
              <div className={styles.nftHeader}>
                <div>
                  <span className={styles.nftCollection}>{caseData.nft.collection}</span>
                  <h2 className={styles.nftName}>{caseData.nft.name}</h2>
                </div>
                <div className={styles.nftValuation}>
                  <span className={styles.nftEth}>{caseData.nft.valuationBnb}</span>
                  <span className={styles.nftUsd}>{caseData.nft.valuationUsd}</span>
                </div>
              </div>
              <div className={styles.nftMeta}>
                <div className={styles.nftMetaRow}>
                  <span className={styles.metaLabel}>Contract</span>
                  <span className={styles.metaValueMono}>{caseData.nft.contractAddress.slice(0, 20)}...{caseData.nft.contractAddress.slice(-4)}</span>
                </div>
                <div className={styles.nftMetaRow}>
                  <span className={styles.metaLabel}>Token ID</span>
                  <span className={styles.metaValue}>{caseData.nft.tokenId}</span>
                </div>
                <div className={styles.nftMetaRow}>
                  <span className={styles.metaLabel}>Standard</span>
                  <span className={styles.metaValue}>{caseData.nft.standard}</span>
                </div>
                <div className={styles.nftMetaRow}>
                  <span className={styles.metaLabel}>Current Owner</span>
                  <span className={styles.metaValueMono}>{caseData.nft.owner}</span>
                </div>
                <div className={styles.nftMetaRow}>
                  <span className={styles.metaLabel}>Previous Owner</span>
                  <span className={styles.metaValueMono}>{caseData.nft.previousOwner.slice(0, 12)}...{caseData.nft.previousOwner.slice(-4)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Legacy: Contract header */}
        {!isCityNodeMode && caseData?.headerType === 'contract' && caseData.contract && (
          <div className={styles.contractCard}>
            <div className={styles.contractImageWrap}>
              <img src={caseData.locationImage} alt={caseData.contract.name} className={styles.contractImage} />
              <div className={styles.contractImageOverlay} />
            </div>
            <div className={styles.contractDetails}>
              <div className={styles.contractHeader}>
                <div>
                  <span className={styles.contractType}>{caseData.contract.type}</span>
                  <h2 className={styles.contractName}>{caseData.contract.name}</h2>
                </div>
                <div className={styles.contractCaseId}>
                  <span className={styles.caseIdLabel}>CASE</span>
                  <span className={styles.caseIdValue}>{caseData.contract.caseId}</span>
                </div>
              </div>
              <div className={styles.nftMeta}>
                <div className={styles.nftMetaRow}>
                  <span className={styles.metaLabel}>Address</span>
                  <span className={styles.metaValueMono}>{caseData.contract.address.slice(0, 20)}...{caseData.contract.address.slice(-4)}</span>
                </div>
                <div className={styles.nftMetaRow}>
                  <span className={styles.metaLabel}>Status</span>
                  <span className={`${styles.metaValue} ${caseData.contract.status === 'Unverified' ? styles.metaValueWarn : ''}`}>
                    {caseData.contract.status}
                  </span>
                </div>
                <div className={styles.nftMetaRow}>
                  <span className={styles.metaLabel}>Deployer</span>
                  <span className={styles.metaValueMono}>{caseData.contract.deployer}</span>
                </div>
                <div className={styles.nftMetaRow}>
                  <span className={styles.metaLabel}>Deployed</span>
                  <span className={styles.metaValue}>{caseData.contract.deployedAge}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* section tabs */}
        <div className={styles.sectionTabs}>
          <button
            className={`${styles.sectionTab} ${activeSection === 'transactions' ? styles.sectionTabActive : ''}`}
            onClick={() => setActiveSection('transactions')}
          >
            Transactions
            <span className={styles.sectionTabCount}>
              {isCityNodeMode
                ? (currentLocation
                    ? (currentLocation.transactions?.length || 0)
                    : cityLocations.reduce((sum, l) => sum + (l.transactions?.length || 0), 0))
                : transactions.length}
            </span>
          </button>
          <button
            className={`${styles.sectionTab} ${activeSection === 'events' ? styles.sectionTabActive : ''}`}
            onClick={() => setActiveSection('events')}
          >
            Events
            {(() => {
              const count = missionId && missionEvents.length > 0
                ? missionEvents.length
                : events.length
              return count > 0 ? (
                <span className={styles.sectionTabCount}>{count}</span>
              ) : null
            })()}
          </button>
          <button
            className={`${styles.sectionTab} ${activeSection === 'contract' ? styles.sectionTabActive : ''}`}
            onClick={() => setActiveSection('contract')}
          >
            Contract
          </button>
        </div>

        {/* ── TRANSACTIONS TAB ── */}
        {activeSection === 'transactions' && !isCityNodeMode && (
          <div className={styles.txTable}>
            <div className={styles.txTableHead}>
              <span className={styles.thStatus} />
              <span className={styles.thHash}>Tx Hash</span>
              <span className={styles.thMethod}>Method</span>
              <span className={styles.thBlock}>Block</span>
              <span className={styles.thAge}>Age</span>
              <span className={styles.thFrom}>From</span>
              <span className={styles.thArrow} />
              <span className={styles.thTo}>To</span>
              <span className={styles.thValue}>Value</span>
              <span className={styles.thFee}>Tx Fee</span>
            </div>
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className={`
                  ${styles.txTableRow}
                  ${selectedTx === tx.id ? styles.txSelected : ''}
                  ${tourActive && tourStep === 0 && tx.id === 'tx-bridge' ? styles.tourHighlight : ''}
                `}
                data-tour={tx.id === 'tx-bridge' ? 'tx-bridge' : undefined}
                onClick={() => handleTxClick(tx)}
              >
                <span className={styles.tdStatus}>
                  <span className={`${styles.statusDot} ${tx.status === 'success' ? styles.statusSuccess : styles.statusFail}`} />
                </span>
                <span className={styles.tdHash}>{tx.hash}</span>
                <span className={styles.tdMethod}>
                  <span className={styles.methodBadge}>{tx.method}</span>
                </span>
                <span className={styles.tdBlock}>{tx.block}</span>
                <span className={styles.tdAge}>{tx.age}</span>
                <span className={styles.tdFrom}>{tx.from}</span>
                <span className={styles.tdArrow}>
                  <span className={styles.arrowIcon}>&#10132;</span>
                </span>
                <span className={styles.tdTo}>{tx.to}</span>
                <span className={styles.tdValue}>{tx.value}</span>
                <span className={styles.tdFee}>{tx.fee}</span>
              </div>
            ))}
          </div>
        )}

        {/* CityNode transactions: per-location txs with anomaly column */}
        {activeSection === 'transactions' && isCityNodeMode && (
          <div className={`${styles.txTable} ${captureMode ? styles.txTableCapture : ''}`}>
            {(() => {
              const locationScanned = currentLocation
                ? currentLocation.scanned
                : cityLocations.some((l) => l.scanned)
              // tag each tx with its locationIdx so CaptureMode knows which location it belongs to
              const displayTxs = currentLocation
                ? (currentLocation.transactions || []).map(tx => ({ ...tx, _locationIdx: currentLocationIdx }))
                : cityLocations.flatMap((l, li) => (l.transactions || []).map(tx => ({ ...tx, _locationIdx: li })))

              return (
                <>
                  <div className={styles.txTableHead}>
                    <span className={styles.thStatus} />
                    <span className={styles.thHash}>Tx Hash</span>
                    <span className={styles.thMethod}>Method</span>
                    <span className={styles.thBlock}>Block</span>
                    <span className={styles.thFrom}>From</span>
                    <span className={styles.thArrow} />
                    <span className={styles.thTo}>To</span>
                    <span className={styles.thValue}>Value</span>
                    <span className={styles.thMethod}>Anomaly</span>
                  </div>
                  {displayTxs.length === 0 ? (
                    <div className={styles.placeholderSection}>
                      <span className={styles.placeholderIcon}>&#128269;</span>
                      <span>No transactions available.</span>
                    </div>
                  ) : (
                    displayTxs.map((tx, i) => {
                      const hashStr = typeof tx.txHashLike === 'string' ? tx.txHashLike : String(tx.txHashLike)
                      const fromStr = typeof tx.from === 'string' ? tx.from : String(tx.from)
                      const toStr = typeof tx.to === 'string' ? tx.to : String(tx.to)
                      const isCaptureSelected = captureMode && captureSelectedTx?.txHashLike === tx.txHashLike
                      const handleTxClick = captureMode ? () => setCaptureSelectedTx(tx) : undefined
                      return (
                        <div
                          key={i}
                          className={`${styles.txTableRow} ${captureMode ? `${styles.txRowClickable} ${styles.txRowCapture}` : ''} ${isCaptureSelected ? styles.txCaptureSelected : ''}`}
                          onClick={handleTxClick}
                        >
                          <span className={styles.tdStatus}>
                            <span className={`${styles.statusDot} ${styles.statusSuccess}`} />
                          </span>
                          <span className={styles.tdHash}>
                            {hashStr.length > 16 ? `${hashStr.slice(0, 10)}...${hashStr.slice(-4)}` : hashStr}
                          </span>
                          <span className={styles.tdMethod}>
                            <span className={styles.methodBadge}>{tx.methodLabel || 'unknown'}</span>
                          </span>
                          <span className={styles.tdBlock}>{Number(tx.blockLike)}</span>
                          <span className={`${styles.tdFrom} ${captureMode ? styles.walletHighlight : ''}`}>
                            {fromStr.length > 12 ? `${fromStr.slice(0, 8)}...${fromStr.slice(-4)}` : fromStr}
                          </span>
                          <span className={styles.tdArrow}>
                            <span className={styles.arrowIcon}>&#10132;</span>
                          </span>
                          <span className={`${styles.tdTo} ${captureMode ? styles.walletHighlight : ''}`}>
                            {toStr.length > 12 ? `${toStr.slice(0, 8)}...${toStr.slice(-4)}` : toStr}
                          </span>
                          <span className={styles.tdValue}>{tx.valueDisplay || '—'}</span>
                          <span className={styles.tdMethod}>
                            {locationScanned ? (
                              tx.isAnomaly ? (
                                <span className={styles.methodBadge} style={{ backgroundColor: 'rgba(255, 60, 60, 0.15)', color: 'var(--red, #f44)' }}>
                                  {tx.anomalyLabel || ANOMALY_TYPE_MAP[tx.anomalyType] || 'ANOMALY'}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted, #666)' }}>—</span>
                              )
                            ) : (
                              <span className={styles.anomalyUnknown}>?</span>
                            )}
                          </span>
                        </div>
                      )
                    })
                  )}
                </>
              )
            })()}
          </div>
        )}

        {/* ── EVENTS TAB ── */}
        {activeSection === 'events' && (() => {
          const displayEvents = missionId && missionEvents.length > 0
            ? missionEvents
            : events
          return displayEvents.length > 0 ? (
            <div className={styles.eventsTable}>
              {missionId && missionEvents.length > 0 && (
                <div className={styles.eventRow} style={{ borderLeft: '2px solid var(--green, #0f0)' }}>
                  <div className={styles.eventHeader}>
                    <span className={styles.eventName} style={{ color: 'var(--green, #0f0)' }}>
                      LIVE ON-CHAIN EVENTS
                    </span>
                    <span className={styles.eventBlock}>
                      {missionId ? `Mission #${missionId}` : `${cityMeta?.name || ''} [${cityMeta?.chain || ''}]`}
                    </span>
                  </div>
                  <div className={styles.eventData}>
                    <div className={styles.eventDataRow}>
                      <span className={styles.eventDataKey}>contract</span>
                      <span className={styles.eventDataValue}>
                        {isCityNodeMode ? `${cityMeta.chain}` : 'GameMaster (Sepolia)'}
                      </span>
                    </div>
                    <div className={styles.eventDataRow}>
                      <span className={styles.eventDataKey}>events</span>
                      <span className={styles.eventDataValue}>{missionEvents.length} recorded</span>
                    </div>
                  </div>
                </div>
              )}
              {[...displayEvents].reverse().map((evt, i) => (
                <div key={i} className={styles.eventRow}>
                  <div className={styles.eventHeader}>
                    <span
                      className={styles.eventName}
                      style={{ color: `var(--${evt.color || 'cyan'})` }}
                    >
                      {evt.name}
                    </span>
                    <span className={styles.eventBlock}>Block {evt.block}</span>
                  </div>
                  <div className={styles.eventData}>
                    {Object.entries(evt.data).map(([key, val]) => (
                      <div key={key} className={styles.eventDataRow}>
                        <span className={styles.eventDataKey}>{key}</span>
                        <span className={styles.eventDataValue}>
                          {typeof val === 'number' ? (
                            <span className={
                              val >= 70 ? styles.strengthHot :
                              val >= 40 ? styles.strengthWarm :
                              styles.strengthCold
                            }>
                              {val}
                            </span>
                          ) : String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.placeholderSection}>
              <span className={styles.placeholderIcon}>&#128276;</span>
              <span>Event logs will appear here as you investigate.</span>
            </div>
          )
        })()}

        {/* ── CONTRACT TAB ── */}
        {activeSection === 'contract' && !isCityNodeMode && (
          <div className={styles.placeholderSection}>
            <span className={styles.placeholderIcon}>&#128196;</span>
            <span>Contract source code — access restricted. Investigate to unlock.</span>
          </div>
        )}

        {activeSection === 'contract' && isCityNodeMode && (
          <div className={styles.contractMethodsSection}>
            {/* ── Read Methods ── */}
            <div className={styles.methodGroupHeader}>READ METHODS</div>

            {[
              { name: 'getLocationMeta', sig: `getLocationMeta(${currentLocationIdx ?? 0})`, desc: 'Current location info' },
              ...(currentLocation?.scanned ? [{ name: 'getAnomalyTxRefs', sig: 'getAnomalyTxRefs(0, 20)', desc: 'Anomaly transaction list' }] : []),
            ].map((method) => (
              <div key={method.name} className={styles.methodCard}>
                <div className={styles.methodCardHeader}>
                  <span className={styles.methodSig}>{method.sig}</span>
                  <span className={styles.methodDesc}>{method.desc}</span>
                </div>
                <button
                  className={styles.methodQueryBtn}
                  onClick={() => handleReadMethod(method.name)}
                  disabled={readLoading[method.name]}
                >
                  {readLoading[method.name] ? 'QUERYING...' : 'QUERY'}
                </button>
                {readResults[method.name] && (() => {
                  const hasError = readResults[method.name]?.error
                  const narrative = method.name === 'getLocationMeta'
                    ? getLocationNarrative(currentCityId, currentLocationIdx ?? 0)
                    : method.name === 'getAnomalyTxRefs'
                      ? buildAnomalyNarrative(readResults[method.name])
                      : null
                  const mode = readViewMode[method.name] || 'analysis'
                  const showAnalysis = narrative && mode === 'analysis' && !hasError

                  return (
                    <div className={styles.methodResultWrap}>
                      {narrative && !hasError && (
                        <div className={styles.resultToggle}>
                          <button
                            className={`${styles.toggleBtn} ${mode === 'analysis' ? styles.toggleActive : ''}`}
                            onClick={() => setReadViewMode((s) => ({ ...s, [method.name]: 'analysis' }))}
                          >
                            ANALYSIS
                          </button>
                          <button
                            className={`${styles.toggleBtn} ${mode === 'raw' ? styles.toggleActive : ''}`}
                            onClick={() => setReadViewMode((s) => ({ ...s, [method.name]: 'raw' }))}
                          >
                            RAW
                          </button>
                        </div>
                      )}
                      {showAnalysis ? (
                        <div className={styles.analysisResult}>
                          <div className={styles.analysisHeader}>
                            <span className={styles.analysisTitle}>{narrative.title}</span>
                            <span
                              className={styles.analysisStatus}
                              style={{ color: `var(--${narrative.statusColor})` }}
                            >
                              {narrative.status}
                            </span>
                          </div>
                          <p className={styles.analysisText}>{narrative.analysis}</p>
                        </div>
                      ) : (
                        <pre className={styles.methodResult}>
                          {hasError
                            ? `Error: ${readResults[method.name].error}`
                            : JSON.stringify(readResults[method.name], (_, v) =>
                                typeof v === 'bigint' ? v.toString() : v, 2
                              )
                          }
                        </pre>
                      )}
                    </div>
                  )
                })()}
              </div>
            ))}

            {/* ── Write Methods — Location level ── */}
            <div className={styles.methodGroupHeader}>
              WRITE METHODS {currentLocation ? `— ${currentLocation.name}` : '— LOCATION'}
            </div>

            {currentLocationIdx !== null && currentLocation ? (
              <>
                {/* requestClue */}
                <div className={styles.methodCard}>
                  <div className={styles.methodCardHeader}>
                    <span className={styles.methodSig}>requestClue({currentLocationIdx})</span>
                    <span className={styles.methodDesc}>{currentLocation.name} — 2 BLOCKS</span>
                  </div>
                  <button
                    className={`${styles.methodExecBtn} ${currentLocation.clueSlots?.[0] ? styles.methodDone : ''}`}
                    onClick={() => gameplayRequestClue(currentLocationIdx, 0)}
                    disabled={currentLocation.clueSlots?.[0] !== null}
                  >
                    {currentLocation.clueSlots?.[0] ? 'RESOLVED' : 'EXECUTE'}
                  </button>
                </div>

                {/* scanAnomalies */}
                <div className={styles.methodCard}>
                  <div className={styles.methodCardHeader}>
                    <span className={styles.methodSig}>scanAnomalies({currentLocationIdx})</span>
                    <span className={styles.methodDesc}>{currentLocation.name} — 2 BLOCKS</span>
                  </div>
                  <button
                    className={`${styles.methodExecBtn} ${currentLocation.scanned ? styles.methodDone : ''}`}
                    onClick={() => gameplayScanAnomalies(currentLocationIdx)}
                    disabled={currentLocation.scanned}
                  >
                    {currentLocation.scanned ? 'SCANNED' : 'EXECUTE'}
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.placeholderSection}>
                <span className={styles.placeholderIcon}>&#128205;</span>
                <span>Select a location on the MAP to access its contract methods.</span>
              </div>
            )}
          </div>
        )}

        {/* tx detail expand (legacy mode only) */}
        {selectedTxData && !isCityNodeMode && (
          <div className={styles.txDetail}>
            <div className={styles.txDetailHeader}>
              <span className={styles.txDetailTitle}>TRANSACTION DETAILS</span>
              <button className={styles.txDetailClose} onClick={() => setSelectedTx(null)}>&#10005;</button>
            </div>
            <div className={styles.txDetailBody}>
              <div className={styles.txDetailRow}>
                <span className={styles.txDetailLabel}>Transaction Hash</span>
                <span className={styles.txDetailValueMono}>{selectedTxData.fullHash.slice(0, 30)}...</span>
              </div>
              <div className={styles.txDetailRow}>
                <span className={styles.txDetailLabel}>Status</span>
                <span className={`${styles.txDetailValue} ${styles.statusText}`}>&#9679; Success</span>
              </div>
              <div className={styles.txDetailRow}>
                <span className={styles.txDetailLabel}>Block</span>
                <span className={styles.txDetailValue}>{selectedTxData.block}</span>
              </div>
              <div className={styles.txDetailRow}>
                <span className={styles.txDetailLabel}>From</span>
                <span className={styles.txDetailValueMono}>{selectedTxData.from}</span>
              </div>
              <div className={styles.txDetailRow}>
                <span className={styles.txDetailLabel}>To</span>
                <span className={styles.txDetailValueMono}>{selectedTxData.to}</span>
              </div>
              <div className={styles.txDetailRow}>
                <span className={styles.txDetailLabel}>Method</span>
                <span className={styles.txDetailValue}>{selectedTxData.method}</span>
              </div>
              <div className={styles.txDetailRow}>
                <span className={styles.txDetailLabel}>Tx Fee</span>
                <span className={styles.txDetailValue}>{selectedTxData.fee}</span>
              </div>
              {selectedTxData.bridgeDetails && (
                <>
                  <div className={styles.txDetailRow}>
                    <span className={styles.txDetailLabel}>Destination Chain</span>
                    <span className={styles.txDetailValueBridge}>{selectedTxData.bridgeDetails.destinationChain}</span>
                  </div>
                  <div className={styles.txDetailRow}>
                    <span className={styles.txDetailLabel}>Bridge ID</span>
                    <span className={styles.txDetailValueMono}>{selectedTxData.bridgeDetails.bridgeId}</span>
                  </div>
                  <div className={styles.txDetailRow}>
                    <span className={styles.txDetailLabel}>Origin Token</span>
                    <span className={styles.txDetailValue}>{selectedTxData.bridgeDetails.originToken}</span>
                  </div>
                  <div className={styles.txDetailRow}>
                    <span className={styles.txDetailLabel}>Status</span>
                    <span className={styles.txDetailValueLocked}>{selectedTxData.bridgeDetails.status}</span>
                  </div>
                </>
              )}
            </div>
            <button
              className={`${styles.investigateBtn} ${tourActive && tourStep === 1 ? styles.tourHighlight : ''}`}
              data-tour="investigate-btn"
              disabled={gas < selectedTxData.gasCost || investigatedTxs.has(selectedTxData.id)}
              onClick={() => handleInvestigate(selectedTxData)}
            >
              {investigatedTxs.has(selectedTxData.id)
                ? 'INVESTIGATED'
                : `INVESTIGATE (${selectedTxData.gasCost} GAS)`}
            </button>
          </div>
        )}
      </div>

      {/* investigation modal (legacy) */}
      {investigationModal && (
        <div className={styles.investModalOverlay} onClick={() => setInvestigationModal(null)}>
          <div className={styles.investModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.investModalHeader}>
              <span className={styles.investModalTitle}>{investigationModal.investigation.title}</span>
              <span className={styles.investModalMethod}>{investigationModal.method}</span>
            </div>
            <div className={styles.investModalBody}>
              <p className={styles.investModalInsight}>{investigationModal.investigation.insight}</p>
              {investigationModal.investigation.audioSrc && (
                <div className={styles.audioHint}>
                  <span className={styles.audioHintIcon}>&#128266;</span>
                  <span className={styles.audioHintText}>ENCRYPTED AUDIO DETECTED — add to evidence to decrypt and listen</span>
                </div>
              )}
              <div className={styles.investModalMeta}>
                <span>Tx: {investigationModal.hash}</span>
                <span>Block: {investigationModal.block}</span>
              </div>
            </div>
            <div className={styles.investModalActions}>
              <button
                className={styles.investModalClose}
                onClick={() => setInvestigationModal(null)}
              >
                CLOSE
              </button>
              {investigationModal.investigation.evidenceName && (
                <button
                  className={`${styles.investModalEvidence} ${tourActive && tourStep === 2 ? styles.tourHighlight : ''}`}
                  data-tour="add-evidence"
                  onClick={() => handleAddEvidence(investigationModal)}
                >
                  + ADD TO EVIDENCE
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
