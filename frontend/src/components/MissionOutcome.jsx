import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import styles from './MissionOutcome.module.css'

const LINE_TYPE_SPEED = 22
const REWARD_CONFIG = {
  GOLD: { icon: '\u{1F3C6}', sub: 'Solved in 20 blocks or fewer' },
  SILVER: { icon: '\u{1F948}', sub: 'Solved in 35 blocks or fewer' },
  BRONZE: { icon: '\u{1F949}', sub: 'Case closed within the limit' },
}

function buildVictoryLines(missionId, outcome) {
  const reward = REWARD_CONFIG[outcome?.rewardLabel] || REWARD_CONFIG.BRONZE
  return [
    { text: `MISSION #${missionId} — CASE CLOSED`, color: 'green' },
    { text: '', color: 'muted' },
    { text: 'After weeks of relentless pursuit across multiple blockchains,', color: 'cyan' },
    { text: 'the ACME Detective Agency is proud to announce:', color: 'cyan' },
    { text: '', color: 'muted' },
    { text: 'CARMEN SANDIEGO HAS BEEN CAPTURED.', color: 'green' },
    { text: '', color: 'muted' },
    { text: `Her trail of encrypted transactions and cross-chain obfuscation`, color: 'white' },
    { text: `was no match for your analytical instincts and persistence.`, color: 'white' },
    { text: `The stolen assets have been recovered and returned to their`, color: 'white' },
    { text: `rightful owners across the decentralized network.`, color: 'white' },
    { text: '', color: 'muted' },
    { text: `BLOCKS USED: ${outcome?.blocksUsed || '?'}    REWARD: ${outcome?.reward || 0} pts    RATING: ${outcome?.rewardLabel || 'BRONZE'}`, color: 'yellow' },
    { text: `${reward.icon}  ${reward.sub}`, color: 'yellow' },
    { text: '', color: 'muted' },
    { text: `You have been promoted to: ${outcome?.newRankTitle || 'Detective'}`, color: 'green' },
    { text: `MissionNFT #${missionId} has been minted as your trophy.`, color: 'cyan' },
    { text: '', color: 'muted' },
    { text: 'On behalf of the entire ACME Detective Agency and the Chainlink', color: 'white' },
    { text: 'Convergence Hackathon team — thank you for playing.', color: 'white' },
    { text: '', color: 'muted' },
    { text: 'The blockchain never forgets. Neither will we, Detective.', color: 'green' },
    { text: '', color: 'muted' },
    { text: 'Until the next case...', color: 'green' },
  ]
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
  } = useGameStore()

  const navigate = useNavigate()
  const audioRef = useRef(null)
  const isVictory = missionOutcome?.type === 'captured'

  const INSTANT_LINES = isVictory ? VICTORY_HEADER : DEFEAT_HEADER
  const TYPED_LINES = useMemo(() => {
    if (isVictory) return buildVictoryLines(missionId, missionOutcome)
    return DEFEAT_LINES
  }, [isVictory, missionId, missionOutcome])

  const [currentLine, setCurrentLine] = useState(0)
  const [currentChar, setCurrentChar] = useState(0)
  const [typedLines, setTypedLines] = useState([])
  const [allDone, setAllDone] = useState(false)
  const [skipped, setSkipped] = useState(false)

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
