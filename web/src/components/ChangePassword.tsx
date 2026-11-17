import { useState } from 'react'
import { errorMessage } from '../lib/errors'
import { t } from '../lib/i18n'
import { useSession } from '../state/session'
import { supabase } from '../supabase'
import { useToast } from './Toast'

/** New password + confirm. Used in Settings and, after an admin reset, before the app can be used. */
export function ChangePasswordForm({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const { lang, refreshProfile } = useSession()
  const toast = useToast()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setError('')
    if (pw.length < 6) return setError(errorMessage('Password should be at least', lang))
    if (pw !== pw2) return setError(t('passwordsDiffer', lang))
    setBusy(true)
    try {
      const { error: e } = await supabase.auth.updateUser({ password: pw })
      if (e) throw e
      await supabase.rpc('password_changed')
      await refreshProfile()
      toast(t('passwordChanged', lang))
      onDone()
    } catch (e) {
      setError(errorMessage(e, lang))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); void save() }} noValidate>
      <label>{t('newPassword', lang)}
        <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} required />
      </label>
      <label>{t('confirmPassword', lang)}
        <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={6} required />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        {onCancel && <button type="button" onClick={onCancel}>{t('cancel', lang)}</button>}
        <button className="primary" type="submit" disabled={busy}>{t('changePassword', lang)}</button>
      </div>
    </form>
  )
}

/** After an admin reset, the person signs in with a temporary password and must choose their own first. */
export function PasswordGate() {
  const { lang, profile } = useSession()
  if (!profile?.must_change_password) return null
  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label={t('chooseOwnPassword', lang)}>
        <div className="modal-head"><h2>{t('chooseOwnPassword', lang)}</h2></div>
        <div className="modal-body">
          <p className="muted small">{t('chooseOwnPasswordHint', lang)}</p>
          <ChangePasswordForm onDone={() => {}} />
        </div>
      </div>
    </div>
  )
}

/** Settings section: change password on demand. */
export function ChangePasswordSection() {
  const { lang } = useSession()
  const [open, setOpen] = useState(false)
  return (
    <section>
      <h3>{t('changePassword', lang)}</h3>
      {open ? <ChangePasswordForm onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
        : <button onClick={() => setOpen(true)}>{t('changePassword', lang)}</button>}
    </section>
  )
}
