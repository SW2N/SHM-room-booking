import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DateField } from './DateField'

afterEach(cleanup)

describe('DateField', () => {
  const opts = { lang: 'th' as const, year: 'BE' as const, format: 'long' as const }
  it('shows the date in the chosen format, not the browser’s', () => {
    render(<DateField label="วันที่" value="1998-04-07" opts={opts} onChange={() => {}} />)
    expect(screen.getByText('7-เม.ย.-41')).toBeTruthy()
  })
  it('passes a picked date on', () => {
    const onChange = vi.fn()
    render(<DateField label="วันที่" value="1998-04-07" opts={opts} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('วันที่'), { target: { value: '1998-04-08' } })
    expect(onChange).toHaveBeenCalledWith('1998-04-08')
  })
})
