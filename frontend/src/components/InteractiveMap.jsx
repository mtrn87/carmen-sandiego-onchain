import { useRef, useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { PLATFORM_CITY_OPTIONS } from '../data/contractData'
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
    id: 4216141,
    name: 'Ottawa',
    flag: '\u{1F1E8}\u{1F1E6}',
    chain: 'Arbitrum Sepolia',
    chainColor: '#28A0F0',
    chainIcon: '/blockchain_icon/arbitrum.png',
    image: '/ottawa.png',
    coords: { left: '29%', top: '27%' },
    cases: [
      {
        id: 'ottawa-rideau',
        name: 'Rideau Canal Relay',
        type: 'Bridge Relay',
        status: 'active',
        description: 'A relay node pulsing under the frozen Rideau Canal. Arbitrum ingress confirmed.',
        image: '/ottawa_1.png',
        chainId: 421614,
      },
      {
        id: 'ottawa-parliament',
        name: 'Parliament Hill Beacon',
        type: 'Signal Router',
        status: 'active',
        description: 'A beacon tucked near Parliament Hill. Encrypted bursts match known thief signatures.',
        image: '/ottawa_2.png',
        chainId: 421614,
      },
      {
        id: 'ottawa-gallery',
        name: 'National Gallery Vault',
        type: 'Custody Protocol',
        status: 'active',
        description: 'Custody traffic spiking near the National Gallery. Assets are being staged here.',
        image: '/ottawa_3.png',
        chainId: 421614,
      },
    ],
  },
  {
    id: 97,
    name: 'London',
    flag: '\u{1F3A1}',
    chain: 'BNB Testnet',
    chainColor: '#F0B90B',
    chainIcon: '/blockchain_icon/bnb.png',
    image: '/london.png',
    coords: { left: '47%', top: '24%' },
    cases: [
      {
        id: 'london-big-ben',
        name: 'Big Ben Sentinel',
        type: 'Monitoring Contract',
        status: 'active',
        description: 'A monitoring sentinel hidden in the clockworks of Big Ben. Timing anomalies detected.',
        image: '/london_1.png',
        chainId: 97,
      },
      {
        id: 'london-buckingham',
        name: 'Buckingham Vault',
        type: 'Custody Protocol',
        status: 'active',
        description: 'Custody transactions funneling through the Buckingham node. High-value assets spotted.',
        image: '/london_2.png',
        chainId: 97,
      },
      {
        id: 'london-eye',
        name: 'London Eye Router',
        type: 'Signal Router',
        status: 'active',
        description: 'A high-altitude router on the London Eye. BNB packets hopping across regions.',
        image: '/london_3.png',
        chainId: 97,
      },
    ],
  },
  {
    id: 98,
    name: 'Shanghai',
    flag: '\u{1F3E2}',
    chain: 'BNB Testnet',
    chainColor: '#F0B90B',
    chainIcon: '/blockchain_icon/bnb.png',
    image: '/shanghai.png',
    coords: { left: '78%', top: '39%' },
    cases: [
      {
        id: 'shanghai-pearl',
        name: 'Oriental Pearl Relay',
        type: 'Bridge Relay',
        status: 'active',
        description: 'A relay broadcasting from the Oriental Pearl. Cross-chain drift detected.',
        image: '/shanghai_1.png',
        chainId: 97,
      },
      {
        id: 'shanghai-tower',
        name: 'Shanghai Tower Node',
        type: 'Signal Router',
        status: 'active',
        description: 'A signal node perched at the Shanghai Tower. Data spikes match the stolen NFT trail.',
        image: '/shanghai_2.png',
        chainId: 97,
      },
      {
        id: 'shanghai-bund',
        name: 'The Bund Market',
        type: 'Market Router',
        status: 'active',
        description: 'Heavy market routing on the Bund. Suspicious liquidity loops detected.',
        image: '/shanghai_3.png',
        chainId: 97,
      },
    ],
  },
  {
    id: 99,
    name: 'Reykjavík',
    flag: '\u2744\uFE0F',
    chain: 'BNB Testnet',
    chainColor: '#F0B90B',
    chainIcon: '/blockchain_icon/bnb.png',
    image: '/island.png',
    coords: { left: '38%', top: '14%' },
    cases: [
      {
        id: 'reykjavik-hallgrimskirkja',
        name: 'Hallgrímskirkja Node',
        type: 'Signal Router',
        status: 'active',
        description: 'A signal node hidden within Hallgrímskirkja. BNB transmissions spike in the northern aurora.',
        image: '/island_1.png',
        chainId: 97,
      },
      {
        id: 'reykjavik-harpa',
        name: 'Harpa Concert Relay',
        type: 'Bridge Relay',
        status: 'active',
        description: 'A relay embedded in the Harpa Concert Hall. Cross-chain flows converge in the cold.',
        image: '/island_2.png',
        chainId: 97,
      },
      {
        id: 'reykjavik-lagoon',
        name: 'Blue Lagoon Vault',
        type: 'Custody Protocol',
        status: 'active',
        description: 'Custody traffic pools at the Blue Lagoon. Assets are being laundered in geothermal cover.',
        image: '/island_3.png',
        chainId: 97,
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
    image: '/paris.png',
    coords: { left: '48%', top: '29%' },
    cases: [
      {
        id: 'paris-eiffel',
        name: 'Eiffel Tower Relay',
        type: 'Monitoring Contract',
        status: 'active',
        description: 'A monitoring beacon deployed near the Eiffel Tower node. Bridge ingress detected.',
        image: '/paris_1.png',
        chainId: 84532,
      },
      {
        id: 'paris-louvre',
        name: 'Louvre Custody Router',
        type: 'Custody Protocol',
        status: 'active',
        description: 'A custody router at the Louvre node. High-value cross-chain asset arrival confirmed.',
        image: '/paris_2.png',
        chainId: 84532,
      },
      {
        id: 'paris-notre',
        name: 'Notre-Dame Gate',
        type: 'Bridge Relay',
        status: 'active',
        description: 'A relay concealed beneath Notre-Dame. Base traffic converges here at night.',
        image: '/paris_3.png',
        chainId: 84532,
      },
    ],
  },
  {
    id: 845321,
    name: 'Rome',
    flag: '\u{1F3DB}',
    chain: 'Base Sepolia',
    chainColor: '#0052FF',
    chainIcon: '/blockchain_icon/base.png',
    image: '/roma.png',
    coords: { left: '53%', top: '34%' },
    cases: [
      {
        id: 'rome-st-peter',
        name: 'Saint Peter Relay',
        type: 'Bridge Relay',
        status: 'active',
        description: 'A relay node hidden near Saint Peter. Base hops stacking rapidly.',
        image: '/roma_1.png',
        chainId: 84532,
      },
      {
        id: 'rome-colosseum',
        name: 'Colosseum Beacon',
        type: 'Signal Router',
        status: 'active',
        description: 'A beacon in the Colosseum district. Signal echoes align with the theft trail.',
        image: '/roma_2.png',
        chainId: 84532,
      },
      {
        id: 'rome-trevi',
        name: 'Trevi Fountain Vault',
        type: 'Custody Protocol',
        status: 'active',
        description: 'Custody flows spike near Trevi. Someone is staging assets for export.',
        image: '/roma_3.png',
        chainId: 84532,
      },
    ],
  },
  {
    id: 51,
    name: 'Sydney',
    flag: '\u{1F3A7}',
    chain: 'XDC Apothem',
    chainColor: '#00AEEF',
    chainIcon: '/blockchain_icon/xdc.png',
    image: '/sydney.png',
    coords: { left: '87%', top: '78%' },
    cases: [
      {
        id: 'sydney-opera',
        name: 'Opera House Node',
        type: 'Signal Router',
        status: 'active',
        description: 'A router disguised within the Opera House. XDC transmissions intensify after dusk.',
        image: '/sydney_1.png',
        chainId: 51,
      },
      {
        id: 'sydney-bridge',
        name: 'Harbour Bridge Relay',
        type: 'Bridge Relay',
        status: 'active',
        description: 'A relay strung across the Harbour Bridge. Cross-chain drips forming a trail.',
        image: '/sydney_2.png',
        chainId: 51,
      },
      {
        id: 'sydney-bondi',
        name: 'Bondi Beach Market',
        type: 'Market Router',
        status: 'active',
        description: 'Market routes surge near Bondi. Unusual swaps mask the stolen assets.',
        image: '/sydney_3.png',
        chainId: 51,
      },
    ],
  },
  {
    id: 511,
    name: 'Nairobi',
    flag: '\u{1F333}',
    chain: 'XDC Apothem',
    chainColor: '#00AEEF',
    chainIcon: '/blockchain_icon/xdc.png',
    image: '/nairobi.png',
    coords: { left: '59%', top: '61%' },
    cases: [
      {
        id: 'nairobi-park',
        name: 'National Park Relay',
        type: 'Bridge Relay',
        status: 'active',
        description: 'A relay hidden within Nairobi National Park. XDC ingress confirmed.',
        image: '/nairobi_1.png',
        chainId: 51,
      },
      {
        id: 'nairobi-giraffe',
        name: 'Giraffe Centre Beacon',
        type: 'Signal Router',
        status: 'active',
        description: "Beacon signals ping from the Giraffe Centre. The thief's route is close.",
        image: '/nairobi_2.png',
        chainId: 51,
      },
      {
        id: 'nairobi-museum',
        name: 'National Museum Vault',
        type: 'Custody Protocol',
        status: 'active',
        description: 'Custody movements spike near the National Museum. Assets in staging.',
        image: '/nairobi_3.png',
        chainId: 51,
      },
    ],
  },
  {
    id: 512,
    name: 'Rio de Janeiro',
    flag: '\u{1F3D6}',
    chain: 'XDC Apothem',
    chainColor: '#00AEEF',
    chainIcon: '/blockchain_icon/xdc.png',
    image: '/rio.png',
    coords: { left: '34%', top: '74%' },
    cases: [
      {
        id: 'rio-cristo',
        name: 'Cristo Redentor Node',
        type: 'Signal Router',
        status: 'active',
        description: 'A router hidden beneath Cristo Redentor. XDC traffic flares at night.',
        image: '/rio_1.png',
        chainId: 51,
      },
      {
        id: 'rio-copacabana',
        name: 'Copacabana Vault',
        type: 'Custody Protocol',
        status: 'active',
        description: 'Custody flows pool near Copacabana Palace. Assets are being laundered.',
        image: '/rio_2.png',
        chainId: 51,
      },
      {
        id: 'rio-selaron',
        name: 'Escadaria Selaron Market',
        type: 'Market Router',
        status: 'active',
        description: 'A bustling router at Escadaria Selaron. Swap activity masking the trail.',
        image: '/rio_3.png',
        chainId: 51,
      },
    ],
  },
  {
    id: 80002,
    name: 'Santiago',
    flag: '\u{1F5FB}',
    chain: 'Polygon Amoy',
    chainColor: '#8247E5',
    chainIcon: '/blockchain_icon/polygon.png',
    image: '/chile.png',
    coords: { left: '26%', top: '82%' },
    cases: [
      {
        id: 'santiago-easter',
        name: 'Easter Island Relay',
        type: 'Bridge Relay',
        status: 'active',
        description: 'A relay route anchored to Easter Island. Polygon flows converge here.',
        image: '/chile_1.png',
        chainId: 80002,
      },
      {
        id: 'santiago-torre',
        name: 'Gran Torre Node',
        type: 'Signal Router',
        status: 'active',
        description: 'A signal node atop Gran Torre. Polygon pings align with the suspect route.',
        image: '/chile_2.png',
        chainId: 80002,
      },
      {
        id: 'santiago-moneda',
        name: 'La Moneda Vault',
        type: 'Custody Protocol',
        status: 'active',
        description: 'Custody traffic spikes near La Moneda. Assets may be staged for exit.',
        image: '/chile_3.png',
        chainId: 80002,
      },
    ],
  },
  {
    id: 800021,
    name: 'Dakar',
    flag: '\u{1F30D}',
    chain: 'Polygon Amoy',
    chainColor: '#8247E5',
    chainIcon: '/blockchain_icon/polygon.png',
    image: '/dakar.png',
    coords: { left: '36%', top: '56%' },
    cases: [
      {
        id: 'dakar-renaissance',
        name: 'Renaissance Monument Relay',
        type: 'Bridge Relay',
        status: 'active',
        description: 'A relay hidden at the Renaissance Monument. Polygon ingress rising.',
        image: '/dakar_1.png',
        chainId: 80002,
      },
      {
        id: 'dakar-goree',
        name: 'Goree Island Node',
        type: 'Signal Router',
        status: 'active',
        description: 'A signal node on Goree Island. Traffic spikes match the stolen route.',
        image: '/dakar_2.png',
        chainId: 80002,
      },
      {
        id: 'dakar-mosque',
        name: 'Grand Mosque Vault',
        type: 'Custody Protocol',
        status: 'active',
        description: 'Custody vault activity at the Grand Mosque. Assets being staged.',
        image: '/dakar_3.png',
        chainId: 80002,
      },
    ],
  },
  {
    id: 800022,
    name: 'Moscow',
    flag: '\u26EA',
    chain: 'Polygon Amoy',
    chainColor: '#8247E5',
    chainIcon: '/blockchain_icon/polygon.png',
    image: '/moscow.png',
    coords: { left: '58%', top: '22%' },
    cases: [
      {
        id: 'moscow-red-square',
        name: 'Red Square Relay',
        type: 'Bridge Relay',
        status: 'active',
        description: 'A relay node pulsing beneath Red Square. Polygon ingress rising fast.',
        image: '/moscow_1.png',
        chainId: 80002,
      },
      {
        id: 'moscow-kremlin',
        name: 'Kremlin Beacon',
        type: 'Signal Router',
        status: 'active',
        description: 'A signal beacon within the Kremlin walls. Encrypted traffic matches the suspect trail.',
        image: '/moscow_2.png',
        chainId: 80002,
      },
      {
        id: 'moscow-bolshoi',
        name: 'Bolshoi Theatre Vault',
        type: 'Custody Protocol',
        status: 'active',
        description: 'Custody flows surge near the Bolshoi Theatre. Assets are being staged for exit.',
        image: '/moscow_3.png',
        chainId: 80002,
      },
    ],
  },
  {
    id: 11155111,
    name: 'New York City',
    flag: '\u{1F30E}',
    chain: 'Ethereum Sepolia',
    chainColor: '#627EEA',
    chainIcon: '/blockchain_icon/eth.png',
    image: '/nyc.png',
    coords: { left: '27%', top: '34%' },
    cases: [
      {
        id: 'nyc-liberty',
        name: 'Liberty Island Relay',
        type: 'Bridge Relay',
        status: 'active',
        description: 'A relay hidden near the Statue of Liberty. Ethereum ingress confirmed.',
        image: '/nyc_1.png',
        chainId: 11155111,
      },
      {
        id: 'nyc-central',
        name: 'Central Park Beacon',
        type: 'Signal Router',
        status: 'active',
        description: 'Signal bursts ripple across Central Park. The trail is still warm.',
        image: '/nyc_2.png',
        chainId: 11155111,
      },
      {
        id: 'nyc-times',
        name: 'Times Square Market',
        type: 'Market Router',
        status: 'active',
        description: 'Market routing intensifies in Times Square. Liquidity loops detected.',
        image: '/nyc_3.png',
        chainId: 11155111,
      },
    ],
  },
  {
    id: 11155112,
    name: 'Mexico City',
    flag: '\u{1F5FD}',
    chain: 'Ethereum Sepolia',
    chainColor: '#627EEA',
    chainIcon: '/blockchain_icon/eth.png',
    image: '/mexico.png',
    coords: { left: '23%', top: '50%' },
    cases: [
      {
        id: 'mexico-bellas',
        name: 'Bellas Artes Relay',
        type: 'Bridge Relay',
        status: 'active',
        description: 'Relay activity near Palacio de Bellas Artes. Ethereum hops intensify.',
        image: '/mexico_1.png',
        chainId: 11155111,
      },
      {
        id: 'mexico-chapultepec',
        name: 'Chapultepec Beacon',
        type: 'Signal Router',
        status: 'active',
        description: 'Beacon signals from Chapultepec. The suspects route passes through here.',
        image: '/mexico_2.png',
        chainId: 11155111,
      },
      {
        id: 'mexico-mayor',
        name: 'Templo Mayor Vault',
        type: 'Custody Protocol',
        status: 'active',
        description: 'Custody vault activity at Templo Mayor. Assets possibly staged.',
        image: '/mexico_3.png',
        chainId: 11155111,
      },
    ],
  },
  {
    id: 11155113,
    name: 'Dubai',
    flag: '\u{1F3E0}',
    chain: 'Ethereum Sepolia',
    chainColor: '#627EEA',
    chainIcon: '/blockchain_icon/eth.png',
    image: '/dubai.png',
    coords: { left: '62%', top: '46%' },
    cases: [
      {
        id: 'dubai-burj',
        name: 'Burj Khalifa Node',
        type: 'Signal Router',
        status: 'active',
        description: 'A high-altitude node at Burj Khalifa. Ethereum bursts align with the theft.',
        image: '/dubai_1.png',
        chainId: 11155111,
      },
      {
        id: 'dubai-airport',
        name: 'Dubai Airport Relay',
        type: 'Bridge Relay',
        status: 'active',
        description: 'Bridge relays echo near Dubai Airport. Cross-chain transfers accelerating.',
        image: '/dubai_2.png',
        chainId: 11155111,
      },
      {
        id: 'dubai-mall',
        name: 'Dubai Mall Market',
        type: 'Market Router',
        status: 'active',
        description: 'Market routing spikes at Dubai Mall. Liquidity trails are fresh.',
        image: '/dubai_3.png',
        chainId: 11155111,
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
    scanAndInspect,
    investigate,
    gas,
    missionId,
    blocksElapsed,
    carmenMovedAlert,
  } = useGameStore()

  const blockColor = blocksElapsed <= 20 ? 'green' : blocksElapsed <= 35 ? 'yellow' : 'red'

  const [selectedMarker, setSelectedMarker] = useState(null)
  const mapLocations = PLATFORM_CITY_OPTIONS

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
        const loc = mapLocations.find((l) => l.id === selectedMarker)
        if (!loc) return null
        const isScanned = loc.alwaysScanned || scannedLocations.includes(loc.id)
        const isCityNodeCity = [421614, 84532, 51].includes(loc.id)
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
                        onSelectCase?.({ ...c, locationIdx: caseIdx })
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
