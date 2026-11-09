import { Navbar } from './Navbar'

export function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] font-sans">
      <Navbar />
      <main id="main-content" className="max-w-7xl mx-auto px-6 py-10">
        {children}
      </main>
    </div>
  )
}
