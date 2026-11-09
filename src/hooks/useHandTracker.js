import { useState, useRef, useCallback, useEffect } from 'react'

const MEDIAPIPE_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'

const MIN_DETECTION_CONFIDENCE = 0.6
const HAND_DISAPPEAR_WARNING_MS = 1500 // warn after 1.5 s without hand

/**
 * Loads MediaPipe HandLandmarker from CDN and runs detection
 * in a requestAnimationFrame loop on the given videoRef.
 *
 * Returns:
 *   isReady         — model loaded and ready
 *   initError       — string | null
 *   handDetected    — boolean (current frame)
 *   trail           — [[x, y, t_ms], ...] (normalized, NOT mirrored)
 *   isRecording     — boolean
 *   handGoneWarning — boolean (hand disappeared during recording)
 *   startRecording  — fn()
 *   stopRecording   — fn() → returns final trail
 *   clearTrail      — fn()
 */
export function useHandTracker(videoRef) {
  const [isReady, setIsReady] = useState(false)
  const [initError, setInitError] = useState(null)
  const [handDetected, setHandDetected] = useState(false)
  const [trail, setTrail] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [handGoneWarning, setHandGoneWarning] = useState(false)

  const landmarkerRef = useRef(null)
  const rafRef = useRef(null)
  const recordingRef = useRef(false)
  const startTimeRef = useRef(null)
  const trailRef = useRef([])
  const handGoneAtRef = useRef(null)

  // ── Load MediaPipe ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function loadMediaPipe() {
      try {
        const { HandLandmarker, FilesetResolver } =
          await import('@mediapipe/tasks-vision')

        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN)

        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: MIN_DETECTION_CONFIDENCE,
          minHandPresenceConfidence: MIN_DETECTION_CONFIDENCE,
          minTrackingConfidence: MIN_DETECTION_CONFIDENCE,
        })

        if (!cancelled) {
          landmarkerRef.current = landmarker
          setIsReady(true)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('MediaPipe load error:', err)
          setInitError('Could not load the hand-tracking model. Check your internet connection and reload.')
        }
      }
    }

    loadMediaPipe()
    return () => { cancelled = true }
  }, [])

  // ── Detection loop ─────────────────────────────────────────────────────────
  const detect = useCallback(() => {
    const video = videoRef.current
    const landmarker = landmarkerRef.current

    if (!landmarker || !video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detect)
      return
    }

    const now = performance.now()
    let result
    try {
      result = landmarker.detectForVideo(video, now)
    } catch {
      rafRef.current = requestAnimationFrame(detect)
      return
    }

    const hasHand = result.landmarks && result.landmarks.length > 0
    setHandDetected(hasHand)

    if (hasHand) {
      handGoneAtRef.current = null
      setHandGoneWarning(false)

      if (recordingRef.current) {
        const lm = result.landmarks[0]
        const tip = lm[8] // index fingertip
        const t_ms = startTimeRef.current !== null ? now - startTimeRef.current : 0

        // Store normalized coords WITHOUT mirroring — display mirroring is CSS-only
        const point = [tip.x, tip.y, Math.round(t_ms)]
        trailRef.current = [...trailRef.current, point]
        setTrail(prev => [...prev, point])
      }
    } else {
      // Track hand-gone duration during recording
      if (recordingRef.current) {
        if (!handGoneAtRef.current) {
          handGoneAtRef.current = now
        } else if (now - handGoneAtRef.current > HAND_DISAPPEAR_WARNING_MS) {
          setHandGoneWarning(true)
        }
      }
    }

    rafRef.current = requestAnimationFrame(detect)
  }, [videoRef])

  // Start/stop the RAF loop based on readiness
  useEffect(() => {
    if (!isReady) return
    rafRef.current = requestAnimationFrame(detect)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [isReady, detect])

  // ── Controls ───────────────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    trailRef.current = []
    setTrail([])
    setHandGoneWarning(false)
    handGoneAtRef.current = null
    startTimeRef.current = performance.now()
    recordingRef.current = true
    setIsRecording(true)
  }, [])

  const stopRecording = useCallback(() => {
    recordingRef.current = false
    setIsRecording(false)
    return trailRef.current
  }, [])

  const clearTrail = useCallback(() => {
    trailRef.current = []
    setTrail([])
    setHandGoneWarning(false)
  }, [])

  return {
    isReady,
    initError,
    handDetected,
    trail,
    isRecording,
    handGoneWarning,
    startRecording,
    stopRecording,
    clearTrail,
  }
}
