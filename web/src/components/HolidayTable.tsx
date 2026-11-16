import { useEffect, useMemo, useRef, useState } from 'react'
import { readSheet } from 'read-excel-file/browser'
import writeXlsxFile from 'write-excel-file/browser'
import { saveHolidays } from '../lib/api'
import { todayBkk } from '../lib/dates'
import { errorMessage } from '../lib/errors'
import { diffHolidays, fromHolidays, type HolidayRow, mergeRows, newRow, sheetToRows, tableErrors } from '../lib/holidaySheet'
import { t } from '../lib/i18n'
import { useData } from '../state/data'
import { useSession } from '../state/session'
import { DateField } from './DateField'
import { useToast } from './Toast'

/**
 * Holidays as an editable table: change cells, add or remove rows, or upload an Excel file (merged in by
 * date). Nothing is written until "Save changes"; Download gives the current list as an Excel file to edit.
 */
export function HolidayTable() {
  const { lang, opts } = useSession()
  const { holidays, reload } = useData()
  const toast = useToast()
  // One year at a time. Starts on this year, or the next year that has holidays listed.
  const thisYear = Number(todayBkk().slice(0, 4))
  const years = useMemo(() => {
    const ys = new Set([thisYear, thisYear + 1, ...holidays.map((h) => Number(h.day.slice(0, 4)))])
    return [...ys].sort((a, b) => a - b)
  }, [holidays, thisYear])
  const [year, setYear] = useState(() => {
    const listed = holidays.map((h) => Number(h.day.slice(0, 4))).filter((y) => y >= thisYear).sort((a, b) => a - b)
    return listed.includes(thisYear) || !listed.length ? thisYear : listed[0]
  })
  // Keyed by content, so a refetch with the same holidays doesn't count as a change.
  const originalKey = JSON.stringify(holidays.filter((h) => h.day.startsWith(`${year}-`)))
  const original = useMemo(() => JSON.parse(originalKey) as typeof holidays, [originalKey])
  const [rows, setRows] = useState<HolidayRow[]>(() => fromHolidays(original))
  const [note, setNote] = useState<{ text: string; warn?: boolean }[]>([])
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const diff = useMemo(() => diffHolidays(original, rows), [original, rows])
  const errors = useMemo(() => tableErrors(rows), [rows])
  const pending = diff.upserts.length + diff.deletes.length
  const dirty = pending > 0

  // Fresh data from the server (after a save, or someone else's change) replaces the table when nothing is unsaved.
  useEffect(() => {
    if (!dirty) setRows(fromHolidays(original))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original])

  // Changing the year shows that year's list (only allowed with nothing unsaved).
  useEffect(() => {
    setRows(fromHolidays(original))
    setNote([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  const edit = (key: string, patch: Partial<HolidayRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  async function upload(f: File | undefined) {
    if (!f) return
    try {
      const data = await readSheet(f)
      const { rows: incoming, bad } = sheetToRows(data as unknown[][])
      const merged = mergeRows(rows, incoming)
      setRows(merged.rows)
      setNote([
        { text: t('uploadRead', lang).replace('{a}', String(merged.added)).replace('{c}', String(merged.changed)) },
        ...(bad.length ? [{ text: t('uploadBad', lang).replace('{rows}', bad.join(', ')), warn: true }] : []),
      ])
    } catch {
      setNote([{ text: t('uploadFailed', lang), warn: true }])
    } finally {
      if (file.current) file.current.value = ''
    }
  }

  async function download() {
    const header = [{ value: 'Date / วันที่' }, { value: 'Thai name / ชื่อไทย' }, { value: 'English name / ชื่ออังกฤษ' }]
    const data = original.map((h) => [
      { type: Date, value: new Date(`${h.day}T00:00:00Z`), format: 'd/m/yyyy' },
      { value: h.name_th },
      { value: h.name_en ?? '' },
    ])
    await writeXlsxFile([header, ...data] as never, { columns: [{ width: 14 }, { width: 36 }, { width: 36 }] }).toFile(`SHM-holidays-${opts.year === 'BE' ? year + 543 : year}.xlsx`)
  }

  async function save() {
    setBusy(true)
    try {
      await saveHolidays(diff)
      setNote([])
      await reload()
      toast(t('saved', lang))
    } catch (e) {
      toast(errorMessage(e, lang), 'error')
    } finally {
      setBusy(false)
    }
  }

  const hasErrors = Object.keys(errors).length > 0
  return (
    <section className="form">
      <div className="tl-top">
        <h3>{t('holidays', lang)}</h3>
        <div className="row">
          <label className="inline">{t('year', lang)}
            <select value={year} disabled={dirty} title={dirty ? t('saveFirst', lang) : undefined} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{opts.year === 'BE' ? y + 543 : y}</option>)}
            </select>
          </label>
          <label className="button-like">
            {t('uploadExcel', lang)}
            <input ref={file} type="file" accept=".xlsx" aria-label={t('uploadExcel', lang)} className="sr-only"
              onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
          <button onClick={() => void download()}>{t('downloadExcel', lang)}</button>
        </div>
      </div>
      <p className="muted small">{t('holidaysHint', lang)}</p>
      {note.map((n) => <p key={n.text} className={n.warn ? 'error small' : 'note small'} role={n.warn ? 'alert' : 'status'}>{n.text}</p>)}
      <div className="sheet-scroll">
        <table className="sheet">
          <thead>
            <tr><th>{t('date', lang)}</th><th>{t('nameTh', lang)}</th><th>{t('nameEn', lang)}</th><th aria-label={t('removeRow', lang)} /></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const err = errors[r.key]
              const changed = !r.orig || diff.upserts.some((u) => u.day === r.day)
              return (
                <tr key={r.key} className={changed ? 'changed' : undefined}>
                  <td>
                    <DateField label={t('date', lang)} hideLabel value={r.day} opts={opts} invalid={err === 'DATE_REQUIRED' || err === 'DUPLICATE_DATE'}
                      onChange={(day) => edit(r.key, { day })} />
                  </td>
                  <td>
                    <input aria-label={t('nameTh', lang)} value={r.name_th} aria-invalid={err === 'NAME_REQUIRED' || undefined}
                      onChange={(e) => edit(r.key, { name_th: e.target.value })} />
                    {err && <span className="cell-error">{t(err, lang)}</span>}
                  </td>
                  <td><input aria-label={t('nameEn', lang)} value={r.name_en} onChange={(e) => edit(r.key, { name_en: e.target.value })} /></td>
                  <td>
                    <button className="link danger-link" aria-label={t('removeRow', lang)} title={t('removeRow', lang)}
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="sheet-foot">
        <button onClick={() => setRows((rs) => [...rs, newRow()])}>{t('addRow', lang)}</button>
        <span className="muted small">{dirty ? t('unsaved', lang).replace('{n}', String(pending)) : ''}</span>
        <button disabled={!dirty || busy} onClick={() => { setRows(fromHolidays(original)); setNote([]) }}>{t('discard', lang)}</button>
        <button className="primary" disabled={!dirty || hasErrors || busy} onClick={() => void save()}>{t('saveChanges', lang)}</button>
      </div>
    </section>
  )
}
