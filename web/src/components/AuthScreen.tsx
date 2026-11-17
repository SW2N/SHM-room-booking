import { useState, type FormEvent } from 'react'
import { errorMessage } from '../lib/errors'
import { t } from '../lib/i18n'
import { useSession } from '../state/session'
import { supabase } from '../supabase'

const PAGE_URL = 'https://sw2n.github.io/SHM-room-booking/'
type Mode = 'signin' | 'signup' | 'forgot' | 'reset'
// The last email that signed in on this browser, so it is filled in after signing out.
const LAST_EMAIL = 'shm-last-email'
const lastEmail = () => { try { return localStorage.getItem(LAST_EMAIL) ?? '' } catch { return '' } }

export function AuthScreen({ reset }: { reset?: boolean }) {
  const { lang, setGuestLang, doneRecovering } = useSession()
  const [mode, setMode] = useState<Mode>(reset ? 'reset' : 'signin')
  const [email, setEmail] = useState(lastEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNote('')
    if ((mode === 'signup' || mode === 'forgot') && !email.trim().toLowerCase().endsWith('@sahamitproduct.com')) {
      return setError(t('shmOnly', lang))
    }
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        try { localStorage.setItem(LAST_EMAIL, email.trim()) } catch { /* private browsing: nothing to remember */ }
      } else if (mode === 'signup') {
        // Only people on the staff list can sign up; say why before trying.
        const { data: allowed, error: checkErr } = await supabase.rpc('can_sign_up', { p_email: email.trim().toLowerCase() })
        if (checkErr) throw checkErr
        if (allowed !== 'ok') throw new Error(allowed as string)
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })
        if (error) throw error
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: PAGE_URL })
        if (error) throw error
        setNote(t('resetSent', lang))
      } else {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setNote(t('passwordSaved', lang))
        doneRecovering()
      }
    } catch (err) {
      setError(errorMessage(err, lang))
    } finally {
      setBusy(false)
    }
  }

  const heading = { signin: t('signIn', lang), signup: t('signUp', lang), forgot: t('forgotPassword', lang), reset: t('setPassword', lang) }[mode]
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-top">
          <h1>{t('appTitle', lang)}</h1>
          <button className="link" onClick={() => setGuestLang(lang === 'th' ? 'en' : 'th')}>{lang === 'th' ? 'English' : 'ไทย'}</button>
        </div>
        <h2>{heading}</h2>
        <form onSubmit={submit} noValidate>
          {mode !== 'reset' && (
            <label>{t('email', lang)}
              <input type="email" autoComplete="username" placeholder="name@sahamitproduct.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
          )}
          {mode !== 'forgot' && (
            <label>{mode === 'reset' ? t('newPassword', lang) : t('password', lang)}
              <input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </label>
          )}
          {mode === 'signup' && <p className="muted small">{t('signUpFromList', lang)}</p>}
          {error && <p className="error" role="alert">{error}</p>}
          {note && <p className="note">{note}</p>}
          <button className="primary" type="submit" disabled={busy}>{heading}</button>
        </form>
        <div className="auth-links">
          {mode === 'signin' && (
            <>
              <button className="link" onClick={() => setMode('signup')}>{t('noAccount', lang)}</button>
              <button className="link" onClick={() => setMode('forgot')}>{t('forgotPassword', lang)}</button>
            </>
          )}
          {(mode === 'signup' || mode === 'forgot') && (
            <button className="link" onClick={() => setMode('signin')}>{mode === 'signup' ? t('haveAccount', lang) : t('backToSignIn', lang)}</button>
          )}
        </div>
      </div>
    </main>
  )
}
