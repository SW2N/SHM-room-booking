import { roomState } from '../lib/availability'
import { toTimestamp } from '../lib/dates'
import { t } from '../lib/i18n'
import { roomName, roomsForSearch, type Search } from '../lib/search'
import { useData } from '../state/data'
import { useSession } from '../state/session'

export function RoomList({ search, selected, onSelect, onBook }: {
  search: Search
  selected: string
  onSelect: (code: string) => void
  onBook: (code: string) => void
}) {
  const { lang, profile } = useSession()
  const { rooms, bookings, holds } = useData()
  const timed = Boolean(search.start && search.end)
  const start = timed ? toTimestamp(search.date, search.start!) : ''
  const end = timed ? toTimestamp(search.date, search.end!) : ''
  const shown = roomsForSearch(rooms, search)
  const state = (code: string) => (timed ? roomState(code, start, end, bookings, holds, profile?.id ?? '') : null)
  const sel = shown.find((r) => r.code === selected)
  const selFree = sel && state(sel.code) === 'free'

  return (
    <section className="roomlist panel">
      {(['Academy', 'Korn Thong'] as const).map((b) => {
        const list = shown.filter((r) => r.building === b)
        if (!list.length) return null
        return (
          <div key={b}>
            <h3>{b === 'Academy' ? (lang === 'th' ? 'อาคาร Academy' : 'Academy') : (lang === 'th' ? 'อาคารกรทอง' : 'Korn Thong')}</h3>
            <ul className="rooms">
              {list.map((r) => {
                const st = state(r.code)
                return (
                  <li key={r.code}>
                    <button className={r.code === selected ? 'room selected' : 'room'} aria-pressed={r.code === selected} onClick={() => onSelect(r.code)}>
                      <span className="room-name">{roomName(r, lang)}</span>
                      <span className="room-meta">{t('floor', lang)} {r.floor} · {r.seats_min}–{r.seats_max} {t('seats', lang)}</span>
                      {st && <span className={`state ${st}`}>{t(st, lang)}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
      {timed && sel && selFree && (
        <button className="primary book" onClick={() => onBook(sel.code)}>
          {t('book', lang)} {roomName(sel, lang)} {search.start}–{search.end}
        </button>
      )}
    </section>
  )
}
