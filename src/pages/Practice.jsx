import { useState, useEffect, useCallback } from 'react'
import { CameraCanvas } from '../components/practice/CameraCanvas'
import { HandStatus } from '../components/practice/HandStatus'
import { ResultCard } from '../components/practice/ResultCard'
import { Button } from '../components/ui/Button'
import { Alert } from '../components/ui/Alert'
import { Spinner } from '../components/ui/Spinner'
import { LETTERS, randomLetter } from '../config/letters'
import { predict } from '../api/endpoints'
import { useCamera } from '../hooks/useCamera'
import { useHandTracker } from '../hooks/useHandTracker'

const MIN_POINTS = 10

export default function Practice() {
  const [targetLetter, setTargetLetter] = useState(() => randomLetter())
  const [manualPicker, setManualPicker] = useState(false)
  const [phase, setPhase] = useState('idle')
  const [result, setResult] = useState(null)
  const [finalTrail, setFinalTrail] = useState([])
  const [submitError, setSubmitError] = useState(null)

  const camera = useCamera()
  const tracker = useHandTracker(camera.videoRef)

  useEffect(() => {
    camera.start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.code !== 'Space' || e.target !== document.body) return
      e.preventDefault()
      if (phase === 'idle') handleStart()
      else if (phase === 'recording') handleStop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

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
      setSubmitError(`Too few points recorded (${pts.length}/${MIN_POINTS}). Keep your hand in frame and write more deliberately.`)
      setPhase('error')
      return
    }

    setFinalTrail(pts)
    try {
      const res = await predict(targetLetter, pts)
      setResult(res)
      setPhase('result')
    } catch (err) {
      setSubmitError(err.message)
      setPhase('error')
    }
  }, [phase, tracker, targetLetter])

  const handleNext = useCallback(() => {
    setTargetLetter(prev => randomLetter(prev))
    setResult(null)
    setFinalTrail([])
    setSubmitError(null)
    tracker.clearTrail()
    setPhase('idle')
  }, [tracker])

  const isActive = phase === 'recording'
  const canStart = tracker.isReady && camera.active && phase === 'idle'
  const isLoading = !tracker.isReady || camera.loading

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="mb-8">
        <span className="label-caps">Practice</span>
        <h1 className="font-display text-2xl font-semibold text-[var(--color-text)] mt-1">
          Air-writing session
        </h1>
      </div>

      {/* Loading state */}
      {isLoading && !camera.error && !tracker.initError && (
        <div className="flex flex-col items-center gap-4 py-20">
          <Spinner size="lg" />
          <p className="label-caps">
            {!camera.active ? 'Starting camera' : 'Loading hand tracker'}
          </p>
        </div>
      )}

      {/* Error states */}
      {(camera.error || tracker.initError) && (
        <div className="space-y-4 max-w-xl">
          {camera.error && <Alert variant="error" title="Camera unavailable">{camera.error}</Alert>}
          {camera.permissionDenied && (
            <Button onClick={camera.start} variant="secondary" size="md">Retry camera</Button>
          )}
          {tracker.initError && <Alert variant="error" title="Hand tracker error">{tracker.initError}</Alert>}
        </div>
      )}

      {/* Main layout */}
      {!isLoading && !camera.error && !tracker.initError && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left — camera */}
          <div className="space-y-4">
            <CameraCanvas
              videoRef={camera.videoRef}
              trail={tracker.trail}
              isRecording={isActive}
            />

            <div className="flex items-center justify-between">
              <HandStatus detected={tracker.handDetected} warning={tracker.handGoneWarning} />
              <span className="label-caps">{tracker.trail.length} pts</span>
            </div>

            {tracker.handGoneWarning && phase === 'recording' && (
              <Alert variant="warning">
                Your hand left the frame. Keep your index finger visible throughout the stroke.
              </Alert>
            )}
          </div>

          {/* Right — controls */}
          <div className="space-y-6">
            {/* Target letter panel */}
            <div className="border border-[var(--color-border)] rounded-lg p-8 bg-[var(--color-surface)]">
              <span className="label-caps block mb-4">Write this letter</span>

              {manualPicker ? (
                <div className="flex flex-wrap gap-2 mb-4">
                  {LETTERS.map(l => (
                    <button
                      key={l}
                      onClick={() => { setTargetLetter(l); setManualPicker(false); handleNext() }}
                      className={[
                        'h-12 w-12 rounded border-2 font-display text-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600',
                        l === targetLetter
                          ? 'border-forest-700 bg-forest-50 dark:bg-forest-900/30 text-forest-800 dark:text-forest-200'
                          : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-forest-400',
                      ].join(' ')}
                      aria-pressed={l === targetLetter}
                      aria-label={`Select letter ${l}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              ) : (
                <div
                  className="font-display text-[8rem] font-bold text-forest-800 dark:text-forest-300 leading-none py-2 select-none"
                  aria-live="polite"
                  aria-label={`Target letter: ${targetLetter}`}
                >
                  {targetLetter}
                </div>
              )}

              <button
                onClick={() => setManualPicker(p => !p)}
                className="label-caps text-[var(--color-muted)] hover:text-[var(--color-text)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 rounded px-1 py-1 min-h-[44px] transition-colors mt-2"
              >
                {manualPicker ? 'Cancel' : 'Choose a different letter'}
              </button>
            </div>

            {/* Controls */}
            {(phase === 'idle' || phase === 'recording') && (
              <div className="space-y-3">
                {phase === 'idle' ? (
                  <button
                    onClick={handleStart}
                    disabled={!canStart}
                    className="w-full h-14 label-caps text-[var(--color-surface)] bg-forest-700 hover:bg-forest-800 disabled:bg-forest-300 dark:disabled:bg-forest-900 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 focus-visible:ring-offset-2"
                    aria-label={`Start recording letter ${targetLetter}`}
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
                    {!tracker.isReady
                      ? 'Waiting for hand tracker'
                      : !camera.active
                      ? 'Waiting for camera'
                      : 'Point your index finger at the camera and press Start'}
                  </p>
                )}
              </div>
            )}

            {/* Submitting */}
            {phase === 'submitting' && (
              <div className="flex flex-col items-center gap-3 py-10">
                <Spinner size="lg" />
                <p className="label-caps">Analysing your movement</p>
              </div>
            )}

            {/* Error */}
            {phase === 'error' && submitError && (
              <div className="space-y-4">
                <Alert variant="error" title="Could not process attempt">{submitError}</Alert>
                <Button variant="secondary" size="md" className="w-full" onClick={() => setPhase('idle')}>
                  Try again
                </Button>
              </div>
            )}

            {/* Result */}
            {phase === 'result' && result && (
              <ResultCard
                result={result}
                targetLetter={targetLetter}
                trail={finalTrail}
                onNext={handleNext}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
