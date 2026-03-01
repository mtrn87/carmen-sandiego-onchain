import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import { CITY_POOL_MAP } from '../data/cityRegistry'
import { getMissionToTokenId, getMissionNFTTokenURI, MISSION_NFT_ADDRESS } from '../services/contractService'
import styles from './MissionOutcome.module.css'

const LINE_TYPE_SPEED = 22
const REWARD_CONFIG = {
  GOLD: { icon: '\u{1F3C6}', sub: 'Solved in 20 blocks or fewer' },
  SILVER: { icon: '\u{1F948}', sub: 'Solved in 35 blocks or fewer' },
  BRONZE: { icon: '\u{1F949}', sub: 'Case closed within the limit' },
}

const CAPTURE_LOCATIONS = {
  421614: 'a hidden server room beneath the Senso-ji Temple in Tokyo, disguised as a blockchain mining operation behind the ancient shrine walls',
  4216141: 'a satellite uplink station on Parliament Hill in Ottawa, where encrypted signals were bouncing off the Peace Tower antenna',
  80002: 'an underground crypto vault carved into the rock beneath Santiago\'s Gran Torre, the tallest building in South America',
  800021: 'a clandestine NFT gallery hidden in a Buenos Aires tango club in San Telmo, where each painting concealed a private key',
  84532: 'a floating DeFi exchange barge on the Seine River near the Pont Alexandre III in Paris, camouflaged as a dinner cruise',
  845321: 'an abandoned vault beneath Zurich\'s Bahnhofstrasse, where Swiss banks once stored gold and now store cold wallets',
  845322: 'a converted windmill in Amsterdam\'s Jordaan district, its sails rotating to power a massive cross-chain relay node',
  512: 'a hidden smart contract terminal inside a favela-top bar in Rio de Janeiro, overlooking the Christ the Redeemer statue',
  51: 'a Victorian-era telegraph station beneath London\'s Tower Bridge, retrofitted as a Chainlink oracle relay hub',
  511: 'a penthouse trading floor atop Dubai\'s Burj Khalifa, where holographic screens displayed every blockchain in real-time',
  513: 'a secret room behind the waterfall at Singapore\'s Jewel Changi Airport, housing a quantum-encrypted wallet vault',
  111551111: 'a decommissioned subway car beneath New York\'s Grand Central Terminal, converted into a mobile hacking lab',
  111551112: 'a rooftop antenna farm in Seoul\'s Gangnam district, disguised as a K-pop recording studio',
  111551113: 'a converted lighthouse on Sydney Harbour, its beam repurposed to broadcast encrypted transaction data across the Pacific',
  111551114: 'an ancient catacomb beneath Rome\'s Colosseum, where fiber optic cables ran alongside two-thousand-year-old aqueducts',
  111551115: 'a hidden floor inside Cairo\'s Egyptian Museum, where blockchain nodes were cooled by the same air conditioning protecting the pharaohs\' treasures',
  111551116: 'a converted temple in Bangkok\'s Chinatown, its golden spires concealing directional antennas for cross-chain communication',
}

