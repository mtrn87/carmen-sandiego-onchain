import { useEffect, useRef } from 'react'

export default function CyberGrid() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animationId
    let time = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      time += 0.005
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // perspective grid
      const horizon = canvas.height * 0.55
      const gridLines = 30
      const gridCols = 40

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)'
      ctx.lineWidth = 1

      // horizontal lines with perspective
      for (let i = 0; i < gridLines; i++) {
        const t = i / gridLines
        const y = horizon + (canvas.height - horizon) * Math.pow(t, 1.5)
        const offset = (time * 200 * Math.pow(t, 1.5)) % (canvas.height * 0.05)

        ctx.beginPath()
        ctx.moveTo(0, y + offset)
        ctx.lineTo(canvas.width, y + offset)
        ctx.stroke()
      }

      // vertical lines with perspective
      const vanishX = canvas.width / 2
      for (let i = -gridCols / 2; i <= gridCols / 2; i++) {
        const spread = (i / (gridCols / 2))
        const bottomX = vanishX + spread * canvas.width * 0.8

        ctx.beginPath()
        ctx.moveTo(vanishX, horizon)
        ctx.lineTo(bottomX, canvas.height)
        ctx.stroke()
      }

      // horizon glow
      const gradient = ctx.createLinearGradient(0, horizon - 60, 0, horizon + 20)
      gradient.addColorStop(0, 'transparent')
      gradient.addColorStop(0.5, 'rgba(255, 0, 255, 0.08)')
      gradient.addColorStop(1, 'transparent')
      ctx.fillStyle = gradient
      ctx.fillRect(0, horizon - 60, canvas.width, 80)

      // floating particles
      for (let i = 0; i < 50; i++) {
        const x = ((i * 137.508 + time * 30) % canvas.width)
        const y = ((i * 97.3 + time * 15 + Math.sin(time + i) * 20) % (horizon - 40)) + 20
        const size = 1 + Math.sin(time * 2 + i) * 0.5
        const alpha = 0.2 + Math.sin(time * 3 + i * 0.5) * 0.15

        ctx.fillStyle = i % 3 === 0
          ? `rgba(0, 240, 255, ${alpha})`
          : i % 3 === 1
          ? `rgba(255, 0, 255, ${alpha})`
          : `rgba(5, 255, 161, ${alpha})`
        ctx.fillRect(x, y, size, size)
      }

      animationId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
