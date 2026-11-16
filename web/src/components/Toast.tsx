import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

const Ctx = createContext<(msg: string, kind?: 'ok' | 'error') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'error'; id: number } | null>(null)
  const show = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now()
    setToast({ msg, kind, id })
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), kind === 'error' ? 6000 : 3000)
  }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast ${toast.kind}`} role="status">
          {toast.msg}
        </div>
      )}
    </Ctx.Provider>
  )
}

export function useToast() {
  return useContext(Ctx)
}