function buildVictoryLines(missionId, outcome, gameState) {
  const reward = REWARD_CONFIG[outcome?.rewardLabel] || REWARD_CONFIG.BRONZE
  const { cityTrail, currentCityId, walletFragments, evidence, clues } = gameState

  const captureCity = CITY_POOL_MAP[currentCityId]
  const captureCityName = captureCity ? `${captureCity.flag} ${captureCity.name}` : 'an undisclosed location'
  const captureChain = captureCity?.chain || 'the decentralized network'
  const captureLocation = CAPTURE_LOCATIONS[currentCityId] || `a concealed relay node in ${captureCityName}`

  const trailCities = (cityTrail || [])
    .map((id) => CITY_POOL_MAP[id])
    .filter(Boolean)
  const trailNames = trailCities.map((c) => `${c.flag} ${c.name}`).join(' -> ')

  const clueCount = (clues || []).length
  const evidenceCount = (evidence || []).length
  const fragmentCount = (walletFragments || []).length

  const lines = [
    { text: `MISSION #${missionId} — CASE CLOSED`, color: 'green' },
    { text: '', color: 'muted' },
    { text: '> ACME DETECTIVE AGENCY — FINAL REPORT', color: 'green' },
    { text: '> STATUS: TARGET APPREHENDED', color: 'green' },
    { text: '', color: 'muted' },
    { text: 'CARMEN SANDIEGO HAS BEEN CAPTURED.', color: 'green' },
    { text: '', color: 'muted' },
  ]

  if (trailNames) {
    lines.push({ text: 'INVESTIGATION TRAIL:', color: 'yellow' })
    lines.push({ text: trailNames, color: 'cyan' })
    lines.push({ text: '', color: 'muted' })
  }

  lines.push({ text: `Your pursuit led you across ${trailCities.length || 'multiple'} cities and`, color: 'white' })
  lines.push({ text: `${captureChain}'s blockchain topology. Each node you scanned`, color: 'white' })
  lines.push({ text: `narrowed the search perimeter until only one location remained.`, color: 'white' })
  lines.push({ text: '', color: 'muted' })

  if (clueCount > 0 || evidenceCount > 0) {
    lines.push({ text: 'EVIDENCE SUMMARY:', color: 'yellow' })
    if (clueCount > 0) {
      lines.push({ text: `  > ${clueCount} decrypted clue${clueCount > 1 ? 's' : ''} recovered from on-chain oracle feeds`, color: 'cyan' })
    }
    if (evidenceCount > 0) {
      lines.push({ text: `  > ${evidenceCount} critical evidence item${evidenceCount > 1 ? 's' : ''} flagged by CRE analysis`, color: 'cyan' })
    }
    if (fragmentCount > 0) {
      lines.push({ text: `  > ${fragmentCount} wallet fragment${fragmentCount > 1 ? 's' : ''} intercepted from cross-chain relays`, color: 'cyan' })
    }
    lines.push({ text: '', color: 'muted' })
  }

  if (fragmentCount > 0) {
    const fragmentChars = walletFragments.map((f) => f.chars).join('')
    lines.push({ text: `WALLET CAPTURE:`, color: 'yellow' })
    lines.push({ text: `  The fragmented wallet signature [${fragmentChars}...] was`, color: 'white' })
    lines.push({ text: `  reconstructed from ${fragmentCount} intercepted relay transmissions.`, color: 'white' })
    lines.push({ text: `  Cross-referencing with Chainlink VRF salt data confirmed`, color: 'white' })
    lines.push({ text: `  a match with Carmen's operational wallet.`, color: 'white' })
    lines.push({ text: '', color: 'muted' })
  }

  lines.push({ text: `CAPTURE LOCATION:`, color: 'yellow' })
  lines.push({ text: `  ${captureCityName} — ${captureChain}`, color: 'green' })
  lines.push({ text: '', color: 'muted' })
  lines.push({ text: `  ACME field agents located the suspect in`, color: 'white' })
  lines.push({ text: `  ${captureLocation}.`, color: 'white' })
  lines.push({ text: '', color: 'muted' })
  lines.push({ text: `  The stolen assets have been frozen and returned to their`, color: 'white' })
  lines.push({ text: `  rightful owners across the decentralized network.`, color: 'white' })
  lines.push({ text: '', color: 'muted' })

  lines.push({ text: `MISSION STATS:`, color: 'yellow' })
  lines.push({ text: `  BLOCKS: ${outcome?.blocksUsed || '?'}    REWARD: ${outcome?.reward || 0} pts    RATING: ${outcome?.rewardLabel || 'BRONZE'}`, color: 'cyan' })
  lines.push({ text: `  ${reward.icon}  ${reward.sub}`, color: 'cyan' })
  lines.push({ text: '', color: 'muted' })

  lines.push({ text: `RANK: ${outcome?.newRankTitle || 'Detective'}`, color: 'green' })
  lines.push({ text: `MissionNFT #${missionId} has been minted to your wallet as proof of capture.`, color: 'cyan' })
  lines.push({ text: '', color: 'muted' })

  lines.push({ text: `On behalf of the ACME Detective Agency and the Chainlink`, color: 'white' })
  lines.push({ text: `Convergence Hackathon team — outstanding work, Detective.`, color: 'white' })
  lines.push({ text: '', color: 'muted' })
  lines.push({ text: 'The blockchain never forgets. Neither will we.', color: 'green' })
  lines.push({ text: '', color: 'muted' })
  lines.push({ text: 'Until the next case...', color: 'green' })

  return lines
}

