import { useEffect, useState } from 'react'
import { AuthScreen } from './components/AuthScreen'
import { BanPopup } from './components/BanPopup'
import { SettingsModal } from './components/SettingsModal'
import { TopBar } from './components/TopBar'
import { t } from './lib/i18n'
import { useSession } from './state/session'

export default function App() {
  const { session, ready, recovering, profile, lang } = useSession()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [banOpen, setBanOpen] = useState(false)

  useEffect(() => {
    if (profile?.banned_until && new Date(profile.banned_until) > new Date()) setBanOpen(true)
  }, [profile?.banned_until])

  if (!ready) return <p className="muted" style={{ padding: 24 }}>{t('loading', lang)}</p>
  if (recovering) return <AuthScreen reset />
  if (!session) return <AuthScreen />

  return (
    <>
      <TopBar handedCount={0} onMyBookings={() => {}} onSettings={() => setSettingsOpen(true)} onAdmin={() => {}} />
      <main className="page">
        <p className="muted">{t('loading', lang)}</p>
      </main>
      {settingsOpen && <SettingsModal open onClose={() => setSettingsOpen(false)} />}
      <BanPopup open={banOpen} onClose={() => setBanOpen(false)} />
    </>
  )
}
