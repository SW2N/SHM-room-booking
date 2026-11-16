import { useEffect, useState } from 'react'
import { AuthScreen } from './components/AuthScreen'
import { BanPopup } from './components/BanPopup'
import { RoomList } from './components/RoomList'
import { SearchBar } from './components/SearchBar'
import { SettingsModal } from './components/SettingsModal'
import { TopBar } from './components/TopBar'
import { todayBkk } from './lib/dates'
import { t } from './lib/i18n'
import { roomsForSearch, type Search } from './lib/search'
import { useData } from './state/data'
import { useSession } from './state/session'

export default function App() {
  const { session, ready, recovering, profile, lang } = useSession()
  const { rooms, loading } = useData()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [banOpen, setBanOpen] = useState(false)
  const [search, setSearch] = useState<Search>(() => ({ date: todayBkk(), start: null, end: null, sizes: [] }))
  const [selected, setSelected] = useState('')

  useEffect(() => {
    if (profile?.banned_until && new Date(profile.banned_until) > new Date()) setBanOpen(true)
  }, [profile?.banned_until])

  // Keep a room selected: the first shown when none is, or when the size filter hides the selected one.
  useEffect(() => {
    const shown = roomsForSearch(rooms, search)
    if (shown.length && !shown.some((r) => r.code === selected)) setSelected(shown[0].code)
  }, [rooms, search, selected])

  if (!ready) return <p className="muted" style={{ padding: 24 }}>{t('loading', lang)}</p>
  if (recovering) return <AuthScreen reset />
  if (!session) return <AuthScreen />

  return (
    <>
      <TopBar handedCount={0} onMyBookings={() => {}} onSettings={() => setSettingsOpen(true)} onAdmin={() => {}} />
      <main className="page">
        <SearchBar search={search} onChange={setSearch} />
        {loading ? (
          <p className="muted">{t('loading', lang)}</p>
        ) : (
          <div className="section-a">
            <RoomList search={search} selected={selected} onSelect={setSelected} onBook={() => {}} />
            <section className="calendar panel" />
          </div>
        )}
      </main>
      {settingsOpen && <SettingsModal open onClose={() => setSettingsOpen(false)} />}
      <BanPopup open={banOpen} onClose={() => setBanOpen(false)} />
    </>
  )
}
