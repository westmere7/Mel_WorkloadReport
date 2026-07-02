import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useAuth } from '../lib/auth'
import { toMessage } from '../lib/format'

export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (busy) return
    setUsername('')
    setPassword('')
    setError(null)
    onClose()
  }

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await signIn(username, password)
      setUsername('')
      setPassword('')
      onClose()
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Sign in"
      footer={
        <>
          <button className="btn-outline" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="btn-navy" onClick={submit} disabled={busy || !username.trim() || !password}>
            <LogIn className="h-4 w-4" /> {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <p className="text-sm text-muted">
          Anyone can browse the dashboard and task list — sign in to register or edit tasks.
        </p>
        <div>
          <label className="label" htmlFor="login-username">
            Username
          </label>
          <input
            id="login-username"
            className="input"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            {error}
          </p>
        )}
        {/* Hidden submit so Enter works in either field */}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}
