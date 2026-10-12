import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { messages, type MsgKey } from '../lib/messages'

export type Lang = 'en' | 'km'
interface I18n { lang: Lang; setLang: (l: Lang) => void; t: (k: MsgKey | string) => string }
const Ctx = createContext<I18n>({ lang: 'en', setLang: () => {}, t: (k) => k })
export const useI18n = () => useContext(Ctx)

const read = <T extends string>(key: string, ok: readonly T[], dflt: T): T => {
  try { const v = localStorage.getItem(key) as T | null; return v && ok.includes(v) ? v : dflt } catch { return dflt }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => read('lang', ['en', 'km'], 'en'))
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem('lang', l) } catch { /* private mode */ }
  }, [])
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  const value = useMemo<I18n>(() => ({
    lang, setLang,
    t: (k) => ((messages[lang] as Record<string, string>)[k] ?? (messages.en as Record<string, string>)[k] ?? k),
  }), [lang, setLang])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export type Theme = 'light' | 'dark' | 'auto'
export function applyTheme(t: Theme) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.dataset.theme = t
  try { localStorage.setItem('theme', t) } catch { /* private mode */ }
}
export const savedTheme = (): Theme => read('theme', ['light', 'dark', 'auto'], 'auto')
