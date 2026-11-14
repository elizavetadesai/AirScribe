import { useEffect, useState } from 'react'
import { getPatients, getPatientHistory, linkPatient } from '../api/endpoints'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Alert } from '../components/ui/Alert'
import { LoadingOverlay } from '../components/ui/Spinner'
import { Badge } from '../components/ui/Badge'
import { TrendLine } from '../components/charts/TrendLine'
import { LetterHeatmap } from '../components/charts/LetterHeatmap'
import { LETTERS } from '../config/targets'

function formatRelative(iso) {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso)
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function computeTrend(sessions) {
  const byDay = {}
  sessions.forEach(s => {
    const d = s.created.slice(0, 10)
    if (!byDay[d]) byDay[d] = { accuracy: [], smoothness: [] }
    byDay[d].accuracy.push(s.accuracy_score)
    byDay[d].smoothness.push(s.smoothness_score)
  })
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, v]) => ({
      date: new Date(date).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      accuracy: Math.round(v.accuracy.reduce((a, b) => a + b, 0) / v.accuracy.length),
      smoothness: Math.round(v.smoothness.reduce((a, b) => a + b, 0) / v.smoothness.length),
    }))
}

function computeLetterData(sessions) {
  const byLetter = {}
  sessions.forEach(s => {
    const l = s.target_letter
    if (!byLetter[l]) byLetter[l] = []
    byLetter[l].push(s.accuracy_score)
  })
  return LETTERS.map(l => byLetter[l]
    ? { letter: l, accuracy: Math.round(byLetter[l].reduce((a, b) => a + b, 0) / byLetter[l].length) }
    : null
  ).filter(Boolean)
}

export default function ClinicianView() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [selectedId, setSelectedId] = useState(null)
  const [patientHistory, setPatientHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(null)

  const [linkEmail, setLinkEmail] = useState('')
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState(null)

  async function handleLink(e) {
    e.preventDefault()
    if (!linkEmail.trim()) return
    setLinking(true)
    setLinkError(null)
    try {
      const p = await linkPatient(linkEmail.trim())
      setPatients(prev => (prev.some(x => x.id === p.id) ? prev : [...prev, p]))
      setSelectedId(p.id)
      setLinkEmail('')
    } catch (err) {
      setLinkError(err.message)
    } finally {
      setLinking(false)
    }
  }

  useEffect(() => {
    getPatients()
      .then(setPatients)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setHistoryLoading(true)
    setHistoryError(null)
    getPatientHistory(selectedId)
      .then(setPatientHistory)
      .catch(e => setHistoryError(e.message))
      .finally(() => setHistoryLoading(false))
  }, [selectedId])

  if (loading) return <LoadingOverlay message="Loading patients" />
  if (error) return <Alert variant="error" title="Could not load patients">{error}</Alert>

  const selectedPatient = patients.find(p => p.id === selectedId)
  const trend = computeTrend(patientHistory)
  const letterData = computeLetterData(patientHistory)
  const totalCorrect = patientHistory.filter(s => s.target_letter === s.predicted_letter).length
  const accuracy = patientHistory.length
    ? Math.round((totalCorrect / patientHistory.length) * 100)
    : 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="label-caps">Clinician</span>
          <h1 className="font-display text-2xl font-semibold text-[var(--color-text)] mt-1">
            Patient overview
          </h1>
        </div>
        <Badge variant="primary" className="py-1.5 px-4">
          Read only
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patient list */}
        <div className="space-y-3">
          <span className="label-caps block">Your patients</span>

          <form onSubmit={handleLink} className="space-y-2" aria-label="Add a patient">
            <label htmlFor="link-email" className="text-xs text-[var(--color-muted)] block">
              Add a patient by the email they signed up with
            </label>
            <div className="flex gap-2">
              <input
                id="link-email"
                type="email"
                value={linkEmail}
                onChange={e => setLinkEmail(e.target.value)}
                placeholder="patient@example.com"
                className="flex-1 min-w-0 h-11 px-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-forest-600"
              />
              <Button type="submit" size="md" loading={linking}>Add</Button>
            </div>
            {linkError && <Alert variant="error">{linkError}</Alert>}
          </form>

          {patients.length === 0 && (
            <Card className="py-10 text-center">
              <p className="label-caps">No patients linked yet.</p>
              <p className="text-xs text-[var(--color-muted)] mt-2 leading-relaxed">
                Add a patient above to see their progress.
              </p>
            </Card>
          )}

          {patients.map(patient => (
            <button
              key={patient.id}
              onClick={() => setSelectedId(patient.id)}
              className={[
                'w-full text-left p-4 rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 min-h-[72px]',
                selectedId === patient.id
                  ? 'border-forest-700 bg-forest-50 dark:bg-forest-900/20'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-forest-300',
              ].join(' ')}
              aria-pressed={selectedId === patient.id}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-sm text-[var(--color-text)]">{patient.name}</div>
                  <div className="label-caps mt-0.5">{patient.email}</div>
                </div>
                <Badge variant="default" className="shrink-0 ml-2">
                  {patient.sessions_total} sessions
                </Badge>
              </div>
              <div className="label-caps mt-2">
                Active {formatRelative(patient.last_active)}
              </div>
            </button>
          ))}
        </div>

        {/* Patient detail panel */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedId && (
            <Card className="flex items-center justify-center py-20">
              <p className="label-caps">Select a patient to view their progress</p>
            </Card>
          )}

          {selectedId && historyLoading && (
            <LoadingOverlay message={`Loading ${selectedPatient?.name ?? 'patient'}'s history`} />
          )}

          {selectedId && historyError && (
            <Alert variant="error" title="Could not load history">{historyError}</Alert>
          )}

          {selectedId && !historyLoading && !historyError && patientHistory.length === 0 && (
            <Card className="py-16 text-center">
              <p className="label-caps">No sessions recorded for this patient yet.</p>
            </Card>
          )}

          {selectedId && !historyLoading && !historyError && patientHistory.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Sessions', value: patientHistory.length },
                  { label: 'Accuracy', value: `${accuracy}%` },
                  { label: 'Correct', value: totalCorrect },
                ].map(({ label, value }) => (
                  <Card key={label} className="text-center">
                    <div className="font-display text-3xl font-bold text-forest-700 dark:text-forest-400">
                      {value}
                    </div>
                    <div className="label-caps mt-2">{label}</div>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader><CardTitle>Progress over time</CardTitle></CardHeader>
                <TrendLine data={trend} />
              </Card>

              <Card>
                <CardHeader><CardTitle>Per-recognised correctly</CardTitle></CardHeader>
                <LetterHeatmap data={letterData} />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
