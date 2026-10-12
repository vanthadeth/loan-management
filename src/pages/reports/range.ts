import { useSyncExternalStore } from 'react'
import { createStore, mondayOf, monthShift } from '../../data/money'
import { addDays, todayIso } from '../../lib/calc'
import { fmtD } from '../../lib/format'

export type Preset = 'week' | 'lweek' | 'month' | 'lmonth' | 'year'
export type Per = Preset | 'range'

export const PRESETS: [Preset, string][] = [
  ['week', 'This week'], ['lweek', 'Last week'], ['month', 'This month'], ['lmonth', 'Last month'], ['year', 'This year'],
]

interface Win { from: string; to: string }

/** Inclusive first and last day of a preset period. */
function presetWindow(k: Preset, today: string): Win {
  const wk = mondayOf(today)
  const first = today.slice(0, 8) + '01'
  switch (k) {
    case 'week': return { from: wk, to: addDays(wk, 6) }
    case 'lweek': return { from: addDays(wk, -7), to: addDays(wk, -1) }
    case 'month': return { from: first, to: addDays(monthShift(first, 1), -1) }
    case 'lmonth': return { from: monthShift(first, -1), to: addDays(first, -1) }
    case 'year': return { from: today.slice(0, 4) + '-01-01', to: today.slice(0, 4) + '-12-31' }
  }
}

/** Only custom dates are stored; presets are worked out from today each time. */
const store = createStore<{ per: Per; from: string; to: string }>({ per: 'month', from: '', to: '' })

export function useReportRange() {
  const s = useSyncExternalStore(store.subscribe, store.get)
  const today = todayIso()
  const win: Win = s.per === 'range' ? { from: s.from, to: s.to } : presetWindow(s.per, today)
  const set = (w: Win) => {
    const hit = PRESETS.find(([k]) => { const p = presetWindow(k, today); return p.from === w.from && p.to === w.to })
    store.set({ per: hit ? hit[0] : 'range', ...w })
  }
  const name = PRESETS.find(([k]) => k === s.per)?.[1] ?? 'Selected dates'
  return {
    per: s.per,
    from: win.from,
    to: win.to,
    label: name + (win.from && win.to ? ` · ${fmtD(win.from)} – ${fmtD(win.to)}` : ''),
    inRange: (iso: string) => iso >= win.from && iso <= win.to,
    setFrom: (from: string) => set({ from, to: win.to }),
    setTo: (to: string) => set({ from: win.from, to }),
    setPer: (per: Per) => (per === 'range' ? store.set({ per, ...win }) : store.set({ per, from: '', to: '' })),
  }
}
