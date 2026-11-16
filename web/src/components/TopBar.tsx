import { useEffect, useRef, useState } from 'react'
import { t } from '../lib/i18n'
import { useSession } from '../state/session'

export function TopBar({ handedCount, onMyBookings, onSettings, onAdmin }: {
  handedCount: number
  onMyBookings: () => void
  onSettings: () => void
  onAdmin: () => void
}) {
  const { profile, lang, isAdmin, signOut } = useSession()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  // Close the phone menu on a click outside it or on Escape.
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const pick = (fn: () => void) => () => { setOpen(false); fn() }

  return (
    <header className="topbar">
      <h1>{t('appTitle', lang)}</h1>
      <nav>
        <button onClick={onMyBookings}>
          {t('myBookings', lang)}
          {handedCount > 0 && <span className="badge" aria-label={t('handedToYou', lang)}>{handedCount}</span>}
        </button>
        {/* Wide screens: everything in a row. */}
        <span className="wide-only">
          {isAdmin && <button onClick={onAdmin}>{t('admin', lang)}</button>}
          <button onClick={onSettings}>{t('settings', lang)}</button>
          <span className="who">{profile?.display_name}</span>
          <button className="link" onClick={signOut}>{t('signOut', lang)}</button>
        </span>
        {/* Phones: the rest goes in a ☰ menu. */}
        <div className="narrow-only menu-wrap" ref={wrap}>
          <button aria-label={t('menu', lang)} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>☰</button>
          {open && (
            <div className="menu" role="menu">
              <p className="who">{profile?.display_name}</p>
              {isAdmin && <button role="menuitem" onClick={pick(onAdmin)}>{t('admin', lang)}</button>}
              <button role="menuitem" onClick={pick(onSettings)}>{t('settings', lang)}</button>
              <button role="menuitem" onClick={pick(signOut)}>{t('signOut', lang)}</button>
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}
