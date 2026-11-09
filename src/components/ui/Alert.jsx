import { clsx } from 'clsx'

// Clean SVG icons replace emoji icons
const InfoIcon = () => (
  <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const CheckIcon = () => (
  <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const WarningIcon = () => (
  <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
)
const ErrorIcon = () => (
  <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const variants = {
  info:    { wrap: 'bg-cream-100 dark:bg-bark-800 border-cream-300 dark:border-bark-600', text: 'text-bark-700 dark:text-cream-300', Icon: InfoIcon },
  success: { wrap: 'bg-forest-50 dark:bg-forest-900/30 border-forest-200 dark:border-forest-700', text: 'text-forest-800 dark:text-forest-200', Icon: CheckIcon },
  warning: { wrap: 'bg-sand-50 dark:bg-sand-900/30 border-sand-200 dark:border-sand-700', text: 'text-sand-800 dark:text-sand-200', Icon: WarningIcon },
  error:   { wrap: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800', text: 'text-red-800 dark:text-red-200', Icon: ErrorIcon },
}

export function Alert({ children, variant = 'info', title, className = '', role: ariaRole }) {
  const v = variants[variant]
  return (
    <div
      className={clsx('flex gap-3 p-4 rounded border animate-fade-in', v.wrap, className)}
      role={ariaRole || (variant === 'error' ? 'alert' : 'status')}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      <span className={v.text}><v.Icon /></span>
      <div className={clsx('flex-1 text-sm leading-relaxed', v.text)}>
        {title && <p className="font-semibold mb-0.5 text-xs tracking-widest uppercase">{title}</p>}
        <p>{children}</p>
      </div>
    </div>
  )
}