const DEFEAT_LINES = [
  { text: 'MISSION FAILED — TARGET LOST', color: 'red' },
  { text: '', color: 'muted' },
  { text: 'Carmen vanished before you could close in.', color: 'white' },
  { text: 'Too many blocks elapsed — the trail went cold.', color: 'red' },
  { text: '', color: 'muted' },
  { text: 'Every great detective learns from failure.', color: 'white' },
  { text: 'Regroup and try again — she can\'t hide forever.', color: 'yellow' },
]

const VICTORY_HEADER = [
  { text: '\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588', color: 'green' },
  { text: '  ACME DETECTIVE AGENCY \u2014 MISSION COMPLETE \u2014 CLASSIFICATION: SUCCESS', color: 'green' },
  { text: '\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588', color: 'green' },
  { text: '', color: 'muted' },
]

const DEFEAT_HEADER = [
  { text: '\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588', color: 'red' },
  { text: '  ACME DETECTIVE AGENCY \u2014 MISSION FAILED \u2014 CLASSIFICATION: CRITICAL', color: 'red' },
  { text: '\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588', color: 'red' },
  { text: '', color: 'muted' },
]

const COLOR_MAP = {
  red: 'var(--red)',
  yellow: 'var(--yellow)',
  cyan: 'var(--cyan)',
  green: 'var(--green)',
  white: 'var(--text-primary)',
  muted: 'var(--text-muted)',
}

