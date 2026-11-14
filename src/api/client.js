/**
 * Base API client.
 * Reads VITE_API_URL from environment.
 * Attaches Bearer token from sessionStorage.
 * Returns parsed JSON or throws a typed error.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function getToken() {
  return sessionStorage.getItem('airscribe_token')
}

function buildHeaders(includeAuth = true) {
  const headers = { 'Content-Type': 'application/json' }
  if (includeAuth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

function humanizeError(status, body, authed) {
  const detail = typeof body?.detail === 'string' ? body.detail : null
  if (status === 401) {
    if (!authed) return new ApiError(detail || 'Wrong email or password.', 401, 'UNAUTHORIZED')
    window.dispatchEvent(new Event('airscribe:session-expired'))
    return new ApiError('Session expired. Please log in again.', 401, 'SESSION_EXPIRED')
  }
  if (status === 403) return new ApiError(detail || 'You do not have permission to do this.', 403, 'FORBIDDEN')
  if (status === 404) return new ApiError(detail || 'Resource not found.', 404, 'NOT_FOUND')
  if (status === 409) return new ApiError(detail || 'This already exists.', 409, 'CONFLICT')
  if (status === 422) return new ApiError(detail || 'Invalid data sent to server. Please try again.', 422, 'VALIDATION')
  if (status === 503) return new ApiError(detail || 'The service is starting up. Please try again in a minute.', 503, 'UNAVAILABLE')
  if (status >= 500) return new ApiError('Server error. Please try again in a moment.', status, 'SERVER_ERROR')
  return new ApiError(detail || body?.message || 'An unexpected error occurred.', status, 'UNKNOWN')
}

export async function apiFetch(path, { method = 'GET', body, auth = true } = {}) {
  let response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: buildHeaders(auth),
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(
      'Could not reach the server. Check your connection.',
      0,
      'NETWORK_ERROR'
    )
  }

  let data = null
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    data = await response.json()
  }

  if (!response.ok) {
    throw humanizeError(response.status, data, auth && !!getToken())
  }

  return data
}
