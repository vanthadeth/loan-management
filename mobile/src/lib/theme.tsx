import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { prefs } from './device'

// Colour tokens from the web design system (src/styles.css: the final "Palette" and "darker dark theme" blocks).
const light = {
  bg: '#F5F7FA', surface: '#FFFFFF', surface2: '#F0F3F7', track: '#E6E9ED', line: '#E6E9ED', ink: '#434A54', muted: '#656D78',
  accent: '#4A89DC', accentLight: '#5D9CEC', accentInk: '#FFFFFF', accentSoft: '#E6EFFB', accentText: '#3A74C4',
  paid: '#37BC9B', paidSoft: '#DFF6F0', paidText: '#1F8A70', remain: '#CCD1D9', late: '#DA4453', lateSoft: '#FCE8EA',
  warn: '#9A6A00', warnSoft: '#FFF3D2', amber: '#F6BB42', gold: '#9A6A00', silver: '#656D78',
  tGreen: '#EDF8F5', tGreenI: '#2AA386', tOrange: '#FFF1ED', tOrangeI: '#E9573F', tLilac: '#F3F0FB', tLilacI: '#7A62C4', tSky: '#EBF6FC', tSkyI: '#2F9BC7',
  alt: '#434A54', altInk: '#F5F7FA', hero: '#2B3037', logo: '#434A54',
  hair: 'rgba(67,74,84,0.08)', divider: 'rgba(67,74,84,0.2)', glass: 'rgba(255,255,255,0.94)', backdrop: 'rgba(30,35,42,0.46)',
  silverChip: '#DCE3EE', silverChipInk: '#47536A',
}
export type Colors = typeof light

const dark: Colors = {
  ...light,
  bg: '#1B1F24', surface: '#252A31', surface2: '#2D333B', track: '#323943', line: '#363D47', ink: '#F5F7FA', muted: '#A3ACB8',
  accent: '#5D9CEC', accentLight: '#5D9CEC', accentInk: '#1F2530', accentSoft: '#273A52', accentText: '#82B4F3',
  paid: '#48CFAD', paidSoft: '#1F3A36', paidText: '#48CFAD', remain: '#3A424D', late: '#ED5565', lateSoft: '#3B2830',
  warn: '#FFCE54', warnSoft: '#3A3421', amber: '#FFCE54', gold: '#FFCE54', silver: '#AAB2BD',
  tGreen: '#22373A', tGreenI: '#48CFAD', tOrange: '#3A2D2B', tOrangeI: '#FC6E51', tLilac: '#2E2B42', tLilacI: '#AC92EC', tSky: '#233640', tSkyI: '#4FC1E9',
  alt: '#F5F7FA', altInk: '#2B3037', hero: '#0E1115', logo: '#3C434D',
  hair: 'rgba(255,255,255,0.07)', divider: 'rgba(255,255,255,0.18)', glass: 'rgba(37,42,49,0.96)', backdrop: 'rgba(0,0,0,0.55)',
  silverChip: 'rgba(203,213,229,0.22)', silverChipInk: '#D5DDEB',
}

/** Colours used on the dark hero card in both themes. */
export const onHero = {
  ink: '#F5F7FA', muted: 'rgba(245,247,250,0.68)', line: 'rgba(255,255,255,0.16)', soft: 'rgba(255,255,255,0.14)',
  big: '#5D9CEC', paid: '#7FE0B4', late: '#FF9AA6', accent: '#9CC3F5',
}

export const font = {
  regular: 'GoogleSans_400Regular',
  medium: 'GoogleSans_500Medium',
  semi: 'GoogleSans_600SemiBold',
  bold: 'GoogleSans_700Bold',
}

export type ThemePref = 'light' | 'dark' | 'auto'
interface Theme { c: Colors; dark: boolean; pref: ThemePref; setPref: (t: ThemePref) => void }
const Ctx = createContext<Theme>({ c: light, dark: false, pref: 'auto', setPref: () => {} })
export const useTheme = () => useContext(Ctx)
export const useColors = () => useContext(Ctx).c

const readPref = (): ThemePref => {
  const v = prefs.get('theme')
  return v === 'light' || v === 'dark' ? v : 'auto'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme()
  const [pref, setPrefState] = useState<ThemePref>(readPref)
  const setPref = useCallback((t: ThemePref) => { setPrefState(t); prefs.set('theme', t) }, [])
  const isDark = pref === 'dark' || (pref === 'auto' && system === 'dark')
  const value = useMemo(() => ({ c: isDark ? dark : light, dark: isDark, pref, setPref }), [isDark, pref, setPref])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
