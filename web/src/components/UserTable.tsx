import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readSheet } from 'read-excel-file/browser'
import writeXlsxFile from 'write-excel-file/browser'
import { handOver, saveStaff, staffList, upcomingBookingsOf, type Booking } from '../lib/api'
import { bkkDate, bkkTime, formatDate } from '../lib/dates'
import { DEPARTMENTS } from '../lib/departments'
import { errorMessage } from '../lib/errors'
import { t } from '../lib/i18n'
import { diffStaff, fromStaff, mergeStaff, newStaffRow, normEmail, sheetToStaff, staffErrors, type StaffEntry, type StaffInput, type StaffRow } from '../lib/staffSheet'
import { useData } from '../state/data'
import { useSession } from '../state/session'
import { Modal } from './Modal'
import { useToast } from './Toast'

type Review = { person: StaffRow; bookings: Booking[] }[]

/**
 * The staff list as an editable table (Admin → Users): who may sign up, with their name, department, role and
 * status. Edit cells, add rows, or upload an Excel file (merged by email; nobody is removed). Saving a change
 * from active to disabled first shows that person's upcoming bookings so some can be handed over.
 */
export function UserTable() {
  const { lang, opts, profile } = useSession()
  const { reload } = useData()
  const toast = useToast()
  const [original, setOriginal] = useState<StaffEntry[]>([])
  const [rows, setRows] = useState<StaffRow[]>([])
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [note, setNote] = useState<{ text: string; warn?: boolean }[]>([])
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState<Review | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const me = profile?.email?.toLowerCase()

  // Load when the panel opens and after a save, never on a re-render: that would wipe unsaved edits.
  const notify = useRef({ toast, lang })
  notify.current = { toast, lang }
  const load = useCallback(async () => {
    try {
      const list = await staffList()
      setOriginal(list)
      setRows(fromStaff(list))
    } catch (e) {
      notify.current.toast(errorMessage(e, notify.current.lang), 'error')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const diff = useMemo(() => diffStaff(original, rows), [original, rows])
  const errors = useMemo(() => staffErrors(rows), [rows])
  const dirty = diff.saves.length > 0
  const hasErrors = Object.keys(errors).length > 0
  const edit = (key: string, patch: Partial<StaffRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const shown = rows.filter((r) => {
    const s = q.trim().toLowerCase()
    return (!s || r.email.toLowerCase().includes(s) || r.display_name.toLowerCase().includes(s))
      && (!dept || r.department === dept) && (!role || r.role === role)
      && (!status || (status === 'active') === r.active)
  })

  async function upload(f: File | undefined) {
    if (!f) return
    try {
      const { rows: incoming, bad } = sheetToStaff((await readSheet(f)) as unknown[][])
      const m = mergeStaff(rows, incoming)
      setRows(m.rows)
      setNote([
        { text: t('usersRead', lang).replace('{a}', String(m.added)).replace('{c}', String(m.changed)) },
        ...(bad.length ? [{ text: t('usersBad', lang).replace('{rows}', bad.join(', ')), warn: true }] : []),
      ])
    } catch {
      setNote([{ text: t('uploadFailed', lang), warn: true }])
    } finally {
      if (file.current) file.current.value = ''
    }
  }

  async function download() {
    const head = ['Email', 'Name / ชื่อ', 'Department / แผนก', 'Role / สิทธิ์', 'Status / สถานะ', 'Account / บัญชี', 'Last sign-in', 'Upcoming bookings']
    const data = original.map((s) => [
      { value: s.email }, { value: s.display_name }, { value: s.department },
      { value: s.role === 'admin' ? 'Admin' : 'Staff' }, { value: s.active ? 'Active' : 'Disabled' },
      { value: s.has_account ? 'Signed up' : 'Not yet' },
      s.last_sign_in ? { type: Date, value: new Date(s.last_sign_in), format: 'd/m/yyyy' } : { value: '' },
      { type: Number, value: s.upcoming },
    ])
    await writeXlsxFile([head.map((value) => ({ value, fontWeight: 'bold' })), ...data] as never, {
      columns: [{ width: 34 }, { width: 26 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 13 }, { width: 10 }],
    }).toFile('SHM-staff-list.xlsx')
  }

  // Save: if anyone is being disabled and has upcoming bookings, review those first.
  async function save() {
    setBusy(true)
    try {
      const list: Review = []
      for (const email of diff.disabling) {
        const person = rows.find((r) => normEmail(r.email) === email)!
        const id = person.orig?.user_id
        const bookings = id ? await upcomingBookingsOf(id) : []
        if (bookings.length) list.push({ person, bookings })
      }
      if (list.length) return setReview(list)
      await commit(diff.saves)
    } catch (e) {
      toast(errorMessage(e, lang), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function commit(saves: StaffInput[]) {
    await saveStaff(saves)
    setNote([])
    await load()
    await reload()
    toast(t('saved', lang))
  }

  return (
    <section className="form">
      <div className="tl-top">
        <h3>{t('users', lang)}</h3>
        <div className="row">
          <label className="button-like">
            {t('uploadExcel', lang)}
            <input ref={file} type="file" accept=".xlsx" aria-label={t('uploadExcel', lang)} className="sr-only"
              onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
          <button onClick={() => void download()}>{t('downloadExcel', lang)}</button>
        </div>
      </div>
      <p className="muted small">{t('usersHint', lang)}</p>
      <div className="filters">
        <input type="search" placeholder={t('searchPeople', lang)} aria-label={t('searchPeople', lang)} value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label={t('filterDept', lang)} value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">{t('allDepts', lang)}</option>
          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select aria-label={t('filterRole', lang)} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">{t('allRoles', lang)}</option>
          <option value="user">{t('roleUser', lang)}</option>
          <option value="admin">{t('roleAdmin', lang)}</option>
        </select>
        <select aria-label={t('filterStatus', lang)} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('allStatuses', lang)}</option>
          <option value="active">{t('statusActive', lang)}</option>
          <option value="disabled">{t('statusDisabled', lang)}</option>
        </select>
        <span className="muted small">{shown.length} / {rows.length}</span>
      </div>
      {note.map((n) => <p key={n.text} className={n.warn ? 'error small' : 'note small'} role={n.warn ? 'alert' : 'status'}>{n.text}</p>)}
      <div className="sheet-scroll">
        <table className="sheet users">
          <thead>
            <tr>
              <th>{t('email', lang)}</th><th>{t('colName', lang)}</th><th>{t('department', lang)}</th><th>{t('colRole', lang)}</th>
              <th>{t('colStatus', lang)}</th><th>{t('colAccount', lang)}</th><th>{t('colLastSignIn', lang)}</th><th>{t('colUpcoming', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const err = errors[r.key]
              const self = normEmail(r.email) === me
              const changed = !r.orig || diff.saves.some((s) => s.email === normEmail(r.email))
              return (
                <tr key={r.key} className={`${changed ? 'changed' : ''}${r.active ? '' : ' off'}`}>
                  <td>
                    {r.orig ? <span className="cell-text">{r.email}</span> : (
                      <input type="email" aria-label={t('email', lang)} placeholder="name@sahamitproduct.com" value={r.email}
                        aria-invalid={err === 'BAD_EMAIL' || err === 'DUPLICATE_EMAIL' || undefined} onChange={(e) => edit(r.key, { email: e.target.value })} />
                    )}
                    {err && <span className="cell-error">{t(err, lang)}</span>}
                  </td>
                  <td><input aria-label={t('colName', lang)} value={r.display_name} aria-invalid={err === 'STAFF_NAME_REQUIRED' || undefined}
                    onChange={(e) => edit(r.key, { display_name: e.target.value })} /></td>
                  <td>
                    <select aria-label={t('department', lang)} value={r.department} onChange={(e) => edit(r.key, { department: e.target.value })}>
                      {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </td>
                  <td>
                    <select aria-label={t('colRole', lang)} value={r.role} disabled={self} title={self ? errorMessage('CANNOT_CHANGE_SELF', lang) : undefined}
                      onChange={(e) => edit(r.key, { role: e.target.value as 'user' | 'admin' })}>
                      <option value="user">{t('roleUser', lang)}</option>
                      <option value="admin">{t('roleAdmin', lang)}</option>
                    </select>
                  </td>
                  <td>
                    <select aria-label={t('colStatus', lang)} value={r.active ? 'active' : 'disabled'} disabled={self}
                      onChange={(e) => edit(r.key, { active: e.target.value === 'active' })}>
                      <option value="active">{t('statusActive', lang)}</option>
                      <option value="disabled">{t('statusDisabled', lang)}</option>
                    </select>
                  </td>
                  <td className="muted">
                    {r.orig?.has_account ? t('signedUp', lang) : t('notYet', lang)}
                    {r.orig?.paused_until && <span className="cell-error">{t('banUntil', lang)} {bkkTime(r.orig.paused_until)}</span>}
                  </td>
                  <td className="muted">{r.orig?.last_sign_in ? formatDate(bkkDate(r.orig.last_sign_in), opts) : '–'}</td>
                  <td className="muted num">{r.orig?.has_account ? r.orig.upcoming : '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="sheet-foot">
        <button onClick={() => setRows((rs) => [...rs, newStaffRow()])}>{t('addRow', lang)}</button>
        <span className="muted small">{dirty ? t('unsaved', lang).replace('{n}', String(diff.saves.length)) : ''}</span>
        <button disabled={!dirty || busy} onClick={() => { setRows(fromStaff(original)); setNote([]) }}>{t('discard', lang)}</button>
        <button className="primary" disabled={!dirty || hasErrors || busy} onClick={() => void save()}>{t('saveChanges', lang)}</button>
      </div>
      {review && (
        <DisableReview review={review} onCancel={() => setReview(null)}
          onConfirm={async (handTo, ids) => {
            setBusy(true)
            try {
              for (const id of ids) await handOver(id, false, handTo)
              await commit(diff.saves)
              setReview(null)
            } catch (e) {
              toast(errorMessage(e, lang), 'error')
            } finally {
              setBusy(false)
            }
          }} />
      )}
    </section>
  )
}

/** Before disabling people: their upcoming bookings, to tick the ones a colleague should take over. */
function DisableReview({ review, onCancel, onConfirm }: {
  review: Review
  onCancel: () => void
  onConfirm: (handTo: string, bookingIds: string[]) => Promise<void>
}) {
  const { lang, opts } = useSession()
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const names = review.map((r) => r.person.display_name).join(', ')
  const needsEmail = ticked.size > 0 && !to.trim()
  return (
    <Modal open wide title={`${t('beforeDisabling', lang)}: ${names}`} onClose={onCancel}>
      <p className="muted small">{t('disableHint', lang)}</p>
      {review.map(({ person, bookings }) => (
        <section key={person.key}>
          <div className="mine-day-head">
            <h4>{person.display_name} · {person.email}</h4>
            <button className="link" onClick={() => setTicked((s) => {
              const n = new Set(s)
              const all = bookings.every((b) => n.has(b.id))
              for (const b of bookings) if (all) n.delete(b.id); else n.add(b.id)
              return n
            })}>{bookings.every((b) => ticked.has(b.id)) ? t('untickAll', lang) : t('tickAll', lang)}</button>
          </div>
          <ul className="plain review-list">
            {bookings.map((b) => (
              <li key={b.id}>
                <label className="inline">
                  <input type="checkbox" checked={ticked.has(b.id)}
                    onChange={(e) => setTicked((s) => { const n = new Set(s); if (e.target.checked) n.add(b.id); else n.delete(b.id); return n })} />
                  <span><b>{b.title}</b> <span className="muted small">· {formatDate(bkkDate(b.starts_at), opts)} {bkkTime(b.starts_at)}–{bkkTime(b.ends_at)} · {lang === 'th' ? b.room_name_th : b.room_name_en}</span></span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <label>{t('handTickedTo', lang)}
        <input type="email" placeholder="name@sahamitproduct.com" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <p className="muted small">{t('untickedCancelled', lang)}</p>
      <div className="actions">
        <button onClick={onCancel}>{t('cancel', lang)}</button>
        <button className="danger" disabled={busy || needsEmail}
          onClick={async () => { setBusy(true); await onConfirm(to.trim(), [...ticked]); setBusy(false) }}>{t('disableAndSave', lang)}</button>
      </div>
    </Modal>
  )
}
