import { clsx } from 'clsx'

export function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'h-5 w-5', md: 'h-7 w-7', lg: 'h-10 w-10' }
  return (
    <svg
      className={clsx('animate-spin text-forest-600 dark:text-forest-400', sizes[size], className)}
      fill="none"
      viewBox="0 0 24 24"
      aria-label="Loading"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}

export function LoadingOverlay({ message = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <Spinner size="lg" />
      <p className="label-caps">{message}</p>
    </div>
  )
}
