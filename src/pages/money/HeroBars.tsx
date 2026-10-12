import { useState } from 'react'
import { Icon } from '../../ui/Icon'
import { maskMoney, periodLabel, periodRange, type Period, type Unit } from '../../data/money'
import type { Currency } from '../../lib/calc'

const UNITS: [Unit, string][] = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']]
const BASE = 88
const H = 66
const STEP = 48
const BW = 28

const wide = () => typeof matchMedia === 'function' && matchMedia('(min-width:1100px)').matches

/** Collected and expected cash for 3 periods back to 3 ahead, with the selected period's figures below. */
export function HeroBars({ periods, unit, onUnit, sel, onSel, cur, hide }: {
  periods: Period[]; unit: Unit; onUnit: (u: Unit) => void; sel: number; onSel: (k: number) => void; cur: Currency; hide: boolean
}) {
  const [open, setOpen] = useState(wide)
  const mx = Math.max(...periods.map((q) => q.c + q.x), 1)
  const compact = (v: number) => (cur === 'KHR' ? Math.round(v / 1e5) / 10 + 'M' : '$' + Math.round(v))
  const m = (n: number) => maskMoney(n, cur, hide)
  const sp = periods[sel]
  const sign = (n: number, s: string) => (n ? s + m(n) : '—')
  return (
    <>
      <div className="hseg row between">
        <span className="small hsub">Collected and expected</span>
        <div className="seg" role="group" aria-label="Bar size">
          {UNITS.map(([k, n]) => <button key={k} aria-pressed={unit === k} onClick={() => onUnit(k)}>{n}</button>)}
        </div>
      </div>
      <svg className="hbars" viewBox="0 0 342 118" role="group" aria-label="Collected and expected cash, 3 periods back to 3 ahead">
        <line x1="4" x2="338" y1={BASE + 0.5} y2={BASE + 0.5} stroke="currentColor" opacity=".3" />
        {periods.map((q, k) => {
          const x = 3 + k * STEP + (STEP - BW) / 2
          const hc = (q.c / mx) * H
          const hx = (q.x / mx) * H
          const tot = q.c + q.x
          const now = k === 3
          return (
            <g key={k} style={{ cursor: 'pointer' }} role="button" tabIndex={0} aria-label={periodRange(q, unit)} aria-pressed={k === sel}
              onClick={() => onSel(k)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSel(k) } }}>
              <rect x={3 + k * STEP + 1} y="2" width={STEP - 2} height="116" rx="10" fill="none" stroke="currentColor" strokeWidth="1"
                strokeDasharray="3 7" strokeLinecap="round" opacity={k === sel ? 0.38 : 0} />
              {hx > 0 && <rect x={x} y={BASE - hc - hx} width={BW} height={hx + (hc ? 4 : 0)} rx="6" fill="currentColor" opacity=".42" />}
              {hc > 0 && <rect x={x} y={BASE - hc} width={BW} height={hc} rx="6" fill="currentColor" />}
              {!tot
                ? <rect x={x} y={BASE - 3} width={BW} height="3" rx="1.5" fill="currentColor" opacity=".35" />
                : <text x={x + BW / 2} y={BASE - hc - hx - 4} textAnchor="middle" style={{ fontSize: 10, fontWeight: 600, fill: 'currentColor' }}>{hide ? '' : compact(tot)}</text>}
              <text x={x + BW / 2} y="101" textAnchor="middle" style={{ fontSize: 10, fill: 'currentColor', fontWeight: now ? 700 : 400 }}>{periodLabel(q, unit)}</text>
              {now && <text x={x + BW / 2} y="112" textAnchor="middle" style={{ fontSize: 9, fill: 'currentColor', fontWeight: 700 }}>now</text>}
            </g>
          )
        })}
      </svg>
      <details className="hsum" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          <span className="row between"><b>{periodRange(sp, unit)}</b><span className="row" style={{ gap: 8 }}><Icon name="chev" size={16} /></span></span>
          <span className="sbal"><span className="small muted">Balance</span><b className="num">{m(sp.balance)}</b></span>
        </summary>
        <table className="num sumt">
          <tbody>
            <tr><td>Fund available</td><td className="r">{m(sp.open)}</td></tr>
            <tr><td>Fund added</td><td className={'r ' + (sp.add ? 'in' : '')}>{sign(sp.add, '+')}</td></tr>
            <tr><td>Fund withdrawn</td><td className={'r ' + (sp.withdraw ? 'out' : '')}>{sign(sp.withdraw, '−')}</td></tr>
            <tr><td>Loan given</td><td className={'r ' + (sp.loan ? 'out' : '')}>{sign(sp.loan, '−')}</td></tr>
            <tr className="sub"><td>Loan amount</td><td className="r">{sp.gross ? m(sp.gross) : '—'}</td></tr>
            <tr className="sub"><td>Service fee (deducted)</td><td className="r">{sp.gross ? '−' + m(sp.fee) : '—'}</td></tr>
            <tr><td>Collect</td><td className="r in">+{m(sp.col)}</td></tr>
            <tr className="sub"><td>Principal collected</td><td className="r">{m(sp.principal)}</td></tr>
            <tr className="sub"><td>Interest earned</td><td className="r">{m(sp.interest)}</td></tr>
            <tr className="sub"><td>Late fees</td><td className="r">{m(sp.lateFees)}</td></tr>
            <tr className="sum"><td>Balance</td><td className="r">{m(sp.balance)}</td></tr>
          </tbody>
        </table>
        <div className="cnts">
          <div><b className="num">{sp.count}</b><span><Icon name="coin" size={16} />Collection</span></div>
          <div><b className="num">{sp.borrowers}</b><span><Icon name="users" size={16} />Borrower</span></div>
          <div><b className="num">{sp.newLoans}</b><span><Icon name="loan" size={16} />New loan</span></div>
        </div>
      </details>
    </>
  )
}
