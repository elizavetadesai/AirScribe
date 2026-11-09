import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Alert } from '../components/ui/Alert'
import { Modal } from '../components/ui/Modal'

function Section({ heading, children }) {
  return (
    <div className="border-b border-[var(--color-border)] pb-10 last:border-0 last:pb-0 space-y-5">
      <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">{heading}</h2>
      {children}
    </div>
  )
}

function PrivacyRow({ title, body }) {
  return (
    <div className="flex gap-4 py-4 border-b border-[var(--color-border)] last:border-0">
      <div>
        <p className="font-medium text-sm text-[var(--color-text)] mb-0.5">{title}</p>
        <p className="text-sm text-[var(--color-muted)] leading-relaxed">{body}</p>
      </div>
    </div>
  )
}

export default function Settings() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  async function handleDelete() {
    setDeleteLoading(true)
    await new Promise(r => setTimeout(r, 1000))
    logout()
    navigate('/auth')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10 animate-fade-in">
      <div>
        <span className="label-caps">Settings</span>
        <h1 className="font-display text-2xl font-semibold text-[var(--color-text)] mt-1">
          Privacy & account
        </h1>
      </div>

      {/* Privacy */}
      <Section heading="What data does AirScribe use?">
        <p className="text-sm text-[var(--color-muted)] leading-relaxed">
          AirScribe uses your webcam to detect hand movements, but your camera feed is never recorded, stored, or uploaded. Only movement coordinates are ever sent to our server.
        </p>

        <Card className="divide-y divide-[var(--color-border)]" padding={false}>
          <div className="px-6 py-5">
            <PrivacyRow
              title="Webcam video stays on your device"
              body="The camera feed is processed entirely in your browser by the MediaPipe hand-tracking model. No video frames are ever sent anywhere."
            />
          </div>
          <div className="px-6 py-5">
            <PrivacyRow
              title="Only fingertip coordinates are sent"
              body="When you complete a practice attempt, we send a list of (X, Y, time) coordinate points from your index fingertip — nothing else."
            />
          </div>
          <div className="px-6 py-5">
            <PrivacyRow
              title="Your data is stored securely"
              body="Session results, scores, and trajectories are stored on our servers linked to your account. You can delete everything at any time."
            />
          </div>
          <div className="px-6 py-5">
            <PrivacyRow
              title="Data shared with your clinician"
              body="If a clinician links you to their account, they can see your session history and progress. They cannot access your credentials."
            />
          </div>
        </Card>
      </Section>

      {/* Medical disclaimer */}
      <Section heading="Medical disclaimer">
        <div className="border-l-4 border-sand-400 pl-5 py-1">
          <p className="text-sm text-[var(--color-muted)] leading-relaxed">
            <strong className="text-[var(--color-text)]">AirScribe is a rehabilitation support tool, not a medical device.</strong> It is not intended to diagnose, treat, cure, or prevent any disease or medical condition, and it is not a substitute for professional medical advice. Always seek the advice of a qualified health provider.
          </p>
        </div>
      </Section>

      {/* Account */}
      <Section heading="Account">
        <div className="space-y-4">
          <div className="flex items-center justify-between py-4 border-b border-[var(--color-border)]">
            <div>
              <p className="font-medium text-sm text-[var(--color-text)]">{user?.name}</p>
              <p className="label-caps mt-0.5">{user?.email} &ensp;·&ensp; {user?.role}</p>
            </div>
          </div>

          <Button
            variant="secondary"
            size="md"
            className="w-full"
            onClick={() => { logout(); navigate('/auth') }}
          >
            Log out
          </Button>

          <div className="pt-4 space-y-3">
            <p className="text-xs text-[var(--color-muted)] leading-relaxed">
              Deleting your account permanently removes all your sessions, scores, and personal data. This cannot be undone.
            </p>
            <Button variant="danger" size="md" onClick={() => setDeleteOpen(true)}>
              Delete my account
            </Button>
          </div>
        </div>
      </Section>

      {/* Delete modal */}
      <Modal
        open={deleteOpen}
        onClose={() => !deleteLoading && setDeleteOpen(false)}
        title="Delete account"
        size="sm"
      >
        <div className="space-y-4">
          <Alert variant="error" title="This cannot be undone">
            All your session data, scores, and account information will be permanently deleted.
          </Alert>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteOpen(false)} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" onClick={handleDelete} loading={deleteLoading}>
              Yes, delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
