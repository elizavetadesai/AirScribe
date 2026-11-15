import { useEffect, useState } from 'react'
import { getHistory } from '../api/endpoints'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Alert } from '../components/ui/Alert'
import { LoadingOverlay } from '../components/ui/Spinner'
import { TrendLine } from '../components/charts/TrendLine'
import { LetterHeatmap } from '../components/charts/LetterHeatmap'
import { StreakBadge } from '../components/charts/StreakBadge'
import { LETTERS } from '../config/targets'

const DISCLAIMER = 'AirScribe is an exercise assistant for physiotherapy, not a medical device.'
const WEEKLY_GOAL = 10

function computeStreak(sessions) {
  if (!sessions.length) return { current: 0, best: 0 }
  const days = new Set(sessions.map(s => s.created.slice(0, 10)))
  const sorted = Array.from(days).sort((a, b) => b.localeCompare(a))
  let best = 0, streak = 0
  let prev = null
  for (const day of sorted) {
    if (!prev) { streak = 1 }
    else {
      const diff = (new Date(prev) - new Date(day)) / 86400000
      if (diff === 1) streak++
      else { best = Math.max(best, streak); streak = 1 }
    }
    prev = day
  }
  best = Math.max(best, streak)
  return { current: streak, best }
}

function computeWeekSessions(sessions) {
  const weekAgo = new Date(Date.now() - 7 * 86400000)
  return sessions.filter(s => new Date(s.created) > weekAgo).length
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

function StatCard({ label, children }) {
  return (
    <Card>
      <span className="label-caps block mb-4">{label}</span>
      {children}
    </Card>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getHistory(100)
      .then(setSessions)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingOverlay message="Loading your progress" />
  if (error) return <Alert variant="error" title="Could not load dashboard">{error}</Alert>

  const streak = computeStreak(sessions)
  const weekCount = computeWeekSessions(sessions)
  const trend = computeTrend(sessions)
  const letterData = computeLetterData(sessions)
  const totalCorrect = sessions.filter(s => s.target_letter === s.predicted_letter).length
  const accuracy = sessions.length ? Math.round((totalCorrect / sessions.length) * 100) : 0
  const weekPct = Math.min(100, Math.round((weekCount / WEEKLY_GOAL) * 100))

  const noData = sessions.length === 0

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="label-caps">Dashboard</span>
          <h1 className="font-display text-2xl font-semibold text-[var(--color-text)] mt-1">
            {user?.name ? `Welcome back, ${user.name.split(' ')[0]}` : 'Your progress'}
          </h1>
          {!noData && (
            <p className="text-sm text-[var(--color-muted)] mt-1">
              {sessions.length} sessions completed &ensp;·&ensp; {accuracy}% recognised correctly
            </p>
          )}
        </div>
        <p className="text-xs text-[var(--color-muted)] max-w-xs leading-relaxed border-l-2 border-[var(--color-border)] pl-3">
          {DISCLAIMER}
        </p>
      </div>

      {/* Empty state */}
      {noData && (
        <Card className="py-16 text-center">
          <span className="label-caps block mb-3">No sessions yet</span>
          <p className="text-sm text-[var(--color-muted)] max-w-xs mx-auto leading-relaxed">
            Complete your first practice session to start tracking your progress here.
          </p>
        </Card>
      )}

      {/* Stats — only show when there's data */}
      {!noData && (
        <>
          {/* Top row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Streak">
              <StreakBadge current={streak.current} best={streak.best} />
            </StatCard>

            <StatCard label="This week">
              <div className="flex items-end gap-2 mb-3">
                <span className="font-display text-5xl font-bold text-forest-700 dark:text-forest-400 leading-none">
                  {weekCount}
                </span>
                <span className="text-[var(--color-muted)] pb-1">/ {WEEKLY_GOAL} sessions</span>
              </div>
              <div className="h-1 bg-cream-300 dark:bg-bark-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-forest-600 rounded-full transition-all duration-700"
                  style={{ width: `${weekPct}%` }}
                  role="progressbar"
                  aria-valuenow={weekCount}
                  aria-valuemax={WEEKLY_GOAL}
                  aria-label="Weekly goal progress"
                />
              </div>
              <p className="label-caps mt-2">
                {weekCount >= WEEKLY_GOAL ? 'Weekly goal reached' : `${WEEKLY_GOAL - weekCount} more to reach your goal`}
              </p>
            </StatCard>

            <StatCard label="Overall accuracy">
              <div className="flex items-center gap-4">
                <span className="font-display text-5xl font-bold text-forest-700 dark:text-forest-400 leading-none">
                  {accuracy}%
                </span>
                <div className="text-sm text-[var(--color-muted)]">
                  <div>{totalCorrect} correct</div>
                  <div>{sessions.length - totalCorrect} to improve</div>
                </div>
              </div>
            </StatCard>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Progress over time</CardTitle></CardHeader>
              <TrendLine data={trend} />
            </Card>
            <Card>
              <CardHeader><CardTitle>Per-recognised correctly</CardTitle></CardHeader>
              <LetterHeatmap data={letterData} />
              <p className="label-caps mt-3">
                Dark green = great &ensp;·&ensp; Light green = good &ensp;·&ensp; Sand = needs practice
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
