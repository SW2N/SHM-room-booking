import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Room } from '../lib/api'
import { RoomList } from './RoomList'

const room = (code: string, name_th: string, size: Room['size_class'], building: Room['building'], sort: number): Room =>
  ({ code, name_th, name_en: name_th, size_class: size, building, floor: 5, seats_min: 4, seats_max: 6, sort })
const ROOMS = [
  room('AC2-2', 'ฮานาโซล', 'S', 'Academy', 2),
  room('KT5-1', 'ซอฟท์ดี', 'M', 'Korn Thong', 5),
  room('KT5-2', 'ว้าว', 'S', 'Korn Thong', 6),
  room('KT6-2', 'ยกนิ้ว', 'S', 'Korn Thong', 9),
]

vi.mock('../state/session', () => ({ useSession: () => ({ lang: 'th', profile: { id: 'me' }, isAdmin: false }) }))
vi.mock('../state/data', () => ({
  useData: () => ({
    rooms: ROOMS,
    holidays: [{ day: '2026-12-31', name_th: 'วันสิ้นปี', name_en: null }],
    holds: [],
    bookings: [{ id: 'b1', room_code: 'KT5-1', starts_at: '2099-11-24T14:00:00+07:00', ends_at: '2099-11-24T15:00:00+07:00', status: 'confirmed' }],
  }),
}))

afterEach(cleanup)
const base = { date: '2099-11-24', start: '14:00', end: '15:30', sizes: [] as Room['size_class'][] }

describe('RoomList', () => {
  it('marks a room booked during the chosen time as taken', () => {
    render(<RoomList search={base} selected="KT5-2" onSelect={() => {}} onBook={() => {}} />)
    expect(screen.getByRole('button', { name: /^ซอฟท์ดี/ }).textContent).toContain('ไม่ว่าง')
    expect(screen.getByRole('button', { name: /^ว้าว/ }).textContent).toContain('ว่าง')
  })
  it('filters by size', () => {
    render(<RoomList search={{ ...base, sizes: ['S'] }} selected="KT5-2" onSelect={() => {}} onBook={() => {}} />)
    expect(screen.queryByText(/ซอฟท์ดี/)).toBeNull()
    expect(screen.getAllByRole('listitem').length).toBe(3)
  })
  it('shows no free/taken labels when no time is chosen', () => {
    render(<RoomList search={{ ...base, start: null, end: null }} selected="KT5-2" onSelect={() => {}} onBook={() => {}} />)
    expect(document.body.textContent).not.toMatch(/ไม่ว่าง|ว่าง/)
  })
  it('never shows room codes', () => {
    render(<RoomList search={base} selected="KT5-2" onSelect={() => {}} onBook={() => {}} />)
    expect(document.body.textContent).not.toMatch(/KT5-1|AC2-2/)
  })
  it('shows rooms as closed on a holiday, with no Book button', () => {
    render(<RoomList search={{ ...base, date: '2026-12-31' }} selected="KT5-2" onSelect={() => {}} onBook={() => {}} />)
    expect(document.body.textContent).not.toMatch(/ว่าง/)
    expect(screen.queryByRole('button', { name: /^จอง/ })).toBeNull()
  })
  it('offers to book the selected room when it is free', () => {
    render(<RoomList search={base} selected="KT5-2" onSelect={() => {}} onBook={() => {}} />)
    expect(screen.getByRole('button', { name: /จอง ว้าว 14:00–15:30/ })).toBeTruthy()
  })
})
