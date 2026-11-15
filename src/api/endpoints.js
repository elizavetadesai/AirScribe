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
  mockLinkPatient,
  mockDeleteAccount,
} from './mock'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function register(email, password, role) {
  if (USE_MOCK) return mockRegister(email, password, role)
  return apiFetch('/auth/register', { method: 'POST', body: { email, password, role }, auth: false })
}

export async function login(email, password) {
  if (USE_MOCK) return mockLogin(email, password)
  return apiFetch('/auth/login', { method: 'POST', body: { email, password }, auth: false })
}

/** DELETE /auth/me — deletes the account and all its attempts */
export async function deleteAccount() {
  if (USE_MOCK) return mockDeleteAccount()
  return apiFetch('/auth/me', { method: 'DELETE' })
}

// ── Practice ─────────────────────────────────────────────────────────────────

/**
 * POST /predict
 * @param {string} target       target id, e.g. "circle" or "L" (sent as target_letter)
 * @param {Array<[number, number, number]>} points  [[x, y, t_ms], ...] raw, NOT mirrored
 * @param {number} frameAspect  video width / height (MediaPipe scales x and y differently)
 */
export async function predict(target, points, frameAspect) {
  if (USE_MOCK) return mockPredict(target, points)
  return apiFetch('/predict', {
    method: 'POST',
    body: { target_letter: target, points, frame_aspect: frameAspect },
  })
}

// ── History ──────────────────────────────────────────────────────────────────

/** GET /history?limit=N */
export async function getHistory(limit = 50) {
  if (USE_MOCK) return mockGetHistory(limit)
  return apiFetch(`/history?limit=${limit}`)
}

// ── Clinician ────────────────────────────────────────────────────────────────

/** GET /clinician/patients */
export async function getPatients() {
  if (USE_MOCK) return mockGetPatients()
  return apiFetch('/clinician/patients')
}

/** POST /clinician/patients {email} — link an existing patient account */
export async function linkPatient(email) {
  if (USE_MOCK) return mockLinkPatient(email)
  return apiFetch('/clinician/patients', { method: 'POST', body: { email } })
}

/** GET /clinician/patients/{id}/history */
export async function getPatientHistory(patientId) {
  if (USE_MOCK) return mockGetPatientHistory(patientId)
  return apiFetch(`/clinician/patients/${patientId}/history`)
}

// ── Data collection (/collect page, no login; protected by the team code in the link) ──

/** POST /collect/participants {code} -> {participant_id: "P07"} */
export async function collectNewParticipant(code) {
  return apiFetch('/collect/participants', { method: 'POST', body: { code }, auth: false })
}

/** POST /collect/samples — idempotent thanks to client_id */
export async function collectUpload(code, s) {
  return apiFetch('/collect/samples', {
    method: 'POST',
    auth: false,
    body: {
      code, participant_id: s.participant, client_id: s.client_id, label: s.label, hand: s.hand,
      note: s.note || '', fps: s.fps, aspect: s.aspect, created: s.created, points: s.points,
    },
  })
}

/** DELETE /collect/samples/{client_id} — used by "Undo last" */
export async function collectDelete(code, participantId, clientId) {
  const q = `participant_id=${encodeURIComponent(participantId)}&code=${encodeURIComponent(code)}`
  return apiFetch(`/collect/samples/${encodeURIComponent(clientId)}?${q}`, { method: 'DELETE', auth: false })
}
