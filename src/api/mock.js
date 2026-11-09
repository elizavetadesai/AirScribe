/**
 * Mock API implementations.
 * Activated when VITE_USE_MOCK=true.
 * Returns empty / zero data so the UI shows real empty states.
 * Swap these implementations with realistic data only when demoing.
 */

const delay = (ms = 500) => new Promise(r => setTimeout(r, ms))

// ── Implementations ──────────────────────────────────────────────────────────

export async function mockRegister(_email, _password, _role) {
  await delay(700)
  return { token: 'mock-token-patient-abc123' }
}

export async function mockLogin(email, _password) {
  await delay(600)
  const isClinician = email.toLowerCase().includes('clinic')
  return {
    token: isClinician ? 'mock-token-clinician-xyz789' : 'mock-token-patient-abc123',
    role: isClinician ? 'clinician' : 'patient',
    name: isClinician ? 'Dr. Sarah Chen' : 'Alex',
  }
}

export async function mockPredict(targetLetter, _points) {
  await delay(900)
  // Returns a real-looking result for a completed attempt
  const accuracy = Math.floor(Math.random() * 25) + 68   // 68–92
  const smoothness = Math.floor(Math.random() * 25) + 60  // 60–85
  const confidence = parseFloat((Math.random() * 0.2 + 0.74).toFixed(2))
  return {
    letter: targetLetter,
    confidence,
    accuracy_score: accuracy,
    smoothness_score: smoothness,
    session_id: `session-${Date.now()}`,
  }
}

export async function mockGetHistory(_limit) {
  await delay(400)
  return [] // No pre-populated history — user starts fresh
}

export async function mockGetPatients() {
  await delay(500)
  return [] // No pre-linked patients
}

export async function mockGetPatientHistory(_patientId) {
  await delay(400)
  return []
}
