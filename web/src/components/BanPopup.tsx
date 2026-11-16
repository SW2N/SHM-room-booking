import { useEffect, useState } from 'react'
import { bkkDate, bkkTime, formatDate, formatRange } from '../lib/dates'
import { t } from '../lib/i18n'
import { useSession } from '../state/session'
import { supabase } from '../supabase'
import { Modal } from './Modal'

type Missed = { name_th: string; name_en: string; title: string; starts_at: string; ends_at: string }

export function BanPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, lang, opts } = useSession()
  const [missed, setMissed] = useState<Missed[]>([])
  const [cancelled, setCancelled] = useState(0)

  useEffect(() => {
    if (!open || !profile) return
    supabase
      .from('bans')
      .select('missed, ends_at, cancelled_count')
      .eq('user_id', profile.id)
      .order('starts_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        setMissed((data?.[0]?.missed as Missed[]) ?? [])
        setCancelled((data?.[0]?.cancelled_count as number) ?? 0)
      })
  }, [open, profile])

  if (!profile?.banned_until) return null
  const until = profile.banned_until
  return (
    <Modal open={open} title={t('banTitle', lang)} onClose={onClose}>
      <p>{t('banMissed', lang)}:</p>
      <ul className="plain">
        {missed.map((m) => (
          <li key={m.starts_at + m.name_en}>
            {lang === 'th' ? m.name_th : m.name_en} · {formatRange(m.starts_at, m.ends_at, opts)} · {m.title}
          </li>
        ))}
      </ul>
      <p>{t('banImpact', lang)}</p>
      {cancelled > 0 && <p>{t('banCancelled', lang).replace('{n}', String(cancelled))}</p>}
      <p><strong>{t('banUntil', lang)} {formatDate(bkkDate(until), opts)} {bkkTime(until)}</strong></p>
      <div className="actions">
        <button className="primary" onClick={onClose}>{t('gotIt', lang)}</button>
      </div>
    </Modal>
  )
}
