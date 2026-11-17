import { useState, type FormEvent } from 'react'
import { DEPARTMENTS } from '../lib/departments'
import { errorMessage } from '../lib/errors'
import { t } from '../lib/i18n'
import { useSession } from '../state/session'
import { supabase } from '../supabase'

type Mode = 'signin' | 'signup' | 'forgot' | 'reset'
// The last email that signed in on this browser, so it is filled in after signing out.
const LAST_EMAIL = 'shm-last-email'
const lastEmail = () => { try { return localStorage.getItem(LAST_EMAIL) ?? '' } catch { return '' } }

export function AuthScreen({ reset }: { reset?: boolean }) {
  const { lang, setGuestLang, doneRecovering } = useSession()
  const [mode, setMode] = useState<Mode>(reset ? 'reset' : 'signin')
  const [email, setEmail] = useState(lastEmail)
  // Sign-up for someone not on the staff list yet asks for their name and department too.
  const [needDetails, setNeedDetails] = useState(false)
  const [name, setName] = useState('')
  const [dept, setDept] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNote('')
    if (mode === 'signup' && !email.trim().toLowerCase().endsWith('@sahamitproduct.com')) {
      return setError(t('shmOnly', lang))
    }
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        try { localStorage.setItem(LAST_EMAIL, email.trim()) } catch { /* private browsing: nothing to remember */ }
      } else if (mode === 'signup') {
        if (needDetails) {
          if (!name.trim() || !dept) return setError(t('nameDeptRequired', lang))
          const { error } = await supabase.auth.signUp({
            email: email.trim(), password, options: { data: { display_name: name.trim(), department: dept } },
          })
          if (error) throw error
        } else {
          // People already on the staff list get their details from it; anyone new is asked for theirs.
          const { data: status, error: checkErr } = await supabase.rpc('can_sign_up', { p_email: email.trim().toLowerCase() })
          if (checkErr) throw checkErr
          if (status === 'new') return setNeedDetails(true)
          if (status !== 'listed') throw new Error(status as string)
          const { error } = await supabase.auth.signUp({ email: email.trim(), password })
          if (error) throw error
        }
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
        {mode === 'forgot' ? <p className="note">{t('askAdminReset', lang)}</p> : (
        <form onSubmit={submit} noValidate>
          {mode !== 'reset' && (
            <label>{t('email', lang)}
              <input type="email" autoComplete="username" placeholder="name@sahamitproduct.com" value={email} onChange={(e) => { setEmail(e.target.value); setNeedDetails(false) }} required />
            </label>
          )}
          <label>{mode === 'reset' ? t('newPassword', lang) : t('password', lang)}
            <input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </label>
          {mode === 'signup' && needDetails && (
            <>
              <p className="note small">{t('tellUsAboutYou', lang)}</p>
              <label>{t('displayName', lang)}
                <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </label>
              <label>{t('department', lang)}
                <select value={dept} onChange={(e) => setDept(e.target.value)} required>
                  <option value="">{t('chooseDept', lang)}</option>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
            </>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          {note && <p className="note">{note}</p>}
          <button className="primary" type="submit" disabled={busy}>{heading}</button>
        </form>
        )}
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
