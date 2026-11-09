import { useState, useRef, useCallback } from 'react'

/**
 * Manages webcam access via getUserMedia.
 * Returns videoRef to attach to a <video> element,
 * plus loading/error state and a stop function.
 */
export function useCamera() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [active, setActive] = useState(false)

  const start = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPermissionDenied(false)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setActive(true)
    } catch (err) {
      const name = err.name || ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setPermissionDenied(true)
        setError('Camera access was blocked. Please allow camera access in your browser settings and reload.')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('No camera found. Please connect a webcam and try again.')
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setError('Camera is in use by another application. Please close it and try again.')
      } else {
        setError('Could not start the camera. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setActive(false)
  }, [])

  return { videoRef, loading, error, permissionDenied, active, start, stop }
}
