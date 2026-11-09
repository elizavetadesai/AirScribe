import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { login as apiLogin, register as apiRegister } from '../api/endpoints'
import { ApiError } from '../api/client'

const AuthContext = createContext(null)

const TOKEN_KEY = 'airscribe_token'
const USER_KEY = 'airscribe_user'

export function AuthProvider({ children }) {
  // Token stored in both ref (in-memory fast access) and sessionStorage (survives page refresh)
  const tokenRef = useRef(sessionStorage.getItem(TOKEN_KEY))

  const [user, setUser] = useState(() => {
    try {
      const stored = sessionStorage.getItem(USER_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const persistSession = useCallback((token, userData) => {
    tokenRef.current = token
    sessionStorage.setItem(TOKEN_KEY, token)
    sessionStorage.setItem(USER_KEY, JSON.stringify(userData))
    setUser(userData)
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await apiLogin(email, password)
    const userData = {
      email,
      role: data.role,
      name: data.name || email.split('@')[0],
    }
    persistSession(data.token, userData)
    return userData
  }, [persistSession])

  const register = useCallback(async (email, password, role) => {
    const data = await apiRegister(email, password, role)
    const userData = { email, role, name: email.split('@')[0] }
    persistSession(data.token, userData)
    return userData
  }, [persistSession])

  const logout = useCallback(() => {
    tokenRef.current = null
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
    setUser(null)
  }, [])

  // Expose token getter for API client
  const getToken = useCallback(() => tokenRef.current, [])

  // Listen for 401 errors dispatched globally (from ApiError with SESSION_EXPIRED)
  useEffect(() => {
    const handler = () => logout()
    window.addEventListener('airscribe:session-expired', handler)
    return () => window.removeEventListener('airscribe:session-expired', handler)
  }, [logout])

  return (
    <AuthContext.Provider value={{ user, login, register, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
