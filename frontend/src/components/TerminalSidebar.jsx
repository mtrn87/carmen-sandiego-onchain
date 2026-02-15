import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '../store/gameStore'
import styles from './TerminalSidebar.module.css'

const COLOR_MAP = {
  cyan: 'var(--cyan)',
  green: 'var(--green)',
  red: 'var(--red)',
  yellow: 'var(--yellow)',
  muted: 'var(--text-muted)',
}

const RARITY_COLORS = {
  common: 'var(--text-muted)',
  rare: 'var(--cyan)',
  epic: 'var(--magenta)',
  legendary: 'var(--yellow)',
}

const ICON_MAP = {
  receipt: '\u{1F4C4}',
  audio: '\u{1F50A}',
  hot: '\u{1F525}',
  cold: '\u{2744}\uFE0F',
  key: '\u{1F511}',
}

export default function TerminalSidebar() {
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const audioRef = useRef(null)
  const [activeTab, setActiveTab] = useState('terminal')
  const [chatInput, setChatInput] = useState('')
  const [playingAudio, setPlayingAudio] = useState(null)
  const [selectedEvidence, setSelectedEvidence] = useState(null)

  const {
    terminalLines,
    walletAddress,
    rankTitle,
    currentMission,
    evidence,
    clues,
    addTerminalLine,
    tourActive,
    tourStep,
    advanceTour,
    startNewMission,
    scannedLocations,
    blocksElapsed,
    locations,
    missionId,
    playerNickname,
    rank,
    currentPlot,
    openMissionPlotModal,
    captureMode,
    toggleCaptureMode,
    citySuspectWallets,
    currentCityId,
  } = useGameStore()

  const missionEnded = currentMission?.status === 'completed' || currentMission?.status === 'failed'

  // auto scroll terminal to bottom
  useEffect(() => {
    if (scrollRef.current && activeTab === 'terminal') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [terminalLines, activeTab])

  const handlePlayAudio = useCallback((evidenceId, audioSrc) => {
    if (playingAudio === evidenceId) {
      audioRef.current?.pause()
      setPlayingAudio(null)
      return
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = audioSrc
      audioRef.current.play()
      setPlayingAudio(evidenceId)
    }
  }, [playingAudio])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onEnded = () => setPlayingAudio(null)
    audio.addEventListener('ended', onEnded)
    return () => audio.removeEventListener('ended', onEnded)
  }, [])

  const getContextualHint = useCallback(() => {
    const unscanned = locations.filter((l) => !scannedLocations.includes(l.id))
    const clueCount = clues.length

    // No mission yet
    if (!missionId) {
      return 'No active mission. Complete the briefing to start tracking Carmen.'
    }

    // Mission ended
    if (currentMission?.status === 'completed') {
      return 'Mission complete! Start a new mission to continue your detective career.'
    }
    if (currentMission?.status === 'failed') {
      return 'Mission failed. Don\'t give up — start a new mission and try again.'
    }

    // Block pressure warnings
    if (blocksElapsed > 40) {
      return 'CRITICAL: You\'re running out of blocks! Investigate the most likely city NOW before Carmen escapes!'
    }
    if (blocksElapsed > 30) {
      return 'Time is running low. Focus on the city that matches your clues best. Every block counts.'
    }

    // No locations scanned yet
    if (scannedLocations.length === 0) {
      return 'Open the MAP and scan a network to discover contracts. Each scan costs gas but reveals investigation targets.'
    }

    // Scanned but no clues yet
    if (clueCount === 0 && scannedLocations.length > 0) {
      return 'Good, you\'ve scanned networks. Now investigate a contract from the map — this sends a TX to GameMaster and triggers a CRE clue.'
    }

    // Has some clues, can narrow down
    if (clueCount === 1) {
      return 'You have 1 clue. Study it carefully — does it point to a specific city? Investigate another location to triangulate Carmen\'s position.'
    }

    if (clueCount === 2) {
      if (unscanned.length > 0) {
        const hint = unscanned[0]
        return `You have 2 clues. Consider investigating ${hint.name} next — with 3+ clues the system can attempt capture.`
      }
      return 'You have 2 clues. One more investigation could trigger a capture attempt if you guess correctly!'
    }

    if (clueCount >= 3) {
      return 'You have enough clues for a capture attempt. If your next investigation hits the right city, Carmen is caught!'
    }

    return 'Keep investigating. Follow the blockchain trail and cross-reference your clues to find Carmen.'
  }, [missionId, currentMission, clues, scannedLocations, locations, blocksElapsed])

  const handleSendMessage = () => {
    const msg = chatInput.trim()
    if (!msg) return
    addTerminalLine(`> ${msg}`, 'cyan', 'user')
    setChatInput('')

    const command = msg.toLowerCase()
    if (command === '/mission') {
      openMissionPlotModal()
      return
    }
    if (command === '/reset') {
      addTerminalLine('> RESETTING MISSION — failing current assignment on-chain...', 'red', 'alert')
      startNewMission()
      return
    }

    setTimeout(() => {
      addTerminalLine('> ACME AI: Processing your request...', 'muted', 'system')
      setTimeout(() => {
        const hint = getContextualHint()
        addTerminalLine(`> ACME AI: ${hint}`, 'green', 'system')
      }, 1200)
    }, 600)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className={styles.sidebar}>
      {/* header */}
      <div className={styles.header}>
        <div className={styles.headerDots}>
          <span className={styles.dot} data-color="red" />
          <span className={styles.dot} data-color="yellow" />
          <span className={styles.dot} data-color="green" />
        </div>
        <span className={styles.headerTitle}>acme_terminal.exe</span>
      </div>

      {/* agent info */}
      <div className={styles.agentBar}>
        {playerNickname && (
          <div className={styles.agentRow}>
            <span className={styles.agentLabel}>ALIAS</span>
            <span className={styles.nicknameValue}>{playerNickname}</span>
          </div>
        )}
        <div className={styles.agentRow}>
          <span className={styles.agentLabel}>AGENT</span>
          <span className={styles.agentValue}>
            {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : '\u2014'}
          </span>
        </div>
        <div className={styles.agentRow}>
          <span className={styles.agentLabel}>RANK</span>
          <span className={`${styles.rankBadge} ${rank >= 4 ? styles.rankElite : rank >= 2 ? styles.rankMid : ''}`}>
            {rankTitle}
          </span>
        </div>
        <div className={styles.agentRow}>
          <span className={styles.agentLabel}>MISSION</span>
          <span className={styles.missionValue}>{currentMission?.title || '\u2014'}</span>
        </div>
      </div>

      {/* tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'terminal' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('terminal')}
        >
          TERMINAL
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'evidence' ? styles.tabActive : ''} ${tourActive && tourStep === 3 ? styles.tourHighlight : ''}`}
          data-tour="evidence-tab"
          onClick={() => {
            setActiveTab('evidence')
            if (tourActive && tourStep === 3) advanceTour()
          }}
        >
          EVIDENCE
          {evidence.length > 0 && (
            <span className={styles.tabBadge}>{evidence.length}</span>
          )}
        </button>
      </div>

      {/* tab content */}
      {activeTab === 'terminal' ? (
        <>
          {/* terminal output */}
          <div className={styles.terminalOutput} ref={scrollRef}>
            {terminalLines.map((line, i) => (
              <div
                key={i}
                className={styles.line}
                style={{ color: COLOR_MAP[line.color] || COLOR_MAP.cyan }}
              >
                {line.text}
              </div>
            ))}
            <span className={styles.cursor}>_</span>
          </div>

          {/* capture button — shown when in a city with suspects */}
          {currentCityId && citySuspectWallets.length > 0 && !missionEnded && (
            <div className={styles.captureBar}>
              <button
                className={`${styles.captureBtn} ${captureMode ? styles.captureBtnActive : ''}`}
                onClick={toggleCaptureMode}
              >
                {captureMode ? '[ EXIT CAPTURE ]' : '\u{1F6A8} CAPTURE'}
              </button>
            </div>
          )}

          {/* new mission button — shown after completion/failure */}
          {missionEnded && (
            <div className={styles.newMissionBar}>
              <button
                className={styles.newMissionBtn}
                onClick={startNewMission}
              >
                {currentMission.status === 'completed'
                  ? '[ NEW MISSION ]'
                  : '[ RETRY MISSION ]'}
              </button>
            </div>
          )}

          {/* chat input */}
          <div className={styles.chatInput}>
            <span className={styles.chatPrefix}>&gt;</span>
            <input
              ref={inputRef}
              className={styles.chatField}
              type="text"
              placeholder="Ask ACME AI or type /mission"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              className={styles.quickMissionBtn}
              onClick={openMissionPlotModal}
              disabled={!currentPlot && !missionId}
            >
              MISSION
            </button>
            <button
              className={styles.chatSend}
              onClick={handleSendMessage}
              disabled={!chatInput.trim()}
            >
              SEND
            </button>
          </div>
        </>
      ) : (
        /* evidence tab */
        <div className={styles.evidenceList}>
          <div className={styles.evidenceStats}>
            <span className={styles.evidenceStat}>
              <span className={styles.evidenceStatNum}>{evidence.length}</span> ITEMS
            </span>
            <span className={styles.evidenceStatDivider}>|</span>
            <span className={styles.evidenceStat}>
              <span className={styles.evidenceStatNum}>{clues.length}</span> CLUES
            </span>
          </div>

          <div className={styles.evidenceItems}>
            {evidence.length === 0 ? (
              <div className={styles.evidenceEmpty}>
                <span className={styles.evidenceEmptyIcon}>&#128269;</span>
                <span>No evidence collected yet. Investigate locations to gather intel.</span>
              </div>
            ) : (
              evidence.map((item) => (
                <div
                  key={item.id}
                  className={`${styles.evidenceCard} ${styles.evidenceCardClickable} ${item.audioSrc ? styles.evidenceCardAudio : ''}`}
                  style={{ '--rarity': RARITY_COLORS[item.rarity] || RARITY_COLORS.common }}
                  onClick={() => setSelectedEvidence(item)}
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles.evidenceIcon}>
                    {ICON_MAP[item.icon] || '\u{1F4CE}'}
                  </div>
                  <div className={styles.evidenceContent}>
                    <div className={styles.evidenceTop}>
                      <span className={styles.evidenceName}>{item.name}</span>
                      <span
                        className={styles.evidenceRarity}
                        style={{ color: RARITY_COLORS[item.rarity] }}
                      >
                        {item.rarity.toUpperCase()}
                      </span>
                    </div>
                    <span className={styles.evidenceDesc}>{item.description}</span>
                    {item.audioSrc && (
                      <button
                        className={`${styles.audioPlayBtn} ${playingAudio === item.id ? styles.audioPlaying : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePlayAudio(item.id, item.audioSrc)
                        }}
                      >
                        {playingAudio === item.id ? (
                          <><span className={styles.audioWaveAnim} /> PLAYING... CLICK TO STOP</>
                        ) : (
                          <><span className={styles.audioPlayIcon}>&#9654;</span> PLAY INTERCEPTED AUDIO</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <audio ref={audioRef} preload="none" />

      {/* evidence detail modal — portaled to body */}
      {selectedEvidence && createPortal(
        <div className={styles.evidenceModalOverlay} onClick={() => setSelectedEvidence(null)}>
          <div className={styles.evidenceModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.evidenceModalHeader}>
              <span className={styles.evidenceModalIcon}>
                {ICON_MAP[selectedEvidence.icon] || '\u{1F4CE}'}
              </span>
              <span className={styles.evidenceModalTitle}>{selectedEvidence.name}</span>
              <span
                className={styles.evidenceModalRarity}
                style={{ color: RARITY_COLORS[selectedEvidence.rarity] }}
              >
                {selectedEvidence.rarity.toUpperCase()}
              </span>
            </div>
            <div className={styles.evidenceModalBody}>
              <div className={styles.evidenceModalSection}>
                <span className={styles.evidenceModalLabel}>FULL INTEL</span>
                <p className={styles.evidenceModalText}>{selectedEvidence.description}</p>
              </div>
              {selectedEvidence.fromLocation && (
                <div className={styles.evidenceModalSection}>
                  <span className={styles.evidenceModalLabel}>SOURCE</span>
                  <p className={styles.evidenceModalMeta}>{selectedEvidence.fromLocation}</p>
                </div>
              )}
              {selectedEvidence.audioSrc && (
                <div className={styles.evidenceModalSection}>
                  <button
                    className={`${styles.audioPlayBtn} ${playingAudio === selectedEvidence.id ? styles.audioPlaying : ''}`}
                    onClick={() => handlePlayAudio(selectedEvidence.id, selectedEvidence.audioSrc)}
                  >
                    {playingAudio === selectedEvidence.id ? (
                      <><span className={styles.audioWaveAnim} /> PLAYING... CLICK TO STOP</>
                    ) : (
                      <><span className={styles.audioPlayIcon}>&#9654;</span> PLAY INTERCEPTED AUDIO</>
                    )}
                  </button>
                </div>
              )}
            </div>
            <button className={styles.evidenceModalClose} onClick={() => setSelectedEvidence(null)}>
              CLOSE
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
