import { useState, useEffect, useCallback } from 'react'
import { CameraCanvas } from '../components/practice/CameraCanvas'
import { HandStatus } from '../components/practice/HandStatus'
import { ResultCard } from '../components/practice/ResultCard'
import { TargetGlyph } from '../components/practice/TargetGlyph'
import { Button } from '../components/ui/Button'
import { Alert } from '../components/ui/Alert'
import { Spinner } from '../components/ui/Spinner'
import { LEVELS, TARGETS, getTarget, randomTarget } from '../config/targets'
import { predict } from '../api/endpoints'
import { useCamera } from '../hooks/useCamera'
import { useHandTracker } from '../hooks/useHandTracker'
import { videoAspect } from '../utils/trail'

const MIN_POINTS = 10
const LEVEL_KEY = 'airscribe_level'

function readLevel() {
  try {
    const v = localStorage.getItem(LEVEL_KEY)
    return v === '1' ? 1 : v === '2' ? 2 : 'all'
  } catch {
    return 'all'
  }
}

export default function Practice() {
  const [level, setLevel] = useState(readLevel)
  const [targetLetter, setTargetLetter] = useState(() => randomTarget(null, readLevel()))
  const [manualPicker, setManualPicker] = useState(false)
  const [phase, setPhase] = useState('idle')
  const [result, setResult] = useState(null)
  const [finalTrail, setFinalTrail] = useState([])
  const [aspect, setAspect] = useState(undefined)
  const [submitError, setSubmitError] = useState(null)

  const camera = useCamera()
  const tracker = useHandTracker(camera.videoRef)
  const target = getTarget(targetLetter)

  useEffect(() => {
    camera.start()
    return () => camera.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Back to idle without changing the target
  const resetAttempt = useCallback(() => {
    setResult(null)
    setFinalTrail([])
    setSubmitError(null)
    tracker.clearTrail()
    setPhase('idle')
  }, [tracker])

  const handleStart = useCallback(() => {
    if (!tracker.isReady || !camera.active) return
    tracker.startRecording()
    setPhase('recording')
    setResult(null)
    setSubmitError(null)
  }, [tracker, camera.active])

  const handleStop = useCallback(async () => {
    if (phase !== 'recording') return
    const pts = tracker.stopRecording()
    setPhase('submitting')

    if (pts.length < MIN_POINTS) {
      setSubmitError(`Too few points recorded (${pts.length}/${MIN_POINTS}). Keep your hand in frame and draw more deliberately.`)
      setPhase('error')
      return
    }

    const a = videoAspect(camera.videoRef.current)
    setAspect(a)
    setFinalTrail(pts)
    try {
      const res = await predict(targetLetter, pts, a)
      setResult(res)
      setPhase('result')
    } catch (err) {
      setSubmitError(err.message)
      setPhase('error')
    }
  }, [phase, tracker, targetLetter, camera.videoRef])

  const handleNext = useCallback(() => {
    setTargetLetter(prev => randomTarget(prev, level))
    resetAttempt()
  }, [resetAttempt, level])

  function chooseTarget(id) {
    setTargetLetter(id)
    setManualPicker(false)
    resetAttempt()
  }

  function chooseLevel(l) {
    setLevel(l)
    try { localStorage.setItem(LEVEL_KEY, String(l)) } catch { /* private mode */ }
    if (l !== 'all' && target.level !== l) {
      setTargetLetter(randomTarget(null, l))
      resetAttempt()
    }
  }

  useEffect(() => {
    function onKey(e) {
      if (e.code !== 'Space' || e.target !== document.body) return
      e.preventDefault()
      if (phase === 'idle') handleStart()
      else if (phase === 'recording') handleStop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, handleStart, handleStop])

  const isActive = phase === 'recording'
  const canStart = tracker.isReady && camera.active && phase === 'idle'
  const isLoading = !tracker.isReady || camera.loading
  const pickerTargets = TARGETS.filter(t => level === 'all' || t.level === level)

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-caps">Practice</span>
          <h1 className="font-display text-2xl font-semibold text-[var(--color-text)] mt-1">
            Air-drawing session
          </h1>
        </div>
        <div className="flex gap-2" role="group" aria-label="Difficulty level">
          {[{ level: 'all', name: 'All' }, ...LEVELS].map(l => (
            <button
              key={l.level}
              onClick={() => chooseLevel(l.level)}
              aria-pressed={level === l.level}
              className={[
                'min-h-[44px] px-4 rounded border-2 text-xs tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600',
                level === l.level
                  ? 'border-forest-700 bg-forest-50 dark:bg-forest-900/30 text-forest-800 dark:text-forest-200'
                  : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-forest-400',
              ].join(' ')}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>

      {isLoading && !camera.error && !tracker.initError && (
        <div className="flex flex-col items-center gap-4 py-20">
          <Spinner size="lg" />
          <p className="label-caps">
            {!camera.active ? 'Starting camera' : 'Loading hand tracker'}
          </p>
        </div>
      )}

      {(camera.error || tracker.initError) && (
        <div className="space-y-4 max-w-xl">
          {camera.error && <Alert variant="error" title="Camera unavailable">{camera.error}</Alert>}
          {camera.permissionDenied && (
            <Button onClick={camera.start} variant="secondary" size="md">Retry camera</Button>
          )}
          {tracker.initError && <Alert variant="error" title="Hand tracker error">{tracker.initError}</Alert>}
        </div>
      )}

      {!isLoading && !camera.error && !tracker.initError && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <CameraCanvas
              videoRef={camera.videoRef}
              attachVideo={camera.attachVideo}
              trail={tracker.trail}
              isRecording={isActive}
            />
            <div className="flex items-center justify-between">
              <HandStatus detected={tracker.handDetected} warning={tracker.handGoneWarning} />
              <span className="label-caps">{tracker.trail.length} pts</span>
            </div>
            {tracker.handGoneWarning && phase === 'recording' && (
              <Alert variant="warning">
                Your hand left the frame. Keep your index finger visible throughout the movement.
              </Alert>
            )}
          </div>

          <div className="space-y-6">
            <div className="border border-[var(--color-border)] rounded-lg p-8 bg-[var(--color-surface)]">
              <span className="label-caps block mb-4">Draw this in the air</span>

              {manualPicker ? (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
                  {pickerTargets.map(t => (
                    <button
                      key={t.id}
                      onClick={() => chooseTarget(t.id)}
                      className={[
                        'flex flex-col items-center justify-center gap-1 min-h-[72px] rounded border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600',
                        t.id === targetLetter
                          ? 'border-forest-700 bg-forest-50 dark:bg-forest-900/30 text-forest-800 dark:text-forest-200'
                          : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-forest-400',
                      ].join(' ')}
                      aria-pressed={t.id === targetLetter}
                      aria-label={`Select ${t.name}`}
                    >
                      <TargetGlyph id={t.id} size={34} />
                      <span className="text-[11px]">{t.short}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-6 py-2" aria-live="polite">
                  <TargetGlyph id={targetLetter} size={128} strokeWidth={0.12}
                    className="text-forest-800 dark:text-forest-300 shrink-0" />
                  <div>
                    <div className="font-display text-2xl font-semibold text-[var(--color-text)]">{target.name}</div>
                    <p className="text-sm text-[var(--color-muted)] mt-2 leading-relaxed">{target.hint}</p>
                  </div>
                </div>
              )}

              <button
                onClick={() => setManualPicker(p => !p)}
                className="label-caps text-[var(--color-muted)] hover:text-[var(--color-text)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 rounded px-1 py-1 min-h-[44px] transition-colors mt-2"
              >
                {manualPicker ? 'Cancel' : 'Choose a different target'}
              </button>
            </div>

            {(phase === 'idle' || phase === 'recording') && (
              <div className="space-y-3">
                {phase === 'idle' ? (
                  <button
                    onClick={handleStart}
                    disabled={!canStart}
                    className="w-full h-14 label-caps text-[var(--color-surface)] bg-forest-700 hover:bg-forest-800 disabled:bg-forest-300 dark:disabled:bg-forest-900 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 focus-visible:ring-offset-2"
                    aria-label={`Start recording ${target.name}`}
                  >
                    Start
                    <span className="ml-3 text-forest-300 font-mono text-xs">Space</span>
                  </button>
                ) : (
                  <button
                    onClick={handleStop}
                    className="w-full h-14 label-caps text-white bg-red-700 hover:bg-red-800 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
                    aria-label="Stop recording"
                  >
                    Stop
                    <span className="ml-3 text-red-300 font-mono text-xs">Space</span>
                  </button>
                )}
                {phase === 'idle' && (
                  <p className="label-caps text-center">
                    Point your index finger at the camera, press Start, draw, then press Stop
                  </p>
                )}
              </div>
            )}

            {phase === 'submitting' && (
              <div className="flex flex-col items-center gap-3 py-10">
                <Spinner size="lg" />
                <p className="label-caps">Analysing your movement</p>
              </div>
            )}

            {phase === 'error' && submitError && (
              <div className="space-y-4">
                <Alert variant="error" title="Could not process attempt">{submitError}</Alert>
                <Button variant="secondary" size="md" className="w-full" onClick={resetAttempt}>
                  Try again
                </Button>
              </div>
            )}

            {phase === 'result' && result && (
              <ResultCard
                result={result}
                targetLetter={targetLetter}
                trail={finalTrail}
                aspect={aspect}
                onNext={handleNext}
                onRetry={resetAttempt}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
