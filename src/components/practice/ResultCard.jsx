import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { TrailReplay } from './TrailReplay'
import { TargetGlyph } from './TargetGlyph'
import { targetName } from '../../config/targets'

function ScoreBar({ label, value, color = 'forest', help }) {
  const fill = {
    forest: 'bg-forest-600',
    sand:   'bg-sand-500',
  }
  const v = Math.round(value)
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-baseline">
        <span className="label-caps">{label}</span>
        <span className="font-display text-xl font-semibold text-[var(--color-text)]">{v}</span>
      </div>
      <div className="h-1.5 bg-cream-300 dark:bg-bark-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${fill[color]}`}
          style={{ width: `${v}%` }}
          role="progressbar"
          aria-label={label}
          aria-valuenow={v}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {help && <p className="text-xs text-[var(--color-muted)]">{help}</p>}
    </div>
  )
}

function encouragementText(avg, isCorrect) {
  if (!isCorrect) return 'The shape was read as something else. Try again a little slower and a little larger.'
  if (avg >= 85) return 'Excellent form. Your movement is very consistent.'
  if (avg >= 70) return 'Good work. Keep practising to build consistency.'
  if (avg >= 55) return 'A solid attempt. Focus on slower, deliberate strokes.'
  return 'Keep going. Progress builds with each attempt.'
}

export function ResultCard({ result, targetLetter, trail, aspect, onNext, onRetry }) {
  if (!result) return null

  const isCorrect = result.letter === targetLetter
  const notRecognised = result.letter === 'other'
  const confidencePct = Math.round(result.confidence * 100)
  const avg = (result.accuracy_score + result.smoothness_score) / 2

  return (
    <Card className="animate-slide-up" aria-live="polite" aria-label="Practice result">
      <div className="flex items-start justify-between mb-6">
        <div>
          <span className="label-caps block mb-2">Recognised as</span>
          <div className="flex items-center gap-3">
            <TargetGlyph id={result.letter} size={56} className="text-[var(--color-text)]" />
            <div>
              <div className="font-display text-xl font-semibold text-[var(--color-text)]">
                {targetName(result.letter)}
              </div>
              <Badge variant={isCorrect ? 'success' : 'warning'} dot>
                {isCorrect ? 'Correct' : notRecognised ? 'Not recognised' : 'Different shape'}
              </Badge>
            </div>
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-3">
            Target: <strong className="text-[var(--color-text)]">{targetName(targetLetter)}</strong>
            &ensp;·&ensp;Model confidence: <strong className="text-[var(--color-text)]">{confidencePct}%</strong>
          </p>
        </div>
      </div>

      <div className="flex justify-center mb-6">
        <TrailReplay
          points={trail}
          target={targetLetter}
          aspect={aspect}
          color={isCorrect ? '#1f4f36' : '#b8824e'}
          size={180}
        />
      </div>

      <div className="space-y-4 mb-6">
        <ScoreBar label="Shape accuracy" value={result.accuracy_score} color="forest"
          help="How closely your drawing matches the target shape." />
        <ScoreBar label="Movement smoothness" value={result.smoothness_score} color="sand"
          help="Steady, flowing movement scores higher than shaky or stop-start movement." />
      </div>

      <p className="text-sm text-[var(--color-muted)] mb-6 leading-relaxed border-t border-[var(--color-border)] pt-4">
        {encouragementText(avg, isCorrect)}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onRetry}
          className="h-12 label-caps text-[var(--color-text)] border-2 border-[var(--color-border)] hover:border-forest-400 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 focus-visible:ring-offset-2"
          aria-label="Try the same target again"
        >
          Try again
        </button>
        <button
          onClick={onNext}
          className="h-12 label-caps text-[var(--color-surface)] bg-forest-700 hover:bg-forest-800 dark:bg-forest-600 dark:hover:bg-forest-500 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 focus-visible:ring-offset-2"
          aria-label="Go to the next target"
        >
          Next target
        </button>
      </div>
    </Card>
  )
}
