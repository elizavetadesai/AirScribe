import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

/**
 * Wraps a route that requires authentication.
 * Optionally restricts to a specific role (e.g. 'clinician' or 'patient').
 */
export function ProtectedRoute({ children, role }) {
  const { user } = useAuth()

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  if (role && user.role !== role) {
    // Redirect patients away from clinician routes and vice versa
    const fallback = user.role === 'clinician' ? '/clinician' : '/practice'
    return <Navigate to={fallback} replace />
  }

  return children
}
