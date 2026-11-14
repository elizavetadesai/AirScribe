import { useEffect, useRef } from 'react'

/**
 * Renders the webcam feed + live fingertip trail canvas overlay.
 * Video is CSS-mirrored; trail coords stored un-mirrored, X flipped for drawing only.
 */
export function CameraCanvas({ videoRef, attachVideo, trail, isRecording }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const video = videoRef.current
    if (!video) return

    function resize() {
      canvas.width = video.videoWidth || canvas.offsetWidth
      canvas.height = video.videoHeight || canvas.offsetHeight
    }

    function draw() {
      resize()
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (!trail || trail.length < 2) return

      const w = canvas.width
      const h = canvas.height

      for (let i = 1; i < trail.length; i++) {
        const alpha = 0.2 + (i / trail.length) * 0.8
        const prev = trail[i - 1]
        const curr = trail[i]
        const x0 = (1 - prev[0]) * w
        const y0 = prev[1] * h
        const x1 = (1 - curr[0]) * w
        const y1 = curr[1] * h

        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        // Forest green trail
        ctx.strokeStyle = `rgba(31, 79, 54, ${alpha})`
        ctx.lineWidth = 3.5
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()
      }

      // Fingertip dot
      if (trail.length > 0) {
        const last = trail[trail.length - 1]
        const cx = (1 - last[0]) * w
        const cy = last[1] * h

        ctx.beginPath()
        ctx.arc(cx, cy, 9, 0, Math.PI * 2)
        ctx.fillStyle = isRecording ? 'rgba(180, 60, 60, 0.9)' : 'rgba(31, 79, 54, 0.9)'
        ctx.fill()

        ctx.beginPath()
        ctx.arc(cx, cy, 12, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }

    draw()
  }, [trail, videoRef, isRecording])

  return (
    <div className="relative w-full aspect-video bg-bark-900 rounded-lg overflow-hidden">
      <video
        ref={attachVideo || videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
        muted
        playsInline
        autoPlay
        aria-label="Webcam feed"
      />
      {/* object-cover matches the video's cropping, so the trail stays on the
          fingertip even when the camera is 4:3 inside this 16:9 box */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        aria-hidden
      />
      {/* Recording indicator — text only, no emoji */}
      {isRecording && (
        <div className="absolute top-3 right-3 flex items-center gap-2 bg-red-700/90 text-white px-3 py-1 rounded text-xs tracking-widest uppercase font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" aria-hidden />
          Recording
        </div>
      )}
    </div>
  )
}
