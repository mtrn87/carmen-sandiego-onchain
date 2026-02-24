import { useGameStore } from '../store/gameStore'
import { CITY_MAP } from '../services/contractService'
import LocationDetail from './LocationDetail'
import EvidencePanel from './EvidencePanel'
import styles from './CityView.module.css'

const RISK_COLORS = ['var(--green)', 'var(--green)', 'var(--yellow)', 'var(--yellow)', 'var(--red)', 'var(--red)']

export default function CityView() {
  const {
    currentCityId,
    currentCityInfo,
    cityLocations,
    cityAnomalyTxRefs,
    currentLocationIdx,
    selectLocation,
    backToMap,
    cityViewTab,
    setCityViewTab,
    gameplayLoading,
    gameplayInspectLocation,
    gameplayScanAnomalies,
    gameplayRequestClue,
  } = useGameStore()

  if (!currentCityId || !currentCityInfo) return null

  const city = CITY_MAP[currentCityId]
  const cityName = city?.name || currentCityInfo.city
  const cityChain = city?.chain || `Chain ${currentCityId}`
  const cityColor = city?.color || '#00f0ff'

  // if a location is selected, show LocationDetail
  if (currentLocationIdx !== null) {
    return (
      <div className={styles.container}>
        <div className={styles.topBar} style={{ '--city-color': cityColor }}>
          <div className={styles.topBarLeft}>
            <div className={styles.cityDot} style={{ backgroundColor: cityColor, boxShadow: `0 0 6px ${cityColor}` }} />
            <span className={styles.cityLabel}>{cityName}</span>
            <span className={styles.sep}>|</span>
            <span className={styles.chainLabel}>{cityChain}</span>
            <span className={styles.sep}>|</span>
            <span className={styles.explorerLabel}>LOCATION DETAIL</span>
          </div>
          <div className={styles.topBarRight}>
          </div>
        </div>
        <div className={styles.content}>
          <LocationDetail />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* top bar */}
      <div className={styles.topBar} style={{ '--city-color': cityColor }}>
        <div className={styles.topBarLeft}>
          <button className={styles.backBtn} onClick={backToMap}>&#9664; MAP</button>
          <div className={styles.cityDot} style={{ backgroundColor: cityColor, boxShadow: `0 0 6px ${cityColor}` }} />
          <span className={styles.cityLabel}>{cityName}</span>
          <span className={styles.sep}>|</span>
          <span className={styles.chainLabel}>{cityChain}</span>
          <span className={styles.sep}>|</span>
          <span className={styles.suspicionBadge}>
            SUSPICION: {currentCityInfo.suspicionLevel}%
          </span>
        </div>
        <div className={styles.topBarRight}>
          <EnergyDisplay />
        </div>
      </div>

      {/* tabs */}
      <div className={styles.tabs}>
        {['overview', 'contracts', 'evidence'].map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${cityViewTab === tab ? styles.tabActive : ''}`}
            onClick={() => setCityViewTab(tab)}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* loading overlay */}
      {gameplayLoading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>Loading city data...</span>
        </div>
      )}

      {/* tab content */}
      <div className={styles.content}>
        {cityViewTab === 'overview' && (
          <div className={styles.overviewContent}>
            {/* city info */}
            <div className={styles.cityInfoCard}>
              <div className={styles.cityInfoHeader}>
                <span className={styles.cityEmoji}>{city?.emoji}</span>
                <div>
                  <h2 className={styles.cityName}>{cityName}</h2>
                  <span className={styles.cityCountry}>{currentCityInfo.countryCode}</span>
                </div>
                <div className={styles.suspicionMeter}>
                  <span className={styles.suspicionLabel}>SUSPICION</span>
                  <div className={styles.suspicionBar}>
                    <div
                      className={styles.suspicionFill}
                      style={{
                        width: `${currentCityInfo.suspicionLevel}%`,
                        background: currentCityInfo.suspicionLevel >= 70 ? 'var(--red)' : currentCityInfo.suspicionLevel >= 40 ? 'var(--yellow)' : 'var(--green)',
                      }}
                    />
                  </div>
                  <span className={styles.suspicionValue}>{currentCityInfo.suspicionLevel}%</span>
                </div>
              </div>
            </div>

            {/* locations list */}
            <div className={styles.locationsList}>
              <span className={styles.sectionTitle}>LOCATIONS ({cityLocations.length})</span>
              {cityLocations.map((loc, i) => (
                <div
                  key={i}
                  className={styles.locationCard}
                  onClick={() => selectLocation(i)}
                >
                  <div className={styles.locationMain}>
                    <div className={styles.locationInfo}>
                      <span className={styles.locationName}>{loc.name}</span>
                      <span className={styles.locationCategory}>{loc.categoryLabel}</span>
                    </div>
                    <div className={styles.locationMeta}>
                      <span className={styles.locationRisk} style={{ color: RISK_COLORS[loc.riskLevel] || 'var(--text-muted)' }}>
                        RISK {loc.riskLevel}/5
                      </span>
                      <div className={styles.locationStatus}>
                        {loc.inspected && <span className={styles.statusDot} data-status="inspected" />}
                        {loc.scanned && <span className={styles.statusDot} data-status="scanned" />}
                        {loc.clueSlots?.some(Boolean) && <span className={styles.statusDot} data-status="clues" />}
                      </div>
                    </div>
                  </div>
                  <span className={styles.locationArrow}>&#10132;</span>
                </div>
              ))}
            </div>

            {/* anomaly tx refs preview — only after scanning */}
            {cityLocations.some((l) => l.scanned) && cityAnomalyTxRefs.length > 0 && (
              <div className={styles.anomalyPreview}>
                <span className={styles.sectionTitle}>ANOMALY TX REFS ({cityAnomalyTxRefs.length})</span>
                <div className={styles.txRefList}>
                  {cityAnomalyTxRefs.slice(0, 4).map((tx, i) => (
                    <div key={i} className={styles.txRefRow}>
                      <span className={styles.txRefHash}>{typeof tx.txHashLike === 'string' && tx.txHashLike.length > 16 ? `${tx.txHashLike.slice(0, 10)}...${tx.txHashLike.slice(-4)}` : tx.txHashLike}</span>
                      <span className={styles.txRefMethod}>{tx.methodLabel || tx.methodSigLike}</span>
                      <span className={styles.txRefFrom}>{typeof tx.from === 'string' && tx.from.length > 16 ? `${tx.from.slice(0, 8)}...${tx.from.slice(-4)}` : tx.from}</span>
                    </div>
                  ))}
                  {cityAnomalyTxRefs.length > 4 && (
                    <span className={styles.txRefMore}>
                      +{cityAnomalyTxRefs.length - 4} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {cityViewTab === 'contracts' && (
          <div className={styles.contractsContent}>
            <span className={styles.sectionTitle}>INVESTIGATION METHODS</span>
            <div className={styles.methodsList}>
              {cityLocations.map((loc, i) => (
                <div key={i} className={styles.methodGroup}>
                  <span className={styles.methodGroupTitle}>{loc.name}</span>
                  <div className={styles.methodBtns}>
                    <button
                      className={`${styles.methodBtn} ${loc.inspected ? styles.methodDone : ''}`}
                      disabled={loc.inspected}
                      onClick={() => gameplayInspectLocation(i)}
                    >
                      inspectLocation({i}) — 1 E
                    </button>
                    <button
                      className={`${styles.methodBtn} ${loc.scanned ? styles.methodDone : ''}`}
                      disabled={!loc.inspected || loc.scanned}
                      onClick={() => gameplayScanAnomalies(i)}
                    >
                      scanAnomalies({i}) — 2 E
                    </button>
                    {[0, 1, 2].map((ci) => (
                      <button
                        key={ci}
                        className={`${styles.methodBtn} ${loc.clueSlots[ci] ? styles.methodDone : ''}`}
                        disabled={!loc.scanned || loc.clueSlots[ci] !== null}
                        onClick={() => gameplayRequestClue(i, ci)}
                      >
                        requestClue({i}, {ci}) — 2 E
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {cityViewTab === 'evidence' && (
          <EvidencePanel />
        )}
      </div>
    </div>
  )
}
