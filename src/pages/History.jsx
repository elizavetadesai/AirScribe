import { useEffect, useState, useMemo } from 'react'
import { getHistory } from '../api/endpoints'
import { Card } from '../components/ui/Card'
import { Alert } from '../components/ui/Alert'
import { LoadingOverlay } from '../components/ui/Spinner'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { TrailReplay } from '../components/practice/TrailReplay'
import { TARGETS, targetName } from '../config/targets'
import { TargetGlyph } from '../components/practice/TargetGlyph'

function formatDate(iso) {
  return new Date(iso).toLocaleString('en', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function History() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterLetter, setFilterLetter] = useState('all')
  const [filterCorrect, setFilterCorrect] = useState('all')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    getHistory(100)
      .then(setSessions)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return sessions
      .filter(s => filterLetter === 'all' || s.target_letter === filterLetter)
      .filter(s => {
        if (filterCorrect === 'all') return true
        const correct = s.target_letter === s.predicted_letter
        return filterCorrect === 'correct' ? correct : !correct
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created))
  }, [sessions, filterLetter, filterCorrect])

  if (loading) return <LoadingOverlay message="Loading history" />
  if (error) return <Alert variant="error" title="Could not load history">{error}</Alert>

  const selectStyle = "h-9 px-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-xs tracking-wide focus:outline-none focus:ring-2 focus:ring-forest-600"

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <span className="label-caps">History</span>
        <h1 className="font-display text-2xl font-semibold text-[var(--color-text)] mt-1">
          Session history
        </h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label htmlFor="filter-letter" className="label-caps">Target</label>
          <select id="filter-letter" value={filterLetter} onChange={e => setFilterLetter(e.target.value)} className={selectStyle}>
            <option value="all">All</option>
            {TARGETS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="filter-correct" className="label-caps">Result</label>
          <select id="filter-correct" value={filterCorrect} onChange={e => setFilterCorrect(e.target.value)} className={selectStyle}>
            <option value="all">All</option>
            <option value="correct">Correct</option>
            <option value="incorrect">Needs improvement</option>
          </select>
        </div>
        {sessions.length > 0 && (
          <span className="label-caps ml-auto">
            {filtered.length} of {sessions.length}
          </span>
        )}
      </div>

      {/* Empty state */}
      {sessions.length === 0 && (
        <Card className="py-16 text-center">
          <span className="label-caps block mb-3">No sessions yet</span>
          <p className="text-sm text-[var(--color-muted)] max-w-xs mx-auto leading-relaxed">
            Complete a practice session and your attempts will appear here.
          </p>
        </Card>
      )}

      {sessions.length > 0 && filtered.length === 0 && (
        <Card className="text-center py-12">
          <p className="label-caps">No sessions match these filters.</p>
        </Card>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <Card padding={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-cream-100 dark:bg-bark-900/50">
                  {['Date', 'Target', 'Predicted', 'Confidence', 'Accuracy', 'Smoothness', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left label-caps whitespace-nowrap font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((session, i) => {
                  const correct = session.target_letter === session.predicted_letter
                  return (
                    <tr
                      key={session.session_id}
                      className={[
                        'border-b border-[var(--color-border)] cursor-pointer transition-colors',
                        'hover:bg-cream-100 dark:hover:bg-bark-800/40',
                        i % 2 !== 0 ? 'bg-cream-50/50 dark:bg-bark-900/20' : '',
                      ].join(' ')}
                      onClick={() => setSelected(session)}
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && setSelected(session)}
                      aria-label={`Attempt at ${targetName(session.target_letter)} on ${formatDate(session.created)}`}
                    >
                      <td className="px-4 py-3 text-[var(--color-muted)] whitespace-nowrap text-xs">
                        {formatDate(session.created)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 text-[var(--color-text)]">
                          <TargetGlyph id={session.target_letter} size={28} />
                          <span className="text-xs">{targetName(session.target_letter)}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-2"
                          style={{ color: correct ? '#1f4f36' : '#b8824e' }}
                        >
                          <TargetGlyph id={session.predicted_letter} size={28} />
                          <span className="text-xs">{targetName(session.predicted_letter)}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={session.confidence > 0.8 ? 'success' : session.confidence > 0.6 ? 'primary' : 'warning'}>
                          {Math.round(session.confidence * 100)}%
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                        {Math.round(session.accuracy_score)}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                        {Math.round(session.smoothness_score)}
                      </td>
                      <td className="px-4 py-3 label-caps text-forest-700 dark:text-forest-400">
                        View
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Replay modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Attempt — ${targetName(selected.target_letter)}` : ''}
        size="md"
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="label-caps">{formatDate(selected.created)}</span>
              <Badge variant={selected.target_letter === selected.predicted_letter ? 'success' : 'warning'}>
                Recognised as: {targetName(selected.predicted_letter)}
              </Badge>
              <Badge variant="primary">
                {Math.round(selected.confidence * 100)}% confidence
              </Badge>
            </div>

            <div className="flex justify-center">
              <TrailReplay
                points={selected.points || []}
                target={selected.target_letter}
                size={240}
                color={selected.target_letter === selected.predicted_letter ? '#1f4f36' : '#b8824e'}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Shape accuracy', value: Math.round(selected.accuracy_score) },
                { label: 'Smoothness', value: Math.round(selected.smoothness_score) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-cream-100 dark:bg-bark-800 rounded p-4 text-center">
                  <div className="font-display text-3xl font-bold text-forest-700 dark:text-forest-400">
                    {value}
                  </div>
                  <div className="label-caps mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
