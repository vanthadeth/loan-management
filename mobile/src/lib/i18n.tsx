import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { messages, type MsgKey } from '@shared/lib/messages'
import { prefs } from './device'

export type Lang = 'en' | 'km'
interface I18n { lang: Lang; setLang: (l: Lang) => void; t: (k: MsgKey | string) => string }
const Ctx = createContext<I18n>({ lang: 'en', setLang: () => {}, t: (k) => k })
export const useI18n = () => useContext(Ctx)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (prefs.get('lang') === 'km' ? 'km' : 'en'))
  const setLang = useCallback((l: Lang) => { setLangState(l); prefs.set('lang', l) }, [])
  const value = useMemo<I18n>(() => ({
    lang, setLang,
    t: (k) => ((messages[lang] as Record<string, string>)[k] ?? (messages.en as Record<string, string>)[k] ?? k),
  }), [lang, setLang])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
