import { clsx } from 'clsx'

export function Card({ children, className = '', padding = true, ...props }) {
  return (
    <div
      className={clsx(
        'bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg',
        padding && 'p-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }) {
  return <div className={clsx('mb-5', className)}>{children}</div>
}

export function CardTitle({ children, className = '' }) {
  return (
    <h2 className={clsx('font-display text-lg font-semibold text-[var(--color-text)]', className)}>
      {children}
    </h2>
  )
}
