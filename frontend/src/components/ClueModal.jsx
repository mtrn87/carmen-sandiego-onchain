import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import styles from './ClueModal.module.css'

const CLUE_TYPE_COLORS = {
  BEHAVIOR_FINGERPRINT: '#00e5ff',
  RELATIONSHIP: '#ba68c8',
  IDENTITY_COMMIT: '#ffd740',
  FUNDING_TRAIL: '#69f0ae',
  TECHNICAL_SIGNATURE: '#ff8a65',
  DEAD_END: '#ff5252',
}

const MEDIA_TYPE_LABELS = {
  audio: 'AUDIO INTERCEPT',
  image: 'VISUAL INTERCEPT',
  text: 'TEXT INTERCEPT',
}

export default function ClueModal() {
  const {
    showCityClueModal,
    activeCityClue,
    closeCityClueModal,
    cityLocations,
  } = useGameStore()
  const audioRef = useRef(null)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    if (!showCityClueModal) return
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') closeCityClueModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showCityClueModal, closeCityClueModal])

  // Reset media state when clue changes
  useEffect(() => {
    setAudioPlaying(false)
    setImageLoaded(false)
    setImageError(false)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }, [activeCityClue])

  // Pause audio when modal closes
  useEffect(() => {
    if (!showCityClueModal && audioRef.current) {
      audioRef.current.pause()
      setAudioPlaying(false)
    }
  }, [showCityClueModal])

  if (!showCityClueModal || !activeCityClue) return null

  const clue = activeCityClue
  const location = cityLocations[clue.locationIdx]
  const locationName = location?.name || `Location ${clue.locationIdx}`
  const typeColor = CLUE_TYPE_COLORS[clue.clueType] || '#00e5ff'
  const strengthPct = Math.min(100, Math.max(0, clue.strength || 0))
  const refShort = clue.anomalyRefId
    ? `${clue.anomalyRefId.slice(0, 10)}...`
    : '????'
  const mediaType = clue.mediaType || 'text'
  const mediaLabel = MEDIA_TYPE_LABELS[mediaType] || MEDIA_TYPE_LABELS.text

  const handleToggleAudio = () => {
    if (!audioRef.current) return
    if (audioPlaying) {
      audioRef.current.pause()
      setAudioPlaying(false)
    } else {
      audioRef.current.play().catch(() => setAudioPlaying(false))
      setAudioPlaying(true)
    }
  }

  return (
    <div className={styles.overlay} onClick={closeCityClueModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.scanlines} />

        {/* header */}
        <div className={styles.header}>
          <div className={styles.headerDots}>
            <span className={styles.dot} data-color="red" />
            <span className={styles.dot} data-color="yellow" />
            <span className={styles.dot} data-color="green" />
          </div>
          <span className={styles.headerTitle}>acme_clue_interceptor.exe</span>
          <span className={styles.headerBlink}>&#9679; LIVE</span>
        </div>

        {/* body */}
        <div className={styles.body}>
          {/* clue type tag + hit/dead-end indicator */}
          <div className={styles.tagRow}>
            <span
              className={styles.clueTypeTag}
              style={{ borderColor: typeColor, color: typeColor }}
            >
              {clue.clueType}
            </span>
            <span
              className={clue.isDeadEnd ? styles.deadEndBadge : styles.hitBadge}
            >
              {clue.isDeadEnd ? 'DEAD END' : 'HIT'}
            </span>
          </div>

          {/* source location + media type */}
          <div className={styles.sourceRow}>
            <span className={styles.sourceLabel}>SOURCE:</span>
            <span className={styles.sourceValue}>{locationName}</span>
            {mediaType !== 'text' && (
              <span className={styles.mediaBadge} data-media={mediaType}>
                {mediaLabel}
              </span>
            )}
          </div>

          {/* clue content — text / audio / image */}
          {mediaType === 'audio' && clue.mediaSrc ? (
            <div className={styles.audioSection}>
              <div className={clue.isDeadEnd ? styles.clueTextDeadEnd : styles.clueText}>
                {clue.data}
              </div>
              <button
                className={`${styles.audioBtn} ${audioPlaying ? styles.audioBtnActive : ''}`}
                onClick={handleToggleAudio}
              >
                <span className={styles.audioIcon}>
                  {audioPlaying ? '■' : '▶'}
                </span>
                {audioPlaying ? 'STOP PLAYBACK' : 'PLAY INTERCEPTED AUDIO'}
                {audioPlaying && <span className={styles.audioWave}>▁▃▅▇▅▃▁</span>}
              </button>
              <audio
                ref={audioRef}
                src={clue.mediaSrc}
                preload="none"
                onEnded={() => setAudioPlaying(false)}
              />
            </div>
          ) : mediaType === 'image' && clue.mediaSrc ? (
            <div className={styles.imageSection}>
              <div className={clue.isDeadEnd ? styles.clueTextDeadEnd : styles.clueText}>
                {clue.data}
              </div>
              <div className={styles.imageContainer}>
                {!imageLoaded && !imageError && (
                  <div className={styles.imageLoading}>DECRYPTING VISUAL DATA...</div>
                )}
                {imageError && (
                  <div className={styles.imageError}>VISUAL DATA CORRUPTED — DECRYPTION FAILED</div>
                )}
                <img
                  className={`${styles.clueImage} ${imageLoaded ? styles.clueImageVisible : ''}`}
                  src={clue.mediaSrc}
                  alt="Intercepted visual evidence"
                  loading="lazy"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                />
              </div>
            </div>
          ) : (
            <div
              className={clue.isDeadEnd ? styles.clueTextDeadEnd : styles.clueText}
            >
              {clue.data}
            </div>
          )}

          {/* strength bar */}
          <div className={styles.strengthSection}>
            <div className={styles.strengthLabel}>
              <span>SIGNAL STRENGTH</span>
              <span>{strengthPct}/100</span>
            </div>
            <div className={styles.strengthTrack}>
              <div
                className={styles.strengthFill}
                style={{
                  width: `${strengthPct}%`,
                  background:
                    strengthPct >= 75
                      ? '#69f0ae'
                      : strengthPct >= 50
                        ? '#ffd740'
                        : '#ff5252',
                }}
              />
            </div>
          </div>

          {/* anomaly ref */}
          <div className={styles.refId}>anomaly ref: {refShort}</div>
        </div>

        {/* footer */}
        <button className={styles.closeBtn} onClick={closeCityClueModal}>
          <span className={styles.btnFlicker}>&gt; ACKNOWLEDGE</span>
        </button>
      </div>
    </div>
  )
}
