import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'

const NAV_LINKS = {
  patient: [
    { to: '/practice', label: 'Practice' },
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/history', label: 'History' },
    { to: '/settings', label: 'Settings' },
  ],
  clinician: [
    { to: '/clinician', label: 'Patients' },
    { to: '/settings', label: 'Settings' },
  ],
}

const SunIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" />
  </svg>
)

const MoonIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
)

export function Navbar() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  const links = user ? (NAV_LINKS[user.role] || []) : []

  function handleLogout() {
    logout()
    navigate('/auth')
  }

  return (
    <header className="sticky top-0 z-40 bg-[var(--color-surface)]/95 backdrop-blur-sm border-b border-[var(--color-border)]">
      <nav
        className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-6"
        aria-label="Main navigation"
      >
        {/* Wordmark */}
        <Link
          to={user ? (user.role === 'clinician' ? '/clinician' : '/practice') : '/auth'}
          className="font-display text-sm font-semibold tracking-widest uppercase text-[var(--color-forest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 rounded px-1"
          aria-label="AirScribe home"
        >
          AirScribe
        </Link>

        {/* Nav links */}
        {user && (
          <ul className="hidden sm:flex items-center gap-0.5 list-none flex-1" role="list">
            {links.map(({ to, label }) => {
              const active = location.pathname.startsWith(to)
              return (
                <li key={to}>
                  <Link
                    to={to}
                    className={[
                      'px-3 py-1.5 rounded text-xs tracking-widest uppercase font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600',
                      active
                        ? 'text-forest-700 dark:text-forest-300 bg-forest-50 dark:bg-forest-900/30'
                        : 'text-[var(--color-muted)] hover:text-[var(--color-text)]',
                    ].join(' ')}
                    aria-current={active ? 'page' : undefined}
                  >
                    {label}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        {/* Right controls */}
        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-cream-200 dark:hover:bg-bark-700/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          {user && (
            <>
              <span className="hidden md:block label-caps max-w-[160px] truncate">
                {user.name}
                {user.role === 'clinician' && <span className="ml-1.5 text-forest-600 dark:text-forest-400">/ clinician</span>}
              </span>
              <button
                onClick={handleLogout}
                className="label-caps text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 rounded px-2 py-1 min-h-[44px] flex items-center"
                aria-label="Log out"
              >
                Log out
              </button>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
