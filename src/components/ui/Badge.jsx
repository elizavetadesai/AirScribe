import { clsx } from 'clsx'

const variants = {
  default:  'bg-cream-200 dark:bg-bark-700 text-bark-600 dark:text-cream-300',
  primary:  'bg-forest-100 dark:bg-forest-900/40 text-forest-800 dark:text-forest-200',
  success:  'bg-forest-100 dark:bg-forest-900/40 text-forest-800 dark:text-forest-200',
  warning:  'bg-sand-100 dark:bg-sand-900/40 text-sand-800 dark:text-sand-200',
  danger:   'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200',
}

export function Badge({ children, variant = 'default', className = '', dot = false }) {
  const dotColors = {
    success: 'bg-forest-500',
    warning: 'bg-sand-500 animate-pulse',
    danger:  'bg-red-500',
    primary: 'bg-forest-500',
    default: 'bg-bark-400',
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium tracking-wide',
        variants[variant],
        className
      )}
    >
      {dot && (
        <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0', dotColors[variant] || dotColors.default)} />
      )}
      {children}
    </span>
  )
}
