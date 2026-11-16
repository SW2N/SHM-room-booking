import { useCallback, useEffect, useState } from 'react'
import { addHoliday, adminLiftBan, adminRemoveUser, deleteHoliday, findProfileByEmail } from '../lib/api'
import { bkkDate, bkkTime, formatDate, todayBkk } from '../lib/dates'
import { errorMessage } from '../lib/errors'
import { t } from '../lib/i18n'
import { useData } from '../state/data'
import { useSession } from '../state/session'
import { supabase } from '../supabase'
import { Modal } from './Modal'
import { useToast } from './Toast'

type BanRow = { user_id: string; ends_at: string; profiles: { display_name: string; email: string } | null }

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const { lang, opts } = useSession()
  const { holidays } = useData()
  const toast = useToast()
  const [bans, setBans] = useState<BanRow[]>([])
  const [email, setEmail] = useState('')
  const [hDay, setHDay] = useState('')
  const [hTh, setHTh] = useState('')
  const [hEn, setHEn] = useState('')
  const [holidayList, setHolidayList] = useState(holidays)

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
  useEffect(() => setHolidayList(holidays), [holidays])

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

  async function reloadHolidays() {
    const { data } = await supabase.from('holidays').select('*').order('day')
    setHolidayList(data ?? [])
  }

  return (
    <Modal open wide title={t('admin', lang)} onClose={onClose}>
      <section>
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

      <section className="form">
        <h3>{t('removeAccount', lang)}</h3>
        <div className="row">
          <input type="email" placeholder="name@sahamitproduct.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="danger" onClick={remove} disabled={!email.trim()}>{t('removeAccount', lang)}</button>
        </div>
      </section>

      <section className="form">
        <h3>{t('holidays', lang)}</h3>
        <div className="row">
          <input type="date" value={hDay} onChange={(e) => setHDay(e.target.value)} aria-label={t('date', lang)} />
          <input placeholder={t('nameTh', lang)} value={hTh} onChange={(e) => setHTh(e.target.value)} />
          <input placeholder={t('nameEn', lang)} value={hEn} onChange={(e) => setHEn(e.target.value)} />
          <button disabled={!hDay || !hTh.trim()} onClick={() => act(() => addHoliday(hDay, hTh.trim(), hEn.trim()), t('saved', lang), async () => {
            setHDay(''); setHTh(''); setHEn(''); await reloadHolidays()
          })}>{t('addHoliday', lang)}</button>
        </div>
        <ul className="plain">
          {holidayList.filter((h) => h.day >= todayBkk()).map((h) => (
            <li key={h.day} className="row">
              <span>{formatDate(h.day, opts)} · {(lang === 'en' && h.name_en) || h.name_th}</span>
              <button className="link" onClick={() => act(() => deleteHoliday(h.day), t('saved', lang), reloadHolidays)}>{t('delete', lang)}</button>
            </li>
          ))}
        </ul>
      </section>
    </Modal>
  )
}