export default function MissionOutcome() {
  const {
    missionOutcome,
    missionId,
    startNewMission,
    abandonMission,
    cityTrail,
    currentCityId,
    walletFragments,
    evidence,
    clues,
  } = useGameStore()

  const navigate = useNavigate()
  const audioRef = useRef(null)
  const isVictory = missionOutcome?.type === 'captured'

  const INSTANT_LINES = isVictory ? VICTORY_HEADER : DEFEAT_HEADER
  const TYPED_LINES = useMemo(() => {
    if (isVictory) return buildVictoryLines(missionId, missionOutcome, {
      cityTrail, currentCityId, walletFragments, evidence, clues,
    })
    return DEFEAT_LINES
  }, [isVictory, missionId, missionOutcome, cityTrail, currentCityId, walletFragments, evidence, clues])

  const [currentLine, setCurrentLine] = useState(0)
  const [currentChar, setCurrentChar] = useState(0)
  const [typedLines, setTypedLines] = useState([])
  const [allDone, setAllDone] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [nftData, setNftData] = useState(null)

  // Fetch NFT data when victory animation completes
  useEffect(() => {
    if (!allDone || !isVictory || !missionId) return
    let cancelled = false
    ;(async () => {
      try {
        const tokenId = await getMissionToTokenId(missionId)
        if (cancelled || tokenId == null) return
        const tokenURI = await getMissionNFTTokenURI(tokenId)
        if (cancelled) return
        setNftData({ tokenId, tokenURI })
      } catch {
        // NFT not available — graceful fallback
      }
    })()
    return () => { cancelled = true }
  }, [allDone, isVictory, missionId])

  const handleAction = useCallback(() => {
    if (isVictory) {
      startNewMission()
    } else {
      abandonMission()
      navigate('/')
    }
  }, [isVictory, startNewMission, abandonMission, navigate])

  // start audio on mount
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = 0.4
    audio.play().catch(() => {})
    return () => { audio.pause() }
  }, [])

  // typing effect
  useEffect(() => {
    if (skipped || allDone) return
    if (currentLine >= TYPED_LINES.length) {
      setAllDone(true)
      return
    }
    const line = TYPED_LINES[currentLine]
    if (line.text === '') {
      setTypedLines((prev) => [...prev, { text: '', color: line.color }])
      const timeout = setTimeout(() => {
        setCurrentLine((l) => l + 1)
        setCurrentChar(0)
      }, 120)
      return () => clearTimeout(timeout)
    }
    if (currentChar === 0) {
      setTypedLines((prev) => [...prev, { text: '', color: line.color }])
    }
    if (currentChar < line.text.length) {
      const timeout = setTimeout(() => {
        setTypedLines((prev) => {
          const copy = [...prev]
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            text: line.text.slice(0, currentChar + 1),
          }
          return copy
        })
        setCurrentChar((c) => c + 1)
      }, LINE_TYPE_SPEED)
      return () => clearTimeout(timeout)
    }
    const timeout = setTimeout(() => {
      setCurrentLine((l) => l + 1)
      setCurrentChar(0)
    }, 60)
    return () => clearTimeout(timeout)
  }, [currentLine, currentChar, skipped, allDone, TYPED_LINES])

  // keyboard: 1st Enter skips typing, 2nd Enter triggers action
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key !== 'Enter') return
      if (allDone) {
        handleAction()
      } else {
        setTypedLines(TYPED_LINES.map((l) => ({ text: l.text, color: l.color })))
        setSkipped(true)
        setAllDone(true)
        audioRef.current?.pause()
      }
    },
    [allDone, handleAction, TYPED_LINES]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const themeClass = isVictory ? styles.victory : styles.defeat

  return (
    <div className={`${styles.briefing} ${themeClass}`}>
      {/* background image with CRT effect */}
      <div className={styles.imageContainer}>
        <img
          src={isVictory ? '/worldmap.png' : '/nft_stolen.png'}
          alt=""
          className={styles.bgImage}
          loading="lazy"
        />
        <div className={styles.imageCrt} />
        <div className={styles.imageVignette} />
      </div>

      {/* terminal overlay */}
      <div className={styles.terminalOverlay}>
        <div className={styles.terminal}>
          {/* terminal header */}
          <div className={styles.terminalHeader}>
            <div className={styles.headerDots}>
              <span className={styles.dot} data-color="red" />
              <span className={styles.dot} data-color="yellow" />
              <span className={styles.dot} data-color="green" />
            </div>
            <span className={styles.headerTitle}>
              {isVictory
                ? 'acme_report.exe \u2014 MISSION COMPLETE'
                : 'acme_report.exe \u2014 MISSION FAILED'}
            </span>
            <span className={styles.headerBlink}>&#9679; {isVictory ? 'COMPLETE' : 'END'}</span>
          </div>

          {/* terminal body */}
          <div className={styles.terminalBody}>
            {INSTANT_LINES.map((line, i) => (
              <div
                key={`instant-${i}`}
                className={styles.line}
                style={{ color: COLOR_MAP[line.color] || COLOR_MAP.cyan }}
              >
                {line.text || '\u00A0'}
              </div>
            ))}

            {typedLines.map((line, i) => (
              <div
                key={`typed-${i}`}
                className={styles.line}
                style={{ color: COLOR_MAP[line.color] || COLOR_MAP.cyan }}
              >
                {line.text || '\u00A0'}
              </div>
            ))}

            {!allDone && (
              <span className={styles.cursor}>_</span>
            )}
          </div>

          {/* NFT trophy card */}
          {allDone && isVictory && nftData && (
            <div className={styles.nftTrophy}>
              <div className={styles.nftTrophyImage}>
                {nftData.tokenURI ? (
                  <img src={nftData.tokenURI} alt={`MissionNFT #${nftData.tokenId}`} />
                ) : (
                  <span className={styles.nftTrophyPlaceholder}>&#127942;</span>
                )}
              </div>
              <div className={styles.nftTrophyInfo}>
                <span>MissionNFT #{nftData.tokenId}</span>
                {MISSION_NFT_ADDRESS && (
                  <div className={styles.nftTrophyLinks}>
                    <a
                      className={styles.nftTrophyLink}
                      href={`https://sepolia.etherscan.io/nft/${MISSION_NFT_ADDRESS}/${nftData.tokenId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Etherscan
                    </a>
                    <a
                      className={styles.nftTrophyLink}
                      href={`https://testnets.opensea.io/assets/sepolia/${MISSION_NFT_ADDRESS}/${nftData.tokenId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      OpenSea
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* action button */}
          {allDone && (
            <button className={styles.continueBtn} onClick={handleAction}>
              <span className={styles.continueFlicker}>
                {isVictory
                  ? '> PRESS ENTER FOR NEW MISSION'
                  : '> PRESS ENTER TO EXIT'}
              </span>
            </button>
          )}
        </div>
      </div>

      <audio ref={audioRef} src="/binance_history.mp3" preload="auto" />
    </div>
  )
}
