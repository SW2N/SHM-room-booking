import { t } from '../lib/i18n'
import { useSession } from '../state/session'

export function TopBar({ handedCount, onMyBookings, onSettings, onAdmin }: {
  handedCount: number
  onMyBookings: () => void
  onSettings: () => void
  onAdmin: () => void
}) {
  const { profile, lang, isAdmin, signOut } = useSession()
  return (
    <header className="topbar">
      <h1>{t('appTitle', lang)}</h1>
      <nav>
        <button onClick={onMyBookings}>
          {t('myBookings', lang)}
          {handedCount > 0 && <span className="badge" aria-label={t('handedToYou', lang)}>{handedCount}</span>}
        </button>
        {isAdmin && <button onClick={onAdmin}>{t('admin', lang)}</button>}
        <button onClick={onSettings}>{t('settings', lang)}</button>
        <span className="who">{profile?.display_name}</span>
        <button className="link" onClick={signOut}>{t('signOut', lang)}</button>
      </nav>
    </header>
  )
}
