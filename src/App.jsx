import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { AppShell } from './components/layout/AppShell'
import { ProtectedRoute } from './components/layout/ProtectedRoute'

import Auth from './pages/Auth'
import Practice from './pages/Practice'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import ClinicianView from './pages/ClinicianView'
import Settings from './pages/Settings'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/auth" element={<Auth />} />

            {/* Patient routes */}
            <Route
              path="/practice"
              element={
                <ProtectedRoute role="patient">
                  <AppShell><Practice /></AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute role="patient">
                  <AppShell><Dashboard /></AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute role="patient">
                  <AppShell><History /></AppShell>
                </ProtectedRoute>
              }
            />

            {/* Clinician routes */}
            <Route
              path="/clinician"
              element={
                <ProtectedRoute role="clinician">
                  <AppShell><ClinicianView /></AppShell>
                </ProtectedRoute>
              }
            />

            {/* Shared routes */}
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <AppShell><Settings /></AppShell>
                </ProtectedRoute>
              }
            />

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/auth" replace />} />
            <Route path="*" element={<Navigate to="/auth" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
