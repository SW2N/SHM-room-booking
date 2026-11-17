import { useCallback, useEffect, useState } from 'react'
import { adminLiftBan, adminRemoveUser, findProfileByEmail } from '../lib/api'
import { bkkDate, bkkTime, formatDate } from '../lib/dates'
import { errorMessage } from '../lib/errors'
import { t } from '../lib/i18n'
import { useSession } from '../state/session'
import { supabase } from '../supabase'
import { HolidayTable } from './HolidayTable'
import { UserTable } from './UserTable'
import { Modal } from './Modal'
import { useToast } from './Toast'

type BanRow = { user_id: string; ends_at: string; profiles: { display_name: string; email: string } | null }

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const { lang, opts } = useSession()
  const toast = useToast()
  const [bans, setBans] = useState<BanRow[]>([])
  const [email, setEmail] = useState('')
  const [tab, setTab] = useState<'users' | 'holidays' | 'paused'>('users')

  const loadBans = useCallback(async () => {
    const { data } = await supabase
      .from('bans')
      .select('user_id, ends_at, profiles!bans_user_id_fkey(display_name, email)')
      .is('lifted_at', null)
      .gt('ends_at', new Date().toISOString())
      .order('ends_at')
    setBans((data as unknown as BanRow[]) ?? [])
  }, [])

  useEffect(() => { void loadBans() }, [loadBans])

  async function act(fn: () => Promise<unknown>, done: string, after?: () => Promise<void> | void) {
    try {
      await fn()
      await after?.()
      toast(done)
    } catch (e) {
      toast(errorMessage(e, lang), 'error')
    }
  }

  async function remove() {
    const p = await findProfileByEmail(email).catch(() => null)
    if (!p) return toast(errorMessage('RECIPIENT_NOT_FOUND', lang), 'error')
    if (!window.confirm(`${t('removeConfirm', lang)}\n${p.display_name} · ${p.email}`)) return
    await act(() => adminRemoveUser(p.id), t('removed', lang), () => setEmail(''))
  }


  return (
    <Modal open wide="extra" title={t('admin', lang)} onClose={onClose}>
      <div className="tabs" role="tablist">
        {(['users', 'holidays', 'paused'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab active' : 'tab'} onClick={() => setTab(k)}>
            {t(k === 'users' ? 'users' : k === 'holidays' ? 'holidays' : 'bannedPeople', lang)}
            {k === 'paused' && bans.length > 0 && <span className="badge">{bans.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div role="tabpanel">
          <UserTable />
          <section className="form">
            <h3>{t('removeAccount', lang)}</h3>
            <p className="muted small">{t('removeAccountHint', lang)}</p>
            <div className="row">
              <input type="email" placeholder="name@sahamitproduct.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="danger" onClick={remove} disabled={!email.trim()}>{t('removeAccount', lang)}</button>
            </div>
          </section>
        </div>
      )}

      {tab === 'holidays' && <div role="tabpanel"><HolidayTable /></div>}

      {tab === 'paused' && (
        <section role="tabpanel">
          <h3>{t('bannedPeople', lang)}</h3>
          {bans.length === 0 ? <p className="muted">{t('nobodyBanned', lang)}</p> : (
            <ul className="plain">
              {bans.map((b) => (
                <li key={b.user_id} className="row">
                  <span>{b.profiles?.display_name} · {b.profiles?.email} · {t('banUntil', lang)} {formatDate(bkkDate(b.ends_at), opts)} {bkkTime(b.ends_at)}</span>
                  <button onClick={() => act(() => adminLiftBan(b.user_id), t('saved', lang), loadBans)}>{t('liftBan', lang)}</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Modal>
  )
}
