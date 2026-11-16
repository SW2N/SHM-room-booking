import type { DateSelectArg, DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core'
import thLocale from '@fullcalendar/core/locales/th'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import { useEffect, useMemo, useRef } from 'react'
import { fromFloating, toEvents } from '../lib/calendarEvents'
import { addDays, isoWeekday } from '../lib/dates'
import { t } from '../lib/i18n'
import { roomName, type Search } from '../lib/search'
import { useData } from '../state/data'
import { useSession } from '../state/session'

export function RoomCalendar({ room, search, onSlotClick, onEventClick }: {
  room: string
  search: Search
  onSlotClick: (startIso: string, endIso: string) => void
  onEventClick: (bookingId: string) => void
}) {
  const { lang, profile, isAdmin } = useSession()
  const { rooms, bookings, holds, holidays, setRange } = useData()
  const ref = useRef<FullCalendar>(null)
  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.day)), [holidays])
  const r = rooms.find((x) => x.code === room)

  useEffect(() => {
    ref.current?.getApi().gotoDate(search.date)
  }, [search.date])

  const events = useMemo<EventInput[]>(() => {
    const evs: EventInput[] = toEvents(room, bookings, holds, profile?.id ?? '', lang)
    for (const h of holidays) {
      const name = (lang === 'en' && h.name_en) || h.name_th
      evs.push({ start: h.day, allDay: true, display: 'background', title: name, classNames: ['ev-holiday'] })
      evs.push({ start: `${h.day}T08:00:00`, end: `${h.day}T20:00:00`, display: 'background', title: name, classNames: ['ev-holiday'] })
    }
    if (search.start && search.end) {
      evs.push({ start: `${search.date}T${search.start}:00`, end: `${search.date}T${search.end}:00`, display: 'background', classNames: ['ev-search'] })
    }
    return evs
  }, [room, bookings, holds, holidays, profile?.id, lang, search])

  const bookable = (day: string) => isAdmin || (isoWeekday(day) < 6 && !holidaySet.has(day))

  return (
    <section className="calendar panel">
      {r && <h3>{roomName(r, lang)}</h3>}
      <FullCalendar
        ref={ref}
        plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
        initialView="timeGridDay"
        initialDate={search.date}
        timeZone="UTC"
        locale={lang === 'th' ? thLocale : 'en-gb'}
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth' }}
        buttonText={{ today: t('today', lang), day: t('day', lang), week: t('week', lang), month: t('month', lang) }}
        slotMinTime="08:00:00"
        slotMaxTime="20:00:00"
        slotDuration="00:30:00"
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        allDaySlot={false}
        nowIndicator={false}
        height="auto"
        expandRows
        navLinks
        selectable
        selectMirror
        businessHours={{ daysOfWeek: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '20:00' }}
        dayCellClassNames={(a) => {
          const day = a.date.toISOString().slice(0, 10)
          return isoWeekday(day) > 5 || holidaySet.has(day) ? ['day-off'] : []
        }}
        selectAllow={(s) => {
          const day = s.start.toISOString().slice(0, 10)
          const sameDay = s.end.getTime() - s.start.getTime() <= 12 * 3600_000 && !s.allDay
          return sameDay && bookable(day)
        }}
        select={(s: DateSelectArg) => {
          ref.current?.getApi().unselect()
          onSlotClick(fromFloating(s.start), fromFloating(s.end))
        }}
        eventClick={(e: EventClickArg) => {
          if (!e.event.id || e.event.id.startsWith('hold-')) return
          onEventClick(e.event.id)
        }}
        datesSet={(d: DatesSetArg) => {
          const from = d.start.toISOString().slice(0, 10)
          setRange(from, addDays(d.end.toISOString().slice(0, 10), 1))
        }}
        events={events}
      />
    </section>
  )
}
