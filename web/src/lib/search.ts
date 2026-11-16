import type { Room } from './api'

export type Size = Room['size_class']
export type Search = { date: string; start: string | null; end: string | null; sizes: Size[] }
export const SIZES: Size[] = ['S', 'M', 'L', 'XL']
export const SIZE_HINT: Record<Size, string> = { S: '4–6', M: '6–8', L: '8–10', XL: '10+' }

export function roomsForSearch(rooms: Room[], search: Search): Room[] {
  return rooms.filter((r) => search.sizes.length === 0 || search.sizes.includes(r.size_class)).sort((a, b) => a.sort - b.sort)
}

export function roomName(r: { name_th: string; name_en: string }, lang: 'th' | 'en'): string {
  return lang === 'th' ? r.name_th : r.name_en
}

/** Each building's colour: old-money blue for Korn Thong, old-money green for Academy. */
export function buildingTone(building: string): 'kt' | 'ac' {
  return building === 'Korn Thong' ? 'kt' : 'ac'
}
