import { Badge } from '../ui/Badge'

/**
 * Visual indicator of current hand detection status.
 * Uses aria-live so screen readers hear status changes.
 */
export function HandStatus({ detected, warning }) {
  if (warning) {
    return (
      <div aria-live="assertive" aria-atomic>
        <Badge variant="warning" dot className="text-xs py-1.5 px-3">
          Hand not visible — keep your index finger in frame
        </Badge>
      </div>
    )
  }

  return (
    <div aria-live="polite" aria-atomic>
      <Badge variant={detected ? 'success' : 'default'} dot className="text-xs py-1.5 px-3">
        {detected ? 'Hand detected' : 'No hand visible'}
      </Badge>
    </div>
  )
}
