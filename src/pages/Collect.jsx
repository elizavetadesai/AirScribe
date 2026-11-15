import { useCallback, useEffect, useMemo, useState } from 'react'
import { CameraCanvas } from '../components/practice/CameraCanvas'
import { HandStatus } from '../components/practice/HandStatus'
import { TrailReplay } from '../components/practice/TrailReplay'
import { TargetGlyph } from '../components/practice/TargetGlyph'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Spinner } from '../components/ui/Spinner'
import { TARGETS, getTarget } from '../config/targets'
import { useCamera } from '../hooks/useCamera'
import { useHandTracker } from '../hooks/useHandTracker'
import { videoAspect } from '../utils/trail'

/**
 * Data-collection page for the training dataset (/collect, no login needed).
 *
 * Uses the same camera + MediaPipe code as the Practice page, so recorded
 * samples have exactly the format the live app sends to /predict.
 * Samples are kept in this browser (localStorage) until you download them.
 * Merge downloaded files with: python ml/data_prep/own_recordings.py recordings/*.json
 */

const STORE_KEY = 'airscribe_collect_samples_v1'
const PREFS_KEY = 'airscribe_collect_prefs_v2'
// "other" is not recorded: the model learns it from synthetic and public data
const CLASSES = TARGETS
// Every person records this many of each target; their file can only be downloaded once all targets reach it.
const MIN_PER_TARGET = 10
const MAX_GOAL = 15
const MIN_POINTS = 10
const STORAGE_WARN_BYTES = 3_500_000

function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

function download(filename, data) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function stamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

// Only text fields keep Space/Enter/Backspace for themselves (not checkboxes or buttons)
function isTyping(el) {
  if (!el) return false
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  return el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(el.type)
}

