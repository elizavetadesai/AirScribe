import { clsx } from 'clsx'

const variants = {
  primary:   'bg-forest-600 text-cream-50 hover:bg-forest-700 focus-visible:ring-forest-600 disabled:bg-forest-300',
  secondary: 'bg-transparent text-forest-700 dark:text-forest-300 border border-forest-700 dark:border-forest-500 hover:bg-forest-50 dark:hover:bg-forest-900/20 focus-visible:ring-forest-600',
  danger:    'bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-600 disabled:bg-red-300',
  ghost:     'text-bark-500 dark:text-cream-300 hover:bg-cream-200 dark:hover:bg-bark-700/30 focus-visible:ring-bark-400',
  sand:      'bg-sand-500 text-white hover:bg-sand-600 focus-visible:ring-sand-500 disabled:bg-sand-300',
}

const sizes = {
  sm: 'h-9 px-4 text-xs tracking-wide',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-7 text-base',
  xl: 'h-14 px-8 text-base',
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  loading = false,
  ...props
}) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium rounded',
        'tracking-wide transition-all duration-200 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'min-w-[2.75rem]',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {children}
    </button>
  )
}
