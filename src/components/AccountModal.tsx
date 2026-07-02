import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useAuth } from '../lib/auth'
import { toMessage } from '../lib/format'

/** Dedicated account panel — change username/password and sign out. */
export function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, updateAccount, signOut } = useAuth()
  const [username, setUsername] = useState(user ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [current, setCurrent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Reset the form each time the panel opens (and follow username renames).
  useEffect(() => {
    if (open) {
      setUsername(user ?? '')
      setNewPassword('')
      setConfirm('')
      setCurrent('')
      setError(null)
      setNotice(null)
    }
  }, [open, user])

  const nameChanged = username.trim() !== '' && username.trim() !== user
  const wantsNewPassword = newPassword !== '' || confirm !== ''
  const dirty = nameChanged || wantsNewPassword

  const close = () => {
    if (busy) return
    onClose()
  }

  const save = async () => {
    setError(null)
    setNotice(null)
    if (wantsNewPassword && newPassword !== confirm) {
      setError('New passwords don’t match.')
      return
    }
    setBusy(true)
    try {
      await updateAccount({
        currentPassword: current,
        newUsername: nameChanged ? username.trim() : undefined,
        newPassword: wantsNewPassword ? newPassword : undefined,
      })
      setNotice('Account updated.')
      setNewPassword('')
      setConfirm('')
      setCurrent('')
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const handleSignOut = () => {
    signOut()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Account"
      footer={
        <>
          <button
            className="btn-ghost mr-auto text-rmit-red hover:bg-brand-50 dark:hover:bg-brand-500/15"
            onClick={handleSignOut}
            disabled={busy}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
          <button className="btn-outline" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="btn-navy" onClick={save} disabled={busy || !dirty || !current}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <p className="text-sm text-muted">
          Signed in as <strong className="text-ink">{user}</strong>. Change your username or
          password below.
        </p>
        <div>
          <label className="label" htmlFor="account-username">
            Username
          </label>
          <input
            id="account-username"
            className="input"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="account-new-password">
              New password
            </label>
            <input
              id="account-new-password"
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="Leave blank to keep current"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="account-confirm-password">
              Confirm new password
            </label>
            <input
              id="account-confirm-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>
        <div className="border-t border-line pt-4">
          <label className="label" htmlFor="account-current-password">
            Current password <span className="text-rmit-red">(required to save)</span>
          </label>
          <input
            id="account-current-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        {notice && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
            {notice}
          </p>
        )}
        {error && (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            {error}
          </p>
        )}
        {/* Hidden submit so Enter submits from any field */}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}
