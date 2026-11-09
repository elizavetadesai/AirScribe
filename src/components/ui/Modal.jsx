import { useEffect, useRef } from 'react'
import { Button } from './Button'

export function Modal({ open, onClose, title, children, size = 'md' }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!dialogRef.current) return
    if (open) dialogRef.current.showModal()
    else dialogRef.current.close()
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handler = (e) => { if (e.target === dialog) onClose() }
    dialog.addEventListener('click', handler)
    return () => dialog.removeEventListener('click', handler)
  }, [onClose])

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }

  return (
    <dialog
      ref={dialogRef}
      className={[
        'rounded-lg bg-[var(--color-surface)] shadow-2xl p-0 w-full',
        'border border-[var(--color-border)]',
        widths[size],
      ].join(' ')}
      onKeyDown={e => e.key === 'Escape' && onClose()}
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
        <h2 className="font-display text-base font-semibold text-[var(--color-text)]">{title}</h2>
        <button
          onClick={onClose}
          className="p-2 rounded text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-cream-200 dark:hover:bg-bark-700/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
          aria-label="Close"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </dialog>
  )
}
