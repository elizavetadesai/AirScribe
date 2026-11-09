/**
 * API endpoint wrappers.
 * When VITE_USE_MOCK=true, delegates to mock implementations.
 * Otherwise uses the real apiFetch client.
 */

import { apiFetch } from './client'
import {
  mockRegister,
  mockLogin,
  mockPredict,
  mockGetHistory,
  mockGetPatients,
  mockGetPatientHistory,
} from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function register(email, password, role) {
  if (USE_MOCK) return mockRegister(email, password, role)
  return apiFetch('/auth/register', { method: 'POST', body: { email, password, role }, auth: false })
}

export async function login(email, password) {
  if (USE_MOCK) return mockLogin(email, password)
  return apiFetch('/auth/login', { method: 'POST', body: { email, password }, auth: false })
}

// ── Practice ─────────────────────────────────────────────────────────────────

/**
 * POST /predict
 * @param {string} targetLetter
 * @param {Array<[number, number, number]>} points  [[x, y, t_ms], ...]
 */
export async function predict(targetLetter, points) {
  if (USE_MOCK) return mockPredict(targetLetter, points)
  return apiFetch('/predict', {
    method: 'POST',
    body: { target_letter: targetLetter, points },
  })
}

// ── History ──────────────────────────────────────────────────────────────────

/**
 * GET /history?limit=N
 */
export async function getHistory(limit = 50) {
  if (USE_MOCK) return mockGetHistory(limit)
  return apiFetch(`/history?limit=${limit}`)
}

// ── Clinician ────────────────────────────────────────────────────────────────

/**
 * GET /clinician/patients
 */
export async function getPatients() {
  if (USE_MOCK) return mockGetPatients()
  return apiFetch('/clinician/patients')
}

/**
 * GET /clinician/patients/{id}/history
 */
export async function getPatientHistory(patientId) {
  if (USE_MOCK) return mockGetPatientHistory(patientId)
  return apiFetch(`/clinician/patients/${patientId}/history`)
}
