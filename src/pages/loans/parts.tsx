import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../ui/Icon'
import { useI18n } from '../../app/i18n'
import { bname } from '../../data/borrowers'
import { fmt, loanCode } from '../../lib/format'
import type { InstallmentStatus } from '../../lib/calc'
import type { LoanView } from '../../data/book'

export function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="row">
      <input ref={ref} className="search" placeholder={t('search')} value={value} aria-label="Search" onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="icon-btn srch" aria-label="Search" onClick={() => { ref.current?.focus(); ref.current?.select() }}><Icon name="search" /></button>
    </div>
  )
}

/** One segment per installment: paid, overdue or still to come. */
export function Bar({ rows, flagLate, mini }: { rows: InstallmentStatus[]; flagLate: boolean; mini?: boolean }) {
  return (
    <div className={'bar' + (mini ? ' mini' : '')}>
      {rows.map((r) => <i key={r.i} className={r.state === 'paid' ? 'p' : flagLate && r.state === 'overdue' ? 'o' : ''} />)}
    </div>
  )
}

export function Ring({ p, size = 56, color = 'var(--accent)', stroke = 7 }: { p: number; size?: number; color?: string; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const h = size / 2
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${p}%`}>
      <circle cx={h} cy={h} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
      <circle cx={h} cy={h} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * p) / 100} ${c}`} transform={`rotate(-90 ${h} ${h})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" style={{ fontSize: size < 50 ? 11 : 13, fontWeight: 700, fill: 'var(--ink)', fontFamily: 'var(--body)' }}>{p}%</text>
    </svg>
  )
}

/** Compact money for the list rows: 1.5M riel, $500. */
const compact = (n: number, c: 'KHR' | 'USD') => (c === 'USD' ? '$' + Math.round(n) : (Math.round(n / 1e4) / 100).toString() + 'M')

/** A loan in a list: borrower, amount, progress bar and status chips. */
export function LoanRow({ v, doneLabel }: { v: LoanView; doneLabel?: string }) {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const { loan, status, done, borrower } = v
  const approved = loan.status === 'approved'
  const late = approved && !done && status.rows.some((r) => r.state === 'overdue')
  const label = done ? (doneLabel ?? 'Completed') : loan.status === 'rejected' ? 'Rejected' : t(loan.status)
  const kind = done ? 'approved' : loan.status === 'rejected' ? 'overdue' : loan.status
  return (
    <button type="button" className="item" onClick={() => nav(`/loans/${loan.id}`)}>
      <span className="grow">
        <span className="row between"><b className="ell">{bname(borrower, lang)}</b><b className="num">{fmt(loan.amount, loan.currency)}</b></span>
        <span className="row between small muted" style={{ margin: '2px 0 7px' }}>
          <span>{loanCode(loan.id)} · {compact(status.collected, loan.currency)} / {compact(status.total, loan.currency)}</span>
          <span><span className={'chip ' + kind}>{label}</span> {late && <span className="chip overdue">{t('overdue')}</span>}</span>
        </span>
        <span className="row" style={{ gap: 8 }}>
          <span className="grow"><Bar rows={status.rows} flagLate={approved} mini /></span>
          <b className="small num">{Math.round((status.paidCount / loan.occurrences) * 100)}%</b>
        </span>
      </span>
    </button>
  )
}
