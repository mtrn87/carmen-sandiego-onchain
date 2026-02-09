import { useState, useEffect, useCallback, useRef } from 'react'
import { useGameStore } from '../store/gameStore'
import styles from './MissionBriefing.module.css'

// lines shown instantly on load (ACME header)
const INSTANT_LINES = [
  { text: '██████████████████████████████████████████████████████████████████', color: 'red' },
  { text: '  ACME DETECTIVE AGENCY — PRIORITY ALERT — CLASSIFICATION: CRITICAL', color: 'red' },
  { text: '██████████████████████████████████████████████████████████████████', color: 'red' },
  { text: '', color: 'muted' },
]

// lines typed out with the audio
const TYPED_LINES = [
  { text: 'Attention, detective. Carmen Sandiego\'s gang has struck again!', color: 'yellow' },
  { text: 'This is a top-priority case — all available agents have been mobilized.', color: 'yellow' },
  { text: '', color: 'muted' },
  { text: 'In China, the gang stole the legendary CryptoPunk #7804 — valued at', color: 'cyan' },
  { text: '4,200 BNB — from the digital vault of the collector known as "The Vault"', color: 'cyan' },
  { text: 'on the Binance network. The asset was stored in a multi-sig custody', color: 'cyan' },
  { text: 'protocol believed to be impenetrable until now.', color: 'cyan' },
  { text: '', color: 'muted' },
  { text: 'The heist was executed through a coordinated flash loan attack,', color: 'cyan' },
  { text: 'temporarily draining liquidity from the custody protocol and allowing the', color: 'cyan' },
  { text: 'NFT to be transferred to an unknown wallet in less than 12 seconds.', color: 'cyan' },
  { text: 'Our forensic blockchain analysts confirmed that the attack exploited a', color: 'cyan' },
  { text: 're-entrancy vulnerability in the vault\'s withdrawal function.', color: 'cyan' },
  { text: '', color: 'muted' },
  { text: 'Our last lead indicates she passed through the Binance network heading', color: 'green' },
  { text: 'toward Polygon. In the Binance contract 0xCarmenVault... you may find', color: 'green' },
  { text: 'additional information — our analysts detected a suspicious bridge', color: 'green' },
  { text: 'transaction targeting a DeFi protocol on Polygon. The transaction was', color: 'green' },
  { text: 'routed through multiple mixer contracts to obscure the trail.', color: 'green' },
  { text: '', color: 'muted' },
  { text: 'WARNING: The NFT has already left the Binance network. Carmen is on the', color: 'yellow' },
  { text: 'move and the trail is getting cold. Every second counts, detective.', color: 'yellow' },
  { text: '', color: 'muted' },
  { text: 'Your mission: track the stolen CryptoPunk across blockchains, follow the', color: 'red' },
  { text: 'on-chain clues, and bring Carmen Sandiego to justice before she vanishes.', color: 'red' },
  { text: '', color: 'muted' },
  { text: 'Good luck, detective. The entire agency is counting on you.', color: 'yellow' },
]

const LINE_TYPE_SPEED = 28 // ms per character

export default function MissionBriefing() {
  const { completeBriefing } = useGameStore()
  const audioRef = useRef(null)
  const [currentLine, setCurrentLine] = useState(0)
  const [currentChar, setCurrentChar] = useState(0)
  const [typedLines, setTypedLines] = useState([])
  const [allDone, setAllDone] = useState(false)
  const [skipped, setSkipped] = useState(false)

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
  }, [currentLine, currentChar, skipped, allDone])

  // 1st Enter: skip typing + stop audio | 2nd Enter: close briefing
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key !== 'Enter') return

      if (allDone) {
        // 2nd enter — close briefing, stop audio
        audioRef.current?.pause()
        completeBriefing()
      } else {
        // 1st enter — skip to end + stop audio
        setTypedLines(TYPED_LINES.map((l) => ({ text: l.text, color: l.color })))
        setSkipped(true)
        setAllDone(true)
        audioRef.current?.pause()
      }
    },
    [allDone, completeBriefing]
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
              acme_alert.exe — PRIORITY: CRITICAL
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

          {/* continue prompt */}
          {allDone && (
            <button
              className={styles.continueBtn}
              onClick={() => {
                audioRef.current?.pause()
                completeBriefing()
              }}
            >
              <span className={styles.continueFlicker}>
                {'>'} PRESS ENTER OR CLICK TO CONTINUE
              </span>
            </button>
          )}
        </div>
      </div>

      <audio ref={audioRef} src="/binance_history.mp3" preload="auto" />
    </div>
  )
}
