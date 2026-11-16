import { useRef } from 'react'
import { type DateOpts, formatDate } from '../lib/dates'

/**
 * A date box that shows the date in the person's chosen format (the browser's own date box always uses the
 * browser's format). Clicking it opens the normal date picker; the real date input sits invisibly on top.
 */
export function DateField({ label, value, opts, onChange, disabled, min, hideLabel, invalid }: {
  label: string
  value: string
  opts: DateOpts
  onChange: (date: string) => void
  disabled?: boolean
  min?: string
  /** For a table cell: the label is read out but not shown. */
  hideLabel?: boolean
  invalid?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <label className="datefield">
      {hideLabel ? <span className="sr-only">{label}</span> : label}
      <span className={`datefield-box${disabled ? ' disabled' : ''}${invalid ? ' invalid' : ''}`}>
        <span aria-hidden="true">{value ? formatDate(value, opts) : '—'}</span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
        </svg>
        <input
          ref={input}
          type="date"
          aria-label={label}
          aria-invalid={invalid || undefined}
          value={value}
          min={min}
          disabled={disabled}
          onClick={() => { try { input.current?.showPicker?.() } catch { /* the browser opens its own picker */ } }}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      </span>
    </label>
  )
}
