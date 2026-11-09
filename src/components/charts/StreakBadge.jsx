/**
 * Streak display — no emoji, clean typographic treatment.
 */
export function StreakBadge({ current = 0, best = 0 }) {
  return (
    <div className="flex items-center gap-8">
      <div>
        <div className="font-display text-5xl font-bold text-forest-700 dark:text-forest-400 leading-none">
          {current}
        </div>
        <div className="label-caps mt-2">Day streak</div>
      </div>
      {best > 0 && (
        <div className="border-l border-[var(--color-border)] pl-8">
          <div className="font-display text-3xl font-semibold text-[var(--color-muted)] leading-none">
            {best}
          </div>
          <div className="label-caps mt-2">Best</div>
        </div>
      )}
    </div>
  )
}
