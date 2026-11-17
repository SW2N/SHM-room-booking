import { useEffect, type ReactNode } from 'react'

export function Modal({ open, title, onClose, children, wide }: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** true: medium width; 'extra': for wide tables such as the admin panel. */
  wide?: boolean | 'extra'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide === 'extra' ? 'modal extra-wide' : wide ? 'modal wide' : 'modal'} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon" aria-label="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
