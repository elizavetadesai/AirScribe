/**
 * Mock API implementations (VITE_USE_MOCK=true), for working on the UI
 * without the backend. Results are RANDOM: they say nothing about the model.
 * About 1 in 5 attempts comes back as a different shape so the
 * "not quite" states get exercised too.
 */
import { TARGET_IDS } from '../config/targets'

const delay = (ms = 500) => new Promise(r => setTimeout(r, ms))
const rand = (lo, hi) => lo + Math.random() * (hi - lo)

const mockHistory = []

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

export async function mockDeleteAccount() {
  await delay(600)
  mockHistory.length = 0
  return null
}

export async function mockPredict(target, points) {
  await delay(700)
  const r = Math.random()
  const others = TARGET_IDS.filter(t => t !== target)
  const letter = r < 0.8 ? target : r < 0.93 ? others[Math.floor(Math.random() * others.length)] : 'other'
  const correct = letter === target
  const result = {
    letter,
    confidence: Number(rand(correct ? 0.7 : 0.4, correct ? 0.98 : 0.7).toFixed(2)),
    accuracy_score: Math.round(correct ? rand(65, 95) : rand(15, 45)),
    smoothness_score: Math.round(rand(45, 92)),
    session_id: `session-${Date.now()}`,
  }
  mockHistory.unshift({
    session_id: result.session_id, created: new Date().toISOString(), target_letter: target,
    predicted_letter: letter, confidence: result.confidence, accuracy_score: result.accuracy_score,
    smoothness_score: result.smoothness_score, points,
  })
  return result
}

export async function mockGetHistory(limit) {
  await delay(400)
  return mockHistory.slice(0, limit)
}

export async function mockGetPatients() {
  await delay(500)
  return []
}

export async function mockLinkPatient(email) {
  await delay(500)
  return { id: `mock-${email}`, name: email.split('@')[0], email, sessions_total: 0, last_active: null }
}

export async function mockGetPatientHistory(_patientId) {
  await delay(400)
  return []
}
