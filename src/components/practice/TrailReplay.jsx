import { useEffect, useRef, useState } from 'react'
import { getTarget } from '../../config/targets'
import { DEFAULT_ASPECT, fitToBox, toUserView } from '../../utils/trail'

const REPLAY_DURATION_MS = 1500

/**
 * Animated replay of a fingertip trail, shown from the patient's point of view
 * and scaled to fill the box, with the ideal shape faintly behind it.
 * Props:
 *   points    — [[x, y, t_ms], ...] raw camera coords (not mirrored)
 *   target    — target id (for the ideal outline)
 *   aspect    — video width/height when recorded (default 16:9)
 *   color     — stroke colour (hex)
 *   showIdeal — draw the ideal outline
 *   size      — canvas size in px
 */
export function TrailReplay({
  points = [], target = '', letter, aspect = DEFAULT_ASPECT, color = '#1f4f36', showIdeal = true, size = 220,
}) {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const id = target || letter || ''

  function drawReplay(progress) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || '#f7f2eb'
    ctx.fillRect(0, 0, w, h)

    // Ideal shape, fitted the same way as the trail so they line up
    const outline = getTarget(id).outline
    if (showIdeal && outline.length) {
      const all = outline.flat()
      const map = fitToBox(all, w)
      ctx.save()
      ctx.strokeStyle = 'rgba(100, 80, 55, 0.18)'
      ctx.lineWidth = 10
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const line of outline) {
        ctx.beginPath()
        line.forEach((p, i) => {
          const [x, y] = map(p)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.stroke()
      }
      ctx.restore()
    }

    if (points.length < 2) return
    const xy = toUserView(points, aspect)
    const map = fitToBox(xy, w)
    const count = Math.max(2, Math.floor(xy.length * progress))
    for (let i = 1; i < count; i++) {
      const alpha = 0.25 + (i / count) * 0.75
      const [x0, y0] = map(xy[i - 1])
      const [x1, y1] = map(xy[i])
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.strokeStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0')
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.stroke()
    }
    const [cx, cy] = map(xy[count - 1])
    ctx.beginPath()
    ctx.arc(cx, cy, 5, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  function startReplay() {
    if (playing || points.length < 2) return
    setPlaying(true)
    const start = performance.now()
    function frame(now) {
      const progress = Math.min(1, (now - start) / REPLAY_DURATION_MS)
      drawReplay(progress)
      if (progress < 1) rafRef.current = requestAnimationFrame(frame)
      else setPlaying(false)
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  useEffect(() => {
    drawReplay(1)
    const timer = points.length >= 2 ? setTimeout(startReplay, 250) : null
    return () => {
      if (timer) clearTimeout(timer)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, id, aspect])

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded border border-[var(--color-border)]"
        style={{ width: size, height: size }}
        aria-label={`Replay of your drawing next to the ideal ${getTarget(id).name.toLowerCase()}`}
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
