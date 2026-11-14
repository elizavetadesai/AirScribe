import { getTarget } from '../../config/targets'

/**
 * Draws a target as a clean outline (shapes and letters look the same style).
 * Falls back to text for ids without an outline (e.g. "other").
 */
export function TargetGlyph({ id, size = 48, strokeWidth = 0.14, className = '', title }) {
  const t = getTarget(id)
  const label = title || t.name
  if (!t.outline.length) {
    return (
      <span
        className={`inline-flex items-center justify-center font-display font-semibold ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.32 }}
        role="img"
        aria-label={label}
      >
        ?
      </span>
    )
  }
  return (
    <svg
      viewBox="-1.25 -1.25 2.5 2.5"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={label}
    >
      {t.outline.map((line, i) => (
        <polyline
          key={i}
          points={line.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
