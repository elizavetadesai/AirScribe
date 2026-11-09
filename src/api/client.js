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

function humanizeError(status, body) {
  if (status === 401) return new ApiError('Session expired. Please log in again.', 401, 'SESSION_EXPIRED')
  if (status === 403) return new ApiError('You do not have permission to do this.', 403, 'FORBIDDEN')
  if (status === 404) return new ApiError('Resource not found.', 404, 'NOT_FOUND')
  if (status === 422) return new ApiError('Invalid data sent to server. Please try again.', 422, 'VALIDATION')
  if (status >= 500) return new ApiError('Server error. Please try again in a moment.', status, 'SERVER_ERROR')
  const msg = body?.detail || body?.message || 'An unexpected error occurred.'
  return new ApiError(msg, status, 'UNKNOWN')
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
    throw humanizeError(response.status, data)
  }

  return data
}
