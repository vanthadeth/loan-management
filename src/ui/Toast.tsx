import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

const Ctx = createContext<(m: string) => void>(() => {})
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; m: string; out: boolean }[]>([])
  const push = useCallback((m: string) => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s, { id, m, out: false }])
    setTimeout(() => setItems((s) => s.map((x) => (x.id === id ? { ...x, out: true } : x))), 2400)
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 2700)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      {items.map((x) => (
        <div key={x.id} className={'toast' + (x.out ? ' out' : '')} role="status">{x.m}</div>
      ))}
    </Ctx.Provider>
  )
}
