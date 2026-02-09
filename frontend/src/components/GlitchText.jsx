import { useState, useEffect } from 'react'
import styles from './GlitchText.module.css'

export default function GlitchText({ text, className = '', as: Tag = 'span' }) {
  const [glitching, setGlitching] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitching(true)
      setTimeout(() => setGlitching(false), 200)
    }, 3000 + Math.random() * 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Tag
      className={`${styles.glitch} ${glitching ? styles.active : ''} ${className}`}
      data-text={text}
    >
      {text}
    </Tag>
  )
}
