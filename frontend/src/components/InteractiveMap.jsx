import { useRef, useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { CITY_POOL, CITY_POOL_MAP } from '../data/cityRegistry'
import styles from './InteractiveMap.module.css'

const SCAN_COST = 30

export default function InteractiveMap({ onSelectCase }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const {
    locations,
    showClueModal,
    activeClue,
    closeClueModal,
    isInvestigating,
    scannedLocations,
    isScanning,
    scanLocation,
    scanAndInspect,
    investigate,
    gas,
    missionId,
    blocksElapsed,
    carmenMovedAlert,
    discoveredCityIds,
    visitedCityIds,
  } = useGameStore()

  const blockColor = blocksElapsed <= 20 ? 'green' : blocksElapsed <= 35 ? 'yellow' : 'red'

  const [selectedMarker, setSelectedMarker] = useState(null)
  const mapLocations = discoveredCityIds && discoveredCityIds.length > 0
    ? CITY_POOL.filter((c) => discoveredCityIds.includes(c.id))
    : CITY_POOL

  // background canvas animation
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animId
    let t = 0

    const resize = () => {
      const rect = containerRef.current.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      t += 0.003
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)

      // grid
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)'
      ctx.lineWidth = 1
      const gridSize = 50
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      // connection lines between nodes
      locations.forEach((loc) => {
        loc.connections.forEach((connId) => {
          const target = locations.find((l) => l.id === connId)
          if (!target) return

          const x1 = (loc.coords.x / 100) * width
          const y1 = (loc.coords.y / 100) * height
          const x2 = (target.coords.x / 100) * width
          const y2 = (target.coords.y / 100) * height

          // animated dashed line
          ctx.save()
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)'
          ctx.lineWidth = 1
          ctx.setLineDash([6, 8])
          ctx.lineDashOffset = -t * 80
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()
          ctx.restore()

          // data packet traveling along the line
          const packetT = (t * 0.5 + loc.coords.x * 0.01) % 1
          const px = x1 + (x2 - x1) * packetT
          const py = y1 + (y2 - y1) * packetT
          ctx.fillStyle = 'rgba(0, 240, 255, 0.3)'
          ctx.fillRect(px - 2, py - 2, 4, 4)
        })
      })

      // random floating data fragments
      for (let i = 0; i < 15; i++) {
        const fx = ((i * 173.7 + t * 20) % width)
        const fy = ((i * 83.1 + t * 10 + Math.sin(t * 2 + i) * 15) % height)
        ctx.fillStyle = `rgba(0, 240, 255, ${0.08 + Math.sin(t * 3 + i) * 0.04})`
        ctx.font = '8px monospace'
        ctx.fillText(['0x', 'ff', 'a3', '7b', '00', '1e'][i % 6], fx, fy)
      }

      animId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [locations])

  return (
    <div className={styles.mapContainer} ref={containerRef}>
      {/* worldmap background */}
      <img src="/worldmap.png" alt="" className={styles.worldmapBg} />

      {/* background canvas */}
      <canvas ref={canvasRef} className={styles.canvas} />

      {/* blockchain entities on map */}
      {mapLocations.map((loc) => {
        const isScanned = loc.alwaysScanned || scannedLocations.includes(loc.id)
        return (
          <div
            key={loc.id}
            className={`${styles.entityMarker} ${selectedMarker === loc.id ? styles.entityMarkerActive : ''} ${!isScanned ? styles.entityMarkerLocked : ''} ${visitedCityIds?.includes(loc.id) ? styles.entityMarkerVisited : ''} ${discoveredCityIds?.includes(loc.id) && !scannedLocations.includes(loc.id) && !visitedCityIds?.includes(loc.id) ? styles.entityMarkerNew : ''}`}
            style={{ left: loc.coords.left, top: loc.coords.top, '--chain-color': loc.chainColor }}
            onClick={() => setSelectedMarker(selectedMarker === loc.id ? null : loc.id)}
          >
            <div className={styles.entityPulse} />
            <div className={styles.entityIcon}>
              <img src={loc.chainIcon} alt={loc.chain} />
            </div>
            <span className={styles.entityLabel}>{loc.flag} {loc.name}</span>
          </div>
        )
      })}

      {/* location panel */}
      {selectedMarker && (() => {
        const loc = mapLocations.find((l) => l.id === selectedMarker)
        if (!loc) return null
        const isScanned = loc.alwaysScanned || scannedLocations.includes(loc.id)
        const isCityNodeCity = CITY_POOL_MAP[loc.id] !== undefined
        return (
          <div className={styles.locationPanel} style={{ '--chain-color': loc.chainColor }}>
            <div className={styles.locationPanelImage}>
              <img src={loc.image} alt={loc.name} />
              <div className={styles.locationPanelImageOverlay} />
              <div className={styles.locationPanelBadge}>
                <span>{loc.flag}</span>
                <span>{loc.name}</span>
                <span className={styles.locationPanelChain} style={{ color: loc.chainColor }}>{loc.chain}</span>
              </div>
            </div>

            {!isScanned ? (
              <div className={styles.scanSection}>
                <div className={styles.scanInfo}>
                  <span className={styles.scanIcon}>&#128225;</span>
                  <span className={styles.scanTitle}>UNCHARTED NETWORK</span>
                  <span className={styles.scanDesc}>
                    Scan this network to discover suspicious contracts.
                  </span>
                </div>
                <button
                  className={`${styles.scanBtn} ${isScanning ? styles.scanBtnDisabled : ''}`}
                  style={{ '--chain-color': loc.chainColor }}
                  disabled={isScanning || (!isCityNodeCity && gas < SCAN_COST)}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isCityNodeCity) {
                      scanAndInspect(loc.id)
                    } else {
                      scanLocation(loc.id, SCAN_COST)
                    }
                  }}
                >
                  {isScanning ? (
                    <>
                      <span className={styles.scanBtnSpinner} />
                      SCANNING...
                    </>
                  ) : isCityNodeCity ? (
                    <>&#9211; SCAN NETWORK &mdash; 1 BLOCK</>
                  ) : (
                    <>&#9211; SCAN NETWORK &mdash; {SCAN_COST} GAS</>
                  )}
                </button>
                {false /* blocks always available */}
                {!isCityNodeCity && gas < SCAN_COST && !isScanning && (
                  <span className={styles.scanNoGas}>INSUFFICIENT GAS</span>
                )}
              </div>
            ) : (
              <div className={styles.locationPanelContent}>
                <div className={styles.locationPanelTitle}>
                  <span>{isCityNodeCity ? 'LOCATIONS UNLOCKED' : 'CONTRACTS FOUND'}</span>
                  <span className={styles.locationPanelCount}>{loc.cases.length}</span>
                </div>
                <div className={styles.locationPanelCases}>
                  {loc.cases.map((c, caseIdx) => (
                    <div
                      key={c.id}
                      className={styles.caseCard}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedMarker(null)
                        onSelectCase?.({ ...c, cityId: loc.id, locationIdx: caseIdx })
                      }}
                    >
                      <div className={styles.caseImageWrap}>
                        <img src={c.image} alt={c.name} className={styles.caseImage} />
                      </div>
                      <div className={styles.caseInfo}>
                        <span className={styles.caseType}>{c.type}</span>
                        <span className={styles.caseName}>{c.name}</span>
                        <span className={styles.caseDesc}>{c.description}</span>
                      </div>
                      <div className={styles.caseArrow}>&#10132;</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className={styles.locationPanelClose} onClick={() => setSelectedMarker(null)}>
              CLOSE
            </button>
          </div>
        )
      })()}

      {/* CRT overlay */}
      <div className={styles.crtOverlay} />

      {/* investigating overlay */}
      {isInvestigating && (
        <div className={styles.investigatingOverlay}>
          <div className={styles.investigatingContent}>
            <div className={styles.scanLine} />
            <span className={styles.investigatingText}>INVESTIGATING...</span>
            <span className={styles.investigatingSub}>
              Waiting for CRE workflow response
            </span>
          </div>
        </div>
      )}

      {/* clue modal */}
      {showClueModal && activeClue && (
        <div className={styles.clueOverlay} onClick={closeClueModal}>
          <div className={styles.clueModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.clueHeader}>
              <span className={styles.clueIcon}>&#128266;</span>
              <span>DECRYPTED AUDIO CLUE</span>
            </div>
            <div className={styles.clueBody}>
              {/* fake audio waveform */}
              <div className={styles.waveform}>
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    key={i}
                    className={styles.waveBar}
                    style={{
                      height: `${20 + Math.sin(i * 0.5 + Date.now() * 0.003) * 30}%`,
                      animationDelay: `${i * 0.05}s`,
                    }}
                  />
                ))}
              </div>
              <p className={styles.clueText}>{activeClue.text}</p>
            </div>
            <button className={styles.clueClose} onClick={closeClueModal}>
              &gt; ACKNOWLEDGE
            </button>
          </div>
        </div>
      )}

      {/* map label */}
      <div className={styles.mapLabel}>
        <span>WEB3 NETWORK MAP</span>
        <span className={styles.mapLabelSub}>MULTI-CHAIN TOPOLOGY</span>
      </div>

      {/* carmen moved alert */}
      {carmenMovedAlert && (
        <div className={styles.carmenAlert}>
          <div className={styles.carmenAlertContent}>
            <span className={styles.carmenAlertIcon}>&#9888;</span>
            <span className={styles.carmenAlertTitle}>CARMEN HAS MOVED</span>
            <span className={styles.carmenAlertSub}>Target hash updated &mdash; previous intel may be outdated</span>
          </div>
        </div>
      )}

      {/* block counter */}
      {missionId && (
        <div className={`${styles.blockCounter} ${styles[`blockCounter_${blockColor}`]}`}>
          <span className={styles.blockCounterIcon}>&#9638;</span>
          <div className={styles.blockCounterInfo}>
            <span className={styles.blockCounterValue}>{blocksElapsed}</span>
            <span className={styles.blockCounterLabel}>BLOCKS</span>
          </div>
        </div>
      )}
    </div>
  )
}
