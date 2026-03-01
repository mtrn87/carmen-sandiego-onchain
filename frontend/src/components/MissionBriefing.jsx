import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useGameStore } from '../store/gameStore'
import scenariosData from '../data/scenarios.json'
import { CONTRACT_CITY_REGISTRY } from '../data/contractData'
import styles from './MissionBriefing.module.css'

const LINE_TYPE_SPEED = 28 // ms per character

// Build typed lines from a scenario's briefing text
function buildTypedLines(scenario) {
  if (!scenario) return []

  const lines = []
  const colors = ['yellow', 'cyan', 'green']

  // Title line
  lines.push({ text: `CASE: ${scenario.title.toUpperCase()}`, color: 'yellow' })
  lines.push({ text: '', color: 'muted' })

  // Split briefing into sentences and assign colors in blocks
  const sentences = scenario.briefing
    .split(/(?<=\.)\s+/)
    .filter((s) => s.trim())

  let colorIdx = 0
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim()
    if (!sentence) continue

    // Wrap long sentences at ~70 chars
    const words = sentence.split(' ')
    let currentLine = ''
    for (const word of words) {
      if (currentLine.length + word.length + 1 > 70 && currentLine) {
        lines.push({ text: currentLine, color: colors[colorIdx % colors.length] })
        currentLine = word
      } else {
        currentLine = currentLine ? `${currentLine} ${word}` : word
      }
    }
    if (currentLine) {
      lines.push({ text: currentLine, color: colors[colorIdx % colors.length] })
    }

    // Blank line between sentences, advance color every 2 sentences
    if (i < sentences.length - 1) {
      if ((i + 1) % 2 === 0) {
        lines.push({ text: '', color: 'muted' })
        colorIdx++
      }
    }
  }

  lines.push({ text: '', color: 'muted' })
  lines.push({ text: 'Good luck, detective. The entire agency is counting on you.', color: 'yellow' })

  return lines
}

// Instant header lines (always shown)
const INSTANT_LINES = [
  { text: '\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588', color: 'red' },
  { text: '  ACME DETECTIVE AGENCY \u2014 PRIORITY ALERT \u2014 CLASSIFICATION: CRITICAL', color: 'red' },
  { text: '\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588', color: 'red' },
  { text: '', color: 'muted' },
]

