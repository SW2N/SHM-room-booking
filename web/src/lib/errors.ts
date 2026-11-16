import type { Lang } from './dates'

// One Thai and one English message for every error the back end can raise.
const MESSAGES: Record<string, { th: string; en: string }> = {
  NOT_SHM_EMAIL: { th: 'ใช้ได้เฉพาะอีเมล @sahamitproduct.com', en: 'Use your @sahamitproduct.com email.' },
  INVALID_RANGE: { th: 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม', en: 'The end time must be after the start.' },
  NOT_ALIGNED: { th: 'เลือกเวลาเป็นช่วงละ 30 นาที', en: 'Pick times on the hour or half hour.' },
  OUTSIDE_HOURS: { th: 'จองได้ระหว่าง 08:00–20:00 เท่านั้น', en: 'Rooms can be booked from 08:00 to 20:00.' },
  WEEKEND: { th: 'จองวันเสาร์–อาทิตย์ไม่ได้', en: "Weekends can't be booked." },
  HOLIDAY: { th: 'จองวันหยุดไม่ได้', en: "Holidays can't be booked." },
  IN_PAST: { th: 'เวลานี้ผ่านไปแล้ว', en: 'That time has already passed.' },
  TOO_FAR_AHEAD: { th: 'จองล่วงหน้าได้ไม่เกิน 3 เดือน', en: 'You can book up to 3 months ahead.' },
  BANNED: { th: 'ตอนนี้คุณถูกระงับการจองชั่วคราว', en: 'Your booking access is paused for now.' },
  ROOM_TAKEN: { th: 'ห้องนี้ถูกจองแล้วในช่วงเวลานี้', en: 'This room is already booked at that time.' },
  ROOM_HELD: {
    th: 'มีคนกำลังจองห้องนี้อยู่ เลือกเวลาหรือห้องอื่น',
    en: 'Someone is booking this room right now. Pick another time or room.',
  },
  NOT_OWNER: { th: 'ทำได้เฉพาะผู้จองหรือผู้ดูแลเท่านั้น', en: 'Only the person who booked it or an admin can do this.' },
  NOT_ADMIN: { th: 'ทำได้เฉพาะผู้ดูแลเท่านั้น', en: 'Only admins can do this.' },
  NOT_FOUND: { th: 'ไม่พบรายการนี้', en: "That item couldn't be found." },
  NOT_ACTIVE: { th: 'การจองนี้เปลี่ยนแปลงไม่ได้แล้ว', en: "This booking can't be changed anymore." },
  CHECKIN_WINDOW: {
    th: 'เช็กอินได้ในวันที่จอง จนถึง 15 นาทีหลังเวลาเริ่ม',
    en: 'Check in on the day of the booking, up to 15 minutes after it starts.',
  },
  RECIPIENT_NOT_FOUND: { th: 'ไม่พบผู้ใช้ที่มีอีเมลนี้', en: 'No one with that email has an account.' },
  RECIPIENT_BANNED: { th: 'ผู้รับถูกระงับการจองอยู่', en: "That person's booking access is paused." },
  BAD_RULE: { th: 'การตั้งค่าจองซ้ำไม่ถูกต้อง', en: "The repeat settings aren't valid." },
  HOLD_EXPIRED: { th: 'หมดเวลากันห้องแล้ว (30 นาที) ปิดแล้วเปิดแบบฟอร์มใหม่', en: 'Your 30-minute hold ended. Close and open the form again.' },
  NOT_ALLOWED: { th: 'ทำรายการนี้ไม่ได้', en: "You can't do that." },
  'Invalid login credentials': { th: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', en: 'Wrong email or password.' },
  'User already registered': { th: 'อีเมลนี้มีบัญชีแล้ว', en: 'That email already has an account.' },
  // The sign-up trigger refusing a non-SHM address reaches the browser as this generic Auth error.
  'Database error saving new user': { th: 'ใช้ได้เฉพาะอีเมล @sahamitproduct.com', en: 'Use your @sahamitproduct.com email.' },
  'Password should be at least': { th: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', en: 'Use at least 6 characters for your password.' },
}
const GENERIC = { th: 'เกิดข้อผิดพลาด ลองอีกครั้ง', en: 'Something went wrong. Try again.' }

export function errorMessage(e: unknown, lang: Lang): string {
  const text = typeof e === 'string' ? e : (e as { message?: string } | null)?.message ?? ''
  if (MESSAGES[text]) return MESSAGES[text][lang]
  const key = Object.keys(MESSAGES).find((k) => text.includes(k))
  return (key ? MESSAGES[key] : GENERIC)[lang]
}
