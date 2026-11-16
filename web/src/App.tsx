import { useEffect, useState } from 'react'
import { AdminPanel } from './components/AdminPanel'
import { AuthScreen } from './components/AuthScreen'
import { BanPopup } from './components/BanPopup'
import { BookingDetails } from './components/BookingDetails'
import { BookingForm, type FormInit } from './components/BookingForm'
import { DayTimeline } from './components/DayTimeline'
import { MyBookings } from './components/MyBookings'
import { RoomCalendar } from './components/RoomCalendar'
import { RoomList } from './components/RoomList'
import { SearchBar } from './components/SearchBar'
import { SettingsModal } from './components/SettingsModal'
import { TopBar } from './components/TopBar'
import { bkkDate, bkkTime, todayBkk } from './lib/dates'
import { t } from './lib/i18n'
import { roomsForSearch, type Search } from './lib/search'
import { useData } from './state/data'
import { useSession } from './state/session'

export default function App() {
  const { session, ready, recovering, profile, lang, refreshProfile } = useSession()
  const { rooms, mine, loading } = useData()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [banOpen, setBanOpen] = useState(false)
  const [search, setSearch] = useState<Search>(() => ({ date: todayBkk(), start: null, end: null, sizes: [] }))
  const [selected, setSelected] = useState('')
  const [form, setForm] = useState<FormInit | null>(null)
  const [details, setDetails] = useState<string | null>(null)
  const [mineOpen, setMineOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const handedCount = mine.filter((b) => b.handover_unseen).length

  const openNew = (room: string, startIso: string, endIso: string) =>
    setForm({ room, date: bkkDate(startIso), start: bkkTime(startIso), end: bkkTime(endIso), mode: 'new' })
  const banned = async () => {
    await refreshProfile()
    setBanOpen(true)
  }

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
      <TopBar handedCount={handedCount} onMyBookings={() => setMineOpen(true)} onSettings={() => setSettingsOpen(true)} onAdmin={() => setAdminOpen(true)} />
      <main className="page">
        <SearchBar search={search} onChange={setSearch} />
        {loading ? (
          <p className="muted">{t('loading', lang)}</p>
        ) : (
          <div className="section-a">
            <RoomList search={search} selected={selected} onSelect={setSelected}
              onBook={(room) => setForm({ room, date: search.date, start: search.start!, end: search.end!, mode: 'new' })} />
            {selected && <RoomCalendar room={selected} search={search} onSlotClick={(s, e) => openNew(selected, s, e)} onEventClick={setDetails} />}
          </div>
        )}
        {!loading && (
          <DayTimeline search={search} selected={selected} onSelectRoom={setSelected}
            onSlotClick={(room, s, e) => { setSelected(room); openNew(room, s, e) }} onEventClick={setDetails} />
        )}
      </main>
      {mineOpen && <MyBookings onClose={() => setMineOpen(false)} onOpenBooking={(id) => { setMineOpen(false); setDetails(id) }} />}
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
      {details && <BookingDetails bookingId={details} onClose={() => setDetails(null)} onEdit={(init) => { setDetails(null); setForm(init) }} />}
      {form && <BookingForm key={JSON.stringify(form)} init={form} onClose={() => setForm(null)} onBanned={banned} />}
      {settingsOpen && <SettingsModal open onClose={() => setSettingsOpen(false)} />}
      <BanPopup open={banOpen} onClose={() => setBanOpen(false)} />
    </>
  )
}
