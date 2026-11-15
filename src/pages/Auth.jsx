import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'
import { Alert } from '../components/ui/Alert'

const DISCLAIMER = 'AirScribe supports physiotherapy exercises at home. It is not a medical device and not a substitute for professional medical advice, diagnosis, or treatment.'

export default function Auth() {
  const [mode, setMode] = useState('login')
  const [role, setRole] = useState('patient')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const { login, register } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      let user
      if (mode === 'login') {
        user = await login(email, password)
      } else {
        user = await register(email, password, role)
      }
      navigate(user.role === 'clinician' ? '/clinician' : '/practice', { replace: true })
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-5/12 bg-forest-800 dark:bg-forest-900 flex-col justify-between p-12">
        <div>
          <span className="label-caps text-forest-300">AirScribe</span>
        </div>
        <div>
          <h1 className="font-display text-5xl font-bold text-cream-100 leading-tight mb-6">
            Rehabilitation<br />through motion.
          </h1>
          <p className="text-forest-300 text-sm leading-relaxed max-w-xs">
            Home exercises for fine motor control and eye–hand coordination after a stroke and in neurodegenerative or neurodevelopmental conditions, followed by your physiotherapist. Draw shapes and letters in the air with your index finger — your browser tracks every movement privately, without recording any video.
          </p>
        </div>
        <p className="text-xs text-forest-500 leading-relaxed max-w-xs">
          {DISCLAIMER}
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile wordmark */}
          <div className="lg:hidden mb-10">
            <span className="label-caps text-forest-700 dark:text-forest-400">AirScribe</span>
            <h1 className="font-display text-3xl font-bold text-[var(--color-text)] mt-2">
              Rehabilitation<br />through motion.
            </h1>
          </div>

          {/* Mode tabs */}
          <div className="flex border-b border-[var(--color-border)] mb-8">
            {[
              { key: 'login', label: 'Log in' },
              { key: 'register', label: 'Create account' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setMode(key); setError(null) }}
                className={[
                  'flex-1 pb-3 text-xs tracking-widest uppercase font-medium transition-colors focus-visible:outline-none min-h-[44px]',
                  mode === key
                    ? 'text-[var(--color-forest)] border-b-2 border-forest-700 dark:border-forest-400 -mb-px'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-text)]',
                ].join(' ')}
                aria-pressed={mode === key}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="auth-email" className="label-caps block">
                Email address
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full h-11 px-4 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-forest-600 focus:border-transparent transition-shadow placeholder:text-[var(--color-muted)]"
                placeholder="you@example.com"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="auth-password" className="label-caps block">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full h-11 px-4 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-forest-600 focus:border-transparent transition-shadow placeholder:text-[var(--color-muted)]"
                placeholder="Min. 6 characters"
              />
            </div>

            {/* Role selector */}
            {mode === 'register' && (
              <fieldset className="space-y-2">
                <legend className="label-caps block mb-3">I am a</legend>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'patient', label: 'Patient' },
                    { value: 'clinician', label: 'Clinician' },
                  ].map(({ value, label }) => (
                    <label
                      key={value}
                      className={[
                        'flex items-center justify-center p-4 rounded border-2 cursor-pointer transition-all min-h-[52px]',
                        role === value
                          ? 'border-forest-700 bg-forest-50 dark:bg-forest-900/20 text-forest-800 dark:text-forest-200'
                          : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-forest-300',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={value}
                        checked={role === value}
                        onChange={() => setRole(value)}
                        className="sr-only"
                      />
                      <span className="text-xs tracking-widest uppercase font-medium">{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {error && <Alert variant="error">{error}</Alert>}

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {mode === 'login' ? 'Log in' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-xs text-[var(--color-muted)]">
            Recording training data for the project?{' '}
            <Link to="/collect" className="underline hover:text-[var(--color-text)]">Open the data-collection page</Link>
          </p>

          {/* Mobile disclaimer */}
          <p className="lg:hidden mt-8 text-xs text-[var(--color-muted)] leading-relaxed">
            {DISCLAIMER}
          </p>
        </div>
      </div>
    </div>
  )
}
