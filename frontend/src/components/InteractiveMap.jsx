import { useRef, useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import styles from './InteractiveMap.module.css'

const SCAN_COST = 30

const MAP_LOCATIONS = [
  {
    id: 421614,
    name: 'Tokyo',
    flag: '\u{1F5FE}',
    chain: 'Arbitrum Sepolia',
    chainColor: '#28A0F0',
    chainIcon: '/blockchain_icon/arbitrum.png',
    image: '/tokyo.png',
    coords: { left: '83%', top: '34%' },
    cases: [
      {
        id: 'tokyo-sensoji',
        name: 'Senso-ji Temple Node',
        type: 'Bridge Relay',
        status: 'active',
        description: 'A bridge relay hidden near the ancient Senso-ji temple. Cross-chain asset ingress detected.',
        image: '/tokyo_1.png',
        chainId: 421614,
      },
      {
        id: 'tokyo-tower',
        name: 'Tokyo Tower Beacon',
        type: 'Signal Router',
        status: 'active',
        description: 'A signal router broadcasting from the Tokyo Tower node. Encrypted transmissions intercepted.',
        image: '/tokyo_2.png',
        chainId: 421614,
      },
      {
        id: 'tokyo-chochin',
        name: 'Chochin Market',
        type: 'Swap Protocol',
        status: 'active',
        description: 'A swap protocol operating under the Chochin lantern district. High-frequency token swaps obscuring stolen assets.',
        image: '/tokyo_3.png',
        chainId: 421614,
      },
    ],
  },
  {
    id: 84532,
    name: 'Paris',
    flag: '\u{1F5FC}',
    chain: 'Base Sepolia',
    chainColor: '#0052FF',
    chainIcon: '/blockchain_icon/base.png',
    image: '/dubai.png',
    coords: { left: '47%', top: '30%' },
    cases: [
      {
        id: 'paris-eiffel',
        name: 'Eiffel Tower Relay',
        type: 'Monitoring Contract',
        status: 'active',
        description: 'A monitoring beacon deployed near the Eiffel Tower node. Bridge ingress detected from Arbitrum.',
        image: '/dubai_1.png',
        chainId: 84532,
      },
      {
        id: 'paris-louvre',
        name: 'Louvre Custody Router',
        type: 'Custody Protocol',
        status: 'active',
        description: 'A custody router at the Louvre node. High-value cross-chain asset arrival confirmed.',
        image: '/dubai_2.png',
        chainId: 84532,
      },
      {
        id: 'paris-market',
        name: 'Marais Market',
        type: 'Market Router',
        status: 'active',
        description: 'A bustling marketplace router. Heavy transaction volume may be hiding suspicious activity.',
        image: '/dubai_3.png',
        chainId: 84532,
      },
    ],
  },
  {
    id: 51,
    name: 'London',
    flag: '\u{1F3A1}',
    chain: 'XDC Apothem',
    chainColor: '#FF6B00',
    chainIcon: '/blockchain_icon/bnb.png',
    image: '/shangai.png',
    coords: { left: '45%', top: '25%' },
    cases: [
      {
        id: 'london-bridge',
        name: 'Tower Bridge Node',
        type: 'Cross-Chain Bridge',
        status: 'active',
        description: 'A cross-chain bridge relay near Tower Bridge. High-value transfers routed through multiple hops.',
        image: '/shanghai_1.png',
        chainId: 51,
      },
    ],
  },
]

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
    investigate,
    gas,
    missionId,
    blocksElapsed,
    carmenMovedAlert,
  } = useGameStore()

  const blockColor = blocksElapsed <= 20 ? 'green' : blocksElapsed <= 35 ? 'yellow' : 'red'

  const [selectedMarker, setSelectedMarker] = useState(null)

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
      {MAP_LOCATIONS.map((loc) => {
        const isScanned = scannedLocations.includes(loc.id)
        return (
          <div
            key={loc.id}
            className={`${styles.entityMarker} ${selectedMarker === loc.id ? styles.entityMarkerActive : ''} ${!isScanned ? styles.entityMarkerLocked : ''}`}
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
        const loc = MAP_LOCATIONS.find((l) => l.id === selectedMarker)
        if (!loc) return null
        const isScanned = scannedLocations.includes(loc.id)
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
                  disabled={isScanning || gas < SCAN_COST}
                  onClick={(e) => {
                    e.stopPropagation()
                    scanLocation(loc.id, SCAN_COST)
                  }}
                >
                  {isScanning ? (
                    <>
                      <span className={styles.scanBtnSpinner} />
                      SCANNING...
                    </>
                  ) : (
                    <>&#9211; SCAN NETWORK &mdash; {SCAN_COST} GAS</>
                  )}
                </button>
                {gas < SCAN_COST && !isScanning && (
                  <span className={styles.scanNoGas}>INSUFFICIENT GAS</span>
                )}
              </div>
            ) : (
              <div className={styles.locationPanelContent}>
                {/* On-chain investigation button */}
                <button
                  className={`${styles.investigateBtn} ${isInvestigating ? styles.investigateBtnDisabled : ''}`}
                  style={{ '--chain-color': loc.chainColor }}
                  disabled={isInvestigating || !missionId}
                  onClick={(e) => {
                    e.stopPropagation()
                    investigate(loc.id)
                  }}
                >
                  {isInvestigating
                    ? '&#9203; INVESTIGATING...'
                    : !missionId
                      ? '&#9888; START MISSION FIRST'
                      : `&#128269; INVESTIGATE ${loc.name.toUpperCase()}`}
                </button>

                <div className={styles.locationPanelTitle}>
                  <span>CONTRACTS FOUND</span>
                  <span className={styles.locationPanelCount}>{loc.cases.length}</span>
                </div>
                <div className={styles.locationPanelCases}>
                  {loc.cases.map((c) => (
                    <div
                      key={c.id}
                      className={styles.caseCard}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedMarker(null)
                        onSelectCase?.(c)
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