export default function MissionBriefing() {
  const { completeBriefing, missionId } = useGameStore()
  const audioRef = useRef(null)
  const [currentLine, setCurrentLine] = useState(0)
  const [currentChar, setCurrentChar] = useState(0)
  const [typedLines, setTypedLines] = useState([])
  const [allDone, setAllDone] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [isStarting, setIsStarting] = useState(false)

  // Select scenario based on missionId — wait until it's set on-chain
  const scenarios = scenariosData.scenarios
  const scenario = useMemo(() => {
    if (missionId && missionId > 0) {
      return scenarios[(missionId - 1) % scenarios.length]
    }
    return null
  }, [missionId, scenarios])

  const TYPED_LINES = useMemo(() => buildTypedLines(scenario), [scenario])

  const handleStartMission = useCallback(async () => {
    if (isStarting) return
    setIsStarting(true)
    audioRef.current?.pause()
    try {
      await completeBriefing()
    } catch (err) {
      console.error('Failed to start mission:', err)
      setIsStarting(false)
    }
  }, [completeBriefing, isStarting])

  // start audio on mount
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = 0.5
    audio.play().catch(() => {})
    return () => {
      audio.pause()
    }
  }, [])

  // typing effect for TYPED_LINES only
  useEffect(() => {
    if (skipped || allDone) return

    if (currentLine >= TYPED_LINES.length) {
      setAllDone(true)
      return
    }

    const line = TYPED_LINES[currentLine]

    // empty line — just push and move on
    if (line.text === '') {
      setTypedLines((prev) => [...prev, { text: '', color: line.color }])
      const timeout = setTimeout(() => {
        setCurrentLine((l) => l + 1)
        setCurrentChar(0)
      }, 150)
      return () => clearTimeout(timeout)
    }

    // typing current line char by char
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

    // line finished, move to next
    const timeout = setTimeout(() => {
      setCurrentLine((l) => l + 1)
      setCurrentChar(0)
    }, 80)
    return () => clearTimeout(timeout)
  }, [currentLine, currentChar, skipped, allDone, TYPED_LINES])

  // 1st Enter: skip typing + stop audio | 2nd Enter: close briefing
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key !== 'Enter') return

      if (allDone) {
        handleStartMission()
      } else {
        // 1st enter — skip to end + stop audio
        setTypedLines(TYPED_LINES.map((l) => ({ text: l.text, color: l.color })))
        setSkipped(true)
        setAllDone(true)
        audioRef.current?.pause()
      }
    },
    [allDone, handleStartMission, TYPED_LINES]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const COLOR_MAP = {
    red: 'var(--red)',
    yellow: 'var(--yellow)',
    cyan: 'var(--cyan)',
    green: 'var(--green)',
    muted: 'var(--text-muted)',
  }

  // still waiting for missionId from blockchain
  if (!scenario) {
    return (
      <div className={styles.briefing}>
        <div className={styles.imageContainer}>
          <img src="/nft_stolen.png" alt="NFT Stolen" className={styles.bgImage} />
          <div className={styles.imageCrt} />
          <div className={styles.imageVignette} />
        </div>
        <div className={styles.terminalOverlay}>
          <div className={styles.terminal}>
            <div className={styles.terminalHeader}>
              <div className={styles.headerDots}>
                <span className={styles.dot} data-color="red" />
                <span className={styles.dot} data-color="yellow" />
                <span className={styles.dot} data-color="green" />
              </div>
              <span className={styles.headerTitle}>acme_alert.exe &mdash; PRIORITY: CRITICAL</span>
              <span className={styles.headerBlink}>&#9679; LIVE</span>
            </div>
            <div className={styles.terminalBody}>
              <div className={styles.line} style={{ color: 'var(--cyan)' }}>
                {'> RETRIEVING MISSION DATA FROM BLOCKCHAIN...'}
              </div>
              <span className={styles.cursor}>_</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.briefing}>
      {/* background image with CRT effect */}
      <div className={styles.imageContainer}>
        <img src="/nft_stolen.png" alt="NFT Stolen" className={styles.bgImage} />
        <div className={styles.imageCrt} />
        <div className={styles.imageVignette} />
      </div>

      {/* terminal overlay on top of image */}
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
              acme_alert.exe &mdash; PRIORITY: CRITICAL
            </span>
            <span className={styles.headerBlink}>&#9679; LIVE</span>
          </div>

          {/* terminal body with typed lines */}
          <div className={styles.terminalBody}>
            {/* instant header lines (always visible) */}
            {INSTANT_LINES.map((line, i) => (
              <div
                key={`instant-${i}`}
                className={styles.line}
                style={{ color: COLOR_MAP[line.color] || COLOR_MAP.cyan }}
              >
                {line.text || '\u00A0'}
              </div>
            ))}

            {/* typed lines (appear with typewriter) */}
            {typedLines.map((line, i) => (
              <div
                key={`typed-${i}`}
                className={styles.line}
                style={{ color: COLOR_MAP[line.color] || COLOR_MAP.cyan }}
              >
                {line.text || '\u00A0'}
              </div>
            ))}

            {/* cursor */}
            {!allDone && (
              <span className={styles.cursor}>_</span>
            )}
          </div>

          {/* skip button (visible during typing) */}
          {!allDone && (
            <button
              className={styles.skipBtn}
              onClick={() => {
                setTypedLines(TYPED_LINES.map((l) => ({ text: l.text, color: l.color })))
                setSkipped(true)
                setAllDone(true)
                audioRef.current?.pause()
              }}
            >
              SKIP &gt;&gt;
            </button>
          )}

          {/* continue prompt */}
          {allDone && (
            <button
              className={styles.continueBtn}
              disabled={isStarting}
              onClick={handleStartMission}
            >
              <span className={styles.continueFlicker}>
                {isStarting
                  ? '> STARTING MISSION ON-CHAIN...'
                  : '> PRESS ENTER OR CLICK TO CONTINUE'}
              </span>
            </button>
          )}
        </div>
      </div>

      <audio ref={audioRef} src="/binance_history.mp3" preload="auto" />
    </div>
  )
}
