import { useState, useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { CHAIN_CONFIG, CASE_DATA, DEFAULT_CASE } from '../data/contractData'
import styles from './ContractExplorer.module.css'

export default function ContractExplorer({ onOpenMap }) {
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
  } = useGameStore()

  const [selectedTx, setSelectedTx] = useState(null)
  const [activeSection, setActiveSection] = useState('transactions')
  const [investigationModal, setInvestigationModal] = useState(null)
  const [investigatedTxs, setInvestigatedTxs] = useState(new Set())

  // reset state when case changes
  useEffect(() => {
    setSelectedTx(null)
    setActiveSection('transactions')
    setInvestigationModal(null)
  }, [currentCase])

  const caseData = CASE_DATA[currentCase] || CASE_DATA[DEFAULT_CASE]
  const chain = CHAIN_CONFIG[caseData.chain] || CHAIN_CONFIG['BNB Chain']
  const transactions = caseData.transactions
  const events = caseData.events || []

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

  const selectedTxData = transactions.find((t) => t.id === selectedTx)

  return (
    <div className={styles.explorer} data-tour="explorer">
      {/* top bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
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
        </div>
        <div className={styles.topBarRight}>
          <div className={`${styles.gasInfo} ${gasFlash ? styles.gasFlash : ''}`}>
            <span className={styles.gasLabel}>GAS</span>
            <span className={styles.gasValue}>{gas}</span>
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
        {/* header card — NFT or Contract depending on case */}
        {caseData.headerType === 'nft' && caseData.nft && (
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

        {caseData.headerType === 'contract' && caseData.contract && (
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
            <span className={styles.sectionTabCount}>{transactions.length}</span>
          </button>
          <button
            className={`${styles.sectionTab} ${activeSection === 'events' ? styles.sectionTabActive : ''}`}
            onClick={() => setActiveSection('events')}
          >
            Events
            {events.length > 0 && (
              <span className={styles.sectionTabCount}>{events.length}</span>
            )}
          </button>
          <button
            className={`${styles.sectionTab} ${activeSection === 'contract' ? styles.sectionTabActive : ''}`}
            onClick={() => setActiveSection('contract')}
          >
            Contract
          </button>
        </div>

        {/* transactions table */}
        {activeSection === 'transactions' && (
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

        {/* events tab */}
        {activeSection === 'events' && (
          events.length > 0 ? (
            <div className={styles.eventsTable}>
              {[...events].reverse().map((evt, i) => (
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
        )}

        {activeSection === 'contract' && (
          <div className={styles.placeholderSection}>
            <span className={styles.placeholderIcon}>&#128196;</span>
            <span>Contract source code — access restricted. Investigate to unlock.</span>
          </div>
        )}

        {/* tx detail expand */}
        {selectedTxData && (
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

      {/* investigation modal */}
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
