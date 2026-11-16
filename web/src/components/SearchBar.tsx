import { SLOTS } from '../lib/dates'
import { t } from '../lib/i18n'
import { SIZES, SIZE_HINT, type Search } from '../lib/search'
import { useSession } from '../state/session'

export function SearchBar({ search, onChange }: { search: Search; onChange: (s: Search) => void }) {
  const { lang } = useSession()
  const set = (patch: Partial<Search>) => onChange({ ...search, ...patch })
  const ends = SLOTS.filter((s) => !search.start || s > search.start)
  return (
    <section className="searchbar panel" aria-label={t('date', lang)}>
      <label>{t('date', lang)}
        <input type="date" value={search.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
      </label>
      <label>{t('start', lang)}
        <select
          value={search.start ?? ''}
          onChange={(e) => {
            const start = e.target.value || null
            const end = start && (!search.end || search.end <= start) ? SLOTS[SLOTS.indexOf(start) + 2] ?? '20:00' : search.end
            set({ start, end: start ? end : null })
          }}
        >
          <option value="">{t('anyTime', lang)}</option>
          {SLOTS.slice(0, -1).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label>{t('end', lang)}
        <select value={search.end ?? ''} disabled={!search.start} onChange={(e) => set({ end: e.target.value || null })}>
          {!search.start && <option value="">—</option>}
          {ends.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <div className="sizes" role="group" aria-label={t('size', lang)}>
        <span className="muted">{t('size', lang)}</span>
        {SIZES.map((s) => {
          const on = search.sizes.includes(s)
          return (
            <button
              key={s}
              className={on ? 'chip on' : 'chip'}
              aria-pressed={on}
              title={`${SIZE_HINT[s]} ${t('seats', lang)}`}
              onClick={() => set({ sizes: on ? search.sizes.filter((x) => x !== s) : [...search.sizes, s] })}
            >
              {s} <span className="muted">{SIZE_HINT[s]}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
