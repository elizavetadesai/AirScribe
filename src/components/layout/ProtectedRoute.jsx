import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const HOME = { patient: '/practice', clinician: '/clinician' }

/**
 * Wraps a route that requires authentication.
 * Optionally restricts to a specific role (e.g. 'clinician' or 'patient').
 * An unknown role goes back to /auth (redirecting to the same page again
 * would loop forever and leave a blank screen).
 */
export function ProtectedRoute({ children, role }) {
  const { user } = useAuth()

  if (!user || !HOME[user.role]) {
    return <Navigate to="/auth" replace />
  }

  if (role && user.role !== role) {
    // Redirect patients away from clinician routes and vice versa
    return <Navigate to={HOME[user.role]} replace />
  }

  return children
}
