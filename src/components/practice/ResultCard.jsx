import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { TrailReplay } from './TrailReplay'

function ScoreBar({ label, value, color = 'forest' }) {
  const fill = {
    forest: 'bg-forest-600',
    sand:   'bg-sand-500',
  }
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-baseline">
        <span className="label-caps">{label}</span>
        <span className="font-display text-xl font-semibold text-[var(--color-text)]">{value}</span>
      </div>
      <div className="h-1.5 bg-cream-300 dark:bg-bark-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${fill[color]}`}
          style={{ width: `${value}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  )
}

function encouragementText(avg) {
  if (avg >= 85) return 'Excellent form. Your movement is very consistent.'
  if (avg >= 70) return 'Good work. Keep practising to build consistency.'
  if (avg >= 55) return 'A solid attempt. Focus on slower, deliberate strokes.'
  return 'Keep going. Progress builds with each attempt.'
}

export function ResultCard({ result, targetLetter, trail, onNext }) {
  if (!result) return null

  const isCorrect = result.letter === targetLetter
  const confidencePct = Math.round(result.confidence * 100)
  const avg = (result.accuracy_score + result.smoothness_score) / 2

  return (
    <Card className="animate-slide-up" aria-live="polite" aria-label="Practice result">
      {/* Header row */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <span className="label-caps block mb-2">Result</span>
          <div className="flex items-center gap-3">
            <span className="font-display text-6xl font-bold text-[var(--color-text)] leading-none">
              {result.letter}
            </span>
            <Badge variant={isCorrect ? 'success' : 'warning'} dot>
              {isCorrect ? 'Correct' : 'Close'}
            </Badge>
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-2">
            Target: <strong className="text-[var(--color-text)]">{targetLetter}</strong>
            &ensp;·&ensp;Confidence: <strong className="text-[var(--color-text)]">{confidencePct}%</strong>
          </p>
        </div>
      </div>

      {/* Trail replay */}
      <div className="flex justify-center mb-6">
        <TrailReplay
          points={trail}
          letter={targetLetter}
          color={isCorrect ? '#1f4f36' : '#b8824e'}
          size={180}
        />
      </div>

      {/* Scores */}
      <div className="space-y-4 mb-6">
        <ScoreBar label="Shape accuracy" value={result.accuracy_score} color="forest" />
        <ScoreBar label="Movement smoothness" value={result.smoothness_score} color="sand" />
      </div>

      {/* Encouragement */}
      <p className="text-sm text-[var(--color-muted)] mb-6 leading-relaxed border-t border-[var(--color-border)] pt-4">
        {encouragementText(avg)}
      </p>

      {/* Next */}
      <button
        onClick={onNext}
        className="w-full h-12 label-caps text-[var(--color-surface)] bg-forest-700 hover:bg-forest-800 dark:bg-forest-600 dark:hover:bg-forest-500 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 focus-visible:ring-offset-2"
        aria-label="Try next letter"
      >
        Next letter
      </button>
    </Card>
  )
}