export default function Collect() {
  const prefs = loadJSON(PREFS_KEY, {})
  const [participant, setParticipant] = useState(prefs.participant || '')
  const [hand, setHand] = useState(prefs.hand || 'right')
  const [note, setNote] = useState(prefs.note || '')
  const [goal, setGoal] = useState(Math.min(MAX_GOAL, Math.max(MIN_PER_TARGET, prefs.goal || MIN_PER_TARGET)))
  const [consent, setConsent] = useState(false)
  const [samples, setSamples] = useState(() => loadJSON(STORE_KEY, []))
  const [manualTarget, setManualTarget] = useState('')
  const [phase, setPhase] = useState('idle') // idle | recording | review
  const [pending, setPending] = useState(null)
  const [message, setMessage] = useState(null)
  const [storageError, setStorageError] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const camera = useCamera()
  const tracker = useHandTracker(camera.videoRef)

  useEffect(() => {
    camera.start()
    return () => camera.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ participant, hand, note, goal }))
    } catch { /* ignore */ }
  }, [participant, hand, note, goal])

  const pid = participant.trim().toUpperCase()
  const mine = useMemo(() => samples.filter(s => s.participant === pid), [samples, pid])
  const counts = useMemo(() => {
    const c = Object.fromEntries(CLASSES.map(t => [t.id, 0]))
    mine.forEach(s => { c[s.label] = (c[s.label] || 0) + 1 })
    return c
  }, [mine])

  // Next target: the one with the fewest samples for this person (ties: list order)
  const autoTarget = useMemo(() => {
    let best = CLASSES[0].id
    for (const t of CLASSES) if (counts[t.id] < counts[best]) best = t.id
    return best
  }, [counts])
  const target = manualTarget || autoTarget
  const t = getTarget(target)
  const storageBytes = useMemo(() => JSON.stringify(samples).length, [samples])
  const ready = consent && /^[A-Z0-9_-]{2,12}$/.test(pid)

  function persist(next) {
    setSamples(next)
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next))
      setStorageError(null)
    } catch {
      setStorageError('Browser storage is full. Download the data now, then clear it, or new samples will be lost on reload.')
    }
  }

  const start = useCallback(() => {
    if (!ready || !tracker.isReady || !camera.active) return
    setMessage(null)
    tracker.startRecording()
    setPhase('recording')
  }, [ready, tracker, camera.active])

  const stop = useCallback(() => {
    const pts = tracker.stopRecording()
    const aspect = videoAspect(camera.videoRef.current)
    setPending({ points: pts, aspect })
    setPhase('review')
  }, [tracker, camera.videoRef])

  const discard = useCallback(() => {
    setPending(null)
    tracker.clearTrail()
    setPhase('idle')
    setMessage({ variant: 'info', text: 'Discarded.' })
  }, [tracker])

  const save = useCallback(() => {
    if (!pending) return
    const pts = pending.points
    if (pts.length < MIN_POINTS) {
      setMessage({ variant: 'warning', text: `Too short (${pts.length} points). Discard and try again.` })
      return
    }
    const dur = (pts[pts.length - 1][2] - pts[0][2]) / 1000
    const sample = {
      participant: pid, label: target, hand, note: note.trim(),
      fps: dur > 0 ? Math.round(((pts.length - 1) / dur) * 10) / 10 : null,
      aspect: Math.round(pending.aspect * 10000) / 10000,
      created: new Date().toISOString(), app: 'airscribe-collect', points: pts,
    }
    persist([...samples, sample])
    setPending(null)
    tracker.clearTrail()
    setPhase('idle')
    setMessage({ variant: 'success', text: `Saved ${t.name} (${counts[target] + 1}/${goal}).` })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, pid, target, hand, note, samples, tracker, counts, goal])

  useEffect(() => {
    function onKey(e) {
      if (isTyping(document.activeElement)) return
      // A clicked button/checkbox keeps focus; drop it so the key doesn't also "click" it
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur()
      if (e.code === 'Space') {
        e.preventDefault()
        if (phase === 'idle') start()
        else if (phase === 'recording') stop()
      } else if (phase === 'review' && e.key === 'Enter') {
        e.preventDefault()
        save()
      } else if (phase === 'review' && (e.key === 'Backspace' || e.key === 'Escape')) {
        e.preventDefault()
        discard()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, start, stop, save, discard])

  const loading = !tracker.isReady || camera.loading
  const doneAll = CLASSES.every(c => counts[c.id] >= goal)
  const missing = CLASSES.filter(c => (counts[c.id] || 0) < MIN_PER_TARGET)
  const canDownloadMine = mine.length > 0 && missing.length === 0

  return (
    <div className="max-w-6xl mx-auto animate-fade-in space-y-6">
      <div>
        <span className="label-caps">Team tool</span>
        <h1 className="font-display text-2xl font-semibold text-[var(--color-text)] mt-1">Record training data</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1 max-w-2xl">
          Draw each target once per recording, freely in the air (no guide). Vary your speed, size and distance
          from the camera. Discard any attempt where tracking was lost.
        </p>
      </div>

      {(camera.error || tracker.initError) && (
        <Alert variant="error" title="Camera or tracker unavailable">{camera.error || tracker.initError}</Alert>
      )}
      {storageError && <Alert variant="error" title="Storage full">{storageError}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          {loading && !camera.error ? (
            <div className="aspect-video flex flex-col items-center justify-center gap-3 border border-[var(--color-border)] rounded-lg">
              <Spinner size="lg" />
              <p className="label-caps">{!camera.active ? 'Starting camera' : 'Loading hand tracker'}</p>
            </div>
          ) : (
            <CameraCanvas videoRef={camera.videoRef} attachVideo={camera.attachVideo} trail={tracker.trail} isRecording={phase === 'recording'} />
          )}
          <div className="flex items-center justify-between">
            <HandStatus detected={tracker.handDetected} warning={tracker.handGoneWarning} />
            <span className="label-caps">{tracker.trail.length} pts</span>
          </div>

          <Card>
            <span className="label-caps block mb-3">Participant</span>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-[var(--color-muted)] space-y-1">
                <span>Anonymous ID (e.g. P01)</span>
                <input value={participant} onChange={e => setParticipant(e.target.value)} maxLength={12}
                  className="w-full h-11 px-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] uppercase" />
              </label>
              <label className="text-xs text-[var(--color-muted)] space-y-1">
                <span>Drawing hand</span>
                <select value={hand} onChange={e => setHand(e.target.value)}
                  className="w-full h-11 px-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                </select>
              </label>
              <label className="text-xs text-[var(--color-muted)] space-y-1">
                <span>Setting note (lighting, place)</span>
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={60} placeholder="e.g. daylight, desk"
                  className="w-full h-11 px-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]" />
              </label>
              <label className="text-xs text-[var(--color-muted)] space-y-1">
                <span>Goal per target</span>
                <input type="number" min={MIN_PER_TARGET} max={MAX_GOAL} value={goal}
                  onChange={e => setGoal(Math.max(MIN_PER_TARGET, Math.min(MAX_GOAL, Number(e.target.value) || MIN_PER_TARGET)))}
                  className="w-full h-11 px-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]" />
              </label>
            </div>
            <label className="flex items-start gap-3 mt-4 text-sm text-[var(--color-text)]">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 h-5 w-5" />
              <span>
                The participant agreed to take part. Only fingertip coordinates are saved: no video, no images,
                no name. The data is used for the CDS301 course project only.
              </span>
            </label>
            {!ready && (
              <p className="text-xs text-[var(--color-muted)] mt-3">
                Enter an ID (2-12 letters/numbers) and tick consent to start recording.
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="label-caps block mb-3">{manualTarget ? 'Chosen target' : 'Next target'}</span>
                <div className="flex items-center gap-5">
                  <TargetGlyph id={target} size={96} className="text-forest-800 dark:text-forest-300 shrink-0" />
                  <div>
                    <div className="font-display text-xl font-semibold text-[var(--color-text)]">
                      {t.name}
                    </div>
                    <p className="text-sm text-[var(--color-muted)] mt-1 leading-relaxed">{t.hint}</p>
                    <p className="label-caps mt-2">{counts[target] || 0} / {goal} recorded</p>
                    {manualTarget && counts[target] >= goal && (
                      <p className="text-xs text-forest-700 mt-1">Goal reached for this target. Pick another, or switch to Auto.</p>
                    )}
                  </div>
                </div>
              </div>
              <select aria-label="Choose target manually" value={manualTarget}
                onChange={e => { setManualTarget(e.target.value); e.target.blur() /* so Space starts recording */ }}
                className="h-11 px-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-xs">
                <option value="">Auto (fewest)</option>
                {CLASSES.map(c => <option key={c.id} value={c.id}>{c.name} ({counts[c.id]}/{goal})</option>)}
              </select>
            </div>
          </Card>

          {phase === 'idle' && (
            <Button size="lg" className="w-full" onClick={start} disabled={!ready || loading}>
              Start recording <span className="ml-3 font-mono text-xs opacity-70">Space</span>
            </Button>
          )}
          {phase === 'recording' && (
            <Button size="lg" variant="danger" className="w-full" onClick={stop}>
              Stop <span className="ml-3 font-mono text-xs opacity-70">Space</span>
            </Button>
          )}
          {phase === 'review' && pending && (
            <Card>
              <span className="label-caps block mb-3">Check this attempt ({pending.points.length} points)</span>
              <div className="flex justify-center">
                <TrailReplay points={pending.points} target={target} aspect={pending.aspect} size={200} />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Button variant="secondary" onClick={discard}>
                  Discard <span className="ml-2 font-mono text-xs opacity-70">Backspace</span>
                </Button>
                <Button onClick={save}>
                  Save <span className="ml-2 font-mono text-xs opacity-70">Enter</span>
                </Button>
              </div>
            </Card>
          )}
          {message && <Alert variant={message.variant}>{message.text}</Alert>}
          {doneAll && pid && <Alert variant="success">All targets reached the goal for {pid}. Download the data below.</Alert>}

          <Card>
            <span className="label-caps block mb-3">Progress for {pid || '—'}</span>
            <ul className="space-y-1.5">
              {CLASSES.map(c => (
                <li key={c.id} className="flex items-center gap-3 text-xs">
                  <TargetGlyph id={c.id} size={20} className="text-[var(--color-muted)] shrink-0" />
                  <span className="w-28 text-[var(--color-text)]">{c.name}</span>
                  <span className="flex-1 h-1.5 bg-cream-300 dark:bg-bark-700 rounded-full overflow-hidden">
                    <span className="block h-full bg-forest-600" style={{ width: `${Math.min(100, (counts[c.id] / goal) * 100)}%` }} />
                  </span>
                  <span className="w-12 text-right tabular-nums text-[var(--color-muted)]">{counts[c.id]}/{goal}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <span className="label-caps block mb-2">Data in this browser</span>
            <p className="text-xs text-[var(--color-muted)] mb-3">
              {samples.length} samples from {new Set(samples.map(s => s.participant)).size} people ·
              about {Math.round(storageBytes / 1000)} KB of roughly 5,000 KB browser storage.
              {storageBytes > STORAGE_WARN_BYTES && ' Download and clear soon.'}
            </p>
            <p className="text-xs text-[var(--color-muted)] mb-3">
              {!pid
                ? `Each person needs at least ${MIN_PER_TARGET} recordings of every target before their file can be downloaded.`
                : missing.length
                  ? `${pid} needs at least ${MIN_PER_TARGET} of every target before their file can be downloaded. Still needed: ` +
                    missing.map(c => `${c.name} ${MIN_PER_TARGET - (counts[c.id] || 0)}`).join(', ') +
                    '. "Download all" always works as a backup.'
                  : `${pid} has at least ${MIN_PER_TARGET} of every target. Download the file and send it to the team.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="md" variant="secondary" disabled={!canDownloadMine}
                onClick={() => download(`airscribe_${pid}_${stamp()}.json`, mine)}>
                Download {pid || 'participant'}
              </Button>
              <Button size="md" variant="secondary" disabled={!samples.length}
                onClick={() => download(`airscribe_all_${stamp()}.json`, samples)}>
                Download all
              </Button>
              <Button size="md" variant="secondary" disabled={!mine.length}
                onClick={() => persist(samples.filter(s => s !== mine[mine.length - 1]))}>
                Undo last
              </Button>
              {!confirmClear ? (
                <Button size="md" variant="danger" disabled={!samples.length} onClick={() => setConfirmClear(true)}>
                  Clear all
                </Button>
              ) : (
                <Button size="md" variant="danger" onClick={() => { persist([]); setConfirmClear(false) }}>
                  Confirm: delete {samples.length} samples
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
