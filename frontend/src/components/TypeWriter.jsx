import { useState, useEffect } from 'react'

export default function TypeWriter({
  text,
  speed = 40,
  delay = 0,
  onDone,
  className = '',
  cursor = true,
}) {
  const [displayed, setDisplayed] = useState('')
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => setStarted(true), delay)
    return () => clearTimeout(timeout)
  }, [delay])

  useEffect(() => {
    if (!started) return
    if (displayed.length >= text.length) {
      setDone(true)
      onDone?.()
      return
    }
    const timeout = setTimeout(() => {
      setDisplayed(text.slice(0, displayed.length + 1))
    }, speed)
    return () => clearTimeout(timeout)
  }, [started, displayed, text, speed, onDone])

  return (
    <span className={className}>
      {displayed}
      {cursor && !done && (
        <span style={{ animation: 'blink 0.7s step-end infinite', color: 'var(--cyan)' }}>
          _
        </span>
      )}
    </span>
  )
}
