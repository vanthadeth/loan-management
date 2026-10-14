import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { lockScroll } from '../lib/lock'
import { fmtD } from '../lib/format'
import { todayIso } from '../lib/calc'

export function Field({ id, label, value, onChange, type = 'text', cls = '', placeholder, inputMode, disabled, children }: {
  id: string; label: string; value: string; onChange?: (v: string) => void; type?: string; cls?: string
  placeholder?: string; inputMode?: 'numeric' | 'decimal' | 'text' | 'tel'; disabled?: boolean; children?: ReactNode
}) {
  return (
    <div className={'field ' + cls}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} value={value} placeholder={placeholder} inputMode={inputMode} disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)} autoComplete="off" />
      {children}
    </div>
  )
}

export function TextArea({ id, label, value, onChange, cls = '' }: { id: string; label: string; value: string; onChange: (v: string) => void; cls?: string }) {
  return (
    <div className={'field ' + cls}>
      <label htmlFor={id}>{label}</label>
      <textarea id={id} value={value} rows={3} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export type Opt = string | { value: string; label: string }
const val = (o: Opt) => (typeof o === 'string' ? o : o.value)
const lab = (o: Opt) => (typeof o === 'string' ? o : o.label)

export function Seg({ id, label, options, value, onChange, cls = '' }: {
  id: string; label?: string; options: Opt[]; value: string; onChange: (v: string) => void; cls?: string
}) {
  return (
    <div className={'field ' + cls}>
      {label && <label id={id + '-l'}>{label}</label>}
      <div className="seg wrapseg" role="group" aria-labelledby={label ? id + '-l' : undefined}>
        {options.map((o) => (
          <button type="button" key={val(o)} aria-pressed={val(o) === value} onClick={() => onChange(val(o))}>{lab(o)}</button>
        ))}
      </div>
    </div>
  )
}

/**
 * A select or date popup that always sits on top of the page: it is drawn in a layer on the body, under an invisible
 * layer that catches outside taps (they only close the popup and never reach the page). The darkening mask is for
 * menus, sheets and dialogs, not for these.
 */
export function Floating({ anchor, onClose, align = 'left', fit = false, children }: {
  anchor: RefObject<HTMLElement | null>; onClose: () => void; align?: 'left' | 'right'; fit?: boolean; children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width?: number; maxHeight: number } | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      const h = box.current?.offsetHeight ?? 0
      if (!a) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const width = fit ? a.width : Math.min(320, vw - 24)
      const left = Math.max(12, Math.min(align === 'right' ? a.right - width : a.left, vw - width - 12))
      const below = vh - a.bottom - 12
      const above = a.top - 12
      const up = h > below && above > below
      const maxHeight = Math.max(160, up ? above : below)
      const top = up ? Math.max(12, a.top - 4 - Math.min(h, maxHeight)) : a.bottom + 4
      setPos({ left, top, width, maxHeight })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [anchor, align, fit])
  useEffect(() => lockScroll(), [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  })
  // React events bubble through portals, so stop them here: a tap outside only closes the popup and never reaches the page under it
  const swallow = (e: { stopPropagation: () => void }) => e.stopPropagation()
  return createPortal(
    <>
      <div className="float-mask clear" onClick={(e) => { e.stopPropagation(); onClose() }} aria-hidden="true" />
      <div ref={box} className="float" onClick={swallow} style={pos ? { left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight } : { visibility: 'hidden' }}>{children}</div>
    </>,
    document.body,
  )
}

export function Dropdown({ id, label, options, value, onChange, cls = '', placeholder }: {
  id: string; label?: string; options: Opt[]; value: string; onChange: (v: string) => void; cls?: string; placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const cur = options.find((o) => val(o) === value)
  return (
    <div className={'field ' + cls}>
      {label && <label id={id + '-l'}>{label}</label>}
      <button type="button" className="dd-btn" ref={ref} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={'ell' + (cur ? '' : ' muted')}>{cur ? lab(cur) : (placeholder ?? 'Select')}</span>
        <svg className="dd-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <Floating anchor={ref} fit onClose={() => setOpen(false)}>
          <div className="dd-list" role="listbox">
            {options.map((o) => (
              <button type="button" role="option" className="dd-opt" key={val(o)} aria-selected={val(o) === value}
                onClick={() => { onChange(val(o)); setOpen(false) }}>{lab(o)}<span className="tick">✓</span></button>
            ))}
          </div>
        </Floating>
      )}
    </div>
  )
}

