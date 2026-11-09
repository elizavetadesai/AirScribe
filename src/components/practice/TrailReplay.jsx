import { useEffect, useRef, useState } from 'react'

const REPLAY_DURATION_MS = 1500

/**
 * Animated replay of a fingertip trail.
 * Props:
 *   points    — [[x, y, t_ms], ...]
 *   color     — stroke color (default forest green)
 *   showIdeal — whether to show ideal letter watermark
 *   letter    — target letter
 *   size      — canvas size in px
 */
export function TrailReplay({ points = [], color = '#1f4f36', showIdeal = true, letter = '', size = 220 }) {
  const canvasRef = useRef(null)
  const [playing, setPlaying] = useState(false)

  function drawReplay(progress) {
    const canvas = canvasRef.current
    if (!canvas || !points.length) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height

    ctx.clearRect(0, 0, w, h)

    // Warm cream background
    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--canvas-bg').trim() || '#f7f2eb'
    ctx.fillRect(0, 0, w, h)

    // Ideal letter watermark
    if (showIdeal && letter) {
      ctx.save()
      ctx.font = `700 ${w * 0.52}px "Playfair Display", Georgia, serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(100, 80, 55, 0.07)'
      ctx.fillText(letter, w / 2, h / 2)
      ctx.restore()
    }

    if (!points.length) return

    const count = Math.max(2, Math.floor(points.length * progress))
    const slice = points.slice(0, count)

    for (let i = 1; i < slice.length; i++) {
      const alpha = 0.25 + (i / slice.length) * 0.75
      const prev = slice[i - 1]
      const curr = slice[i]
      const x0 = (1 - prev[0]) * w
      const y0 = prev[1] * h
      const x1 = (1 - curr[0]) * w
      const y1 = curr[1] * h

      // Parse color and add alpha
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.strokeStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0')
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
    }

    // Final dot
    if (slice.length > 0) {
      const last = slice[slice.length - 1]
      ctx.beginPath()
      ctx.arc((1 - last[0]) * w, last[1] * h, 5, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }
  }

  function startReplay() {
    if (playing || points.length < 2) return
    setPlaying(true)
    const start = performance.now()
    function frame(now) {
      const progress = Math.min(1, (now - start) / REPLAY_DURATION_MS)
      drawReplay(progress)
      if (progress < 1) requestAnimationFrame(frame)
      else setPlaying(false)
    }
    requestAnimationFrame(frame)
  }

  useEffect(() => {
    if (points.length >= 2) {
      drawReplay(1)
      setTimeout(startReplay, 250)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, letter])

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded border border-[var(--color-border)]"
        style={{ width: size, height: size }}
        aria-label={`Trail replay for letter ${letter}`}
      />
      <button
        onClick={startReplay}
        disabled={playing || points.length < 2}
        className="label-caps text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 rounded px-2 py-1 min-h-[44px] transition-colors"
        aria-label="Replay trail"
      >
        {playing ? 'Playing…' : 'Replay'}
      </button>
    </div>
  )
}