/** Segmented control for short lists, dropdown for longer ones. */
export function Choice(p: { id: string; label?: string; options: Opt[]; value: string; onChange: (v: string) => void; cls?: string }) {
  const short = p.options.length <= 4 && Math.max(...p.options.map((o) => lab(o).length)) <= 13
  return short ? <Seg {...p} /> : <Dropdown {...p} />
}

const pad = (n: number) => String(n).padStart(2, '0')

function Calendar({ value, onPick }: { value: string; onPick: (iso: string) => void }) {
  const base = value || todayIso()
  const [ym, setYm] = useState<[number, number]>([+base.slice(0, 4), +base.slice(5, 7) - 1])
  const [y, m] = ym
  const off = (new Date(y, m, 1).getDay() + 6) % 7
  const n = new Date(y, m + 1, 0).getDate()
  const today = todayIso()
  const go = (d: number) => { const x = new Date(y, m + d, 1); setYm([x.getFullYear(), x.getMonth()]) }
  const nav = (d: number, l: string, a: string) => <button type="button" className="cnav" aria-label={a} onClick={() => go(d)}>{l}</button>
  return (
    <>
      <div className="cal-head">
        {nav(-12, '«', 'Previous year')}{nav(-1, '‹', 'Previous month')}
        <b className="grow" style={{ textAlign: 'center' }}>{new Date(y, m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b>
        {nav(1, '›', 'Next month')}{nav(12, '»', 'Next year')}
      </div>
      <div className="cal-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span className="dow" key={i}>{d}</span>)}
        {Array.from({ length: off }, (_, i) => <span key={'o' + i} />)}
        {Array.from({ length: n }, (_, i) => {
          const v = `${y}-${pad(m + 1)}-${pad(i + 1)}`
          return <button type="button" key={v} className={'day ' + (v === value ? 'sel ' : '') + (v === today ? 'today' : '')} onClick={() => onPick(v)}>{i + 1}</button>
        })}
      </div>
    </>
  )
}

export function DateField({ id, label, value, onChange, cls = '', allowClear }: {
  id: string; label?: string; value: string; onChange: (iso: string) => void; cls?: string; allowClear?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <div className={'field ' + cls}>
      {label && <label id={id + '-l'}>{label}</label>}
      <button type="button" className="dd-btn" ref={ref} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={value ? '' : 'muted'}>{value ? fmtD(value) : 'Select date'}</span>
        <Icon name="cal" size={16} />
      </button>
      {open && (
        <Floating anchor={ref} onClose={() => setOpen(false)}>
          <div className="cal" role="dialog" aria-label={label ?? 'Pick a date'}>
            <Calendar value={value} onPick={(v) => { onChange(v); setOpen(false) }} />
            {allowClear && value && <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => { onChange(''); setOpen(false) }}>Clear</button>}
          </div>
        </Floating>
      )}
    </div>
  )
}

/** Icon-only date picker used next to search bars. */
export function DateIconPicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <div className="cfpick">
      <button type="button" ref={ref} className={'icon-btn' + (value ? ' on' : '')} aria-label="Pick a date" title="Pick a date" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="cal" />
      </button>
      {open && (
        <Floating anchor={ref} align="right" onClose={() => setOpen(false)}>
          <div className="cal" role="dialog" aria-label="Pick a date"><Calendar value={value} onPick={(v) => { onChange(v); setOpen(false) }} /></div>
        </Floating>
      )}
    </div>
  )
}

