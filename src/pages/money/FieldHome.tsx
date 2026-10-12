import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../ui/Icon'
import { useAuth } from '../../app/auth'
import { useI18n } from '../../app/i18n'
import { dn } from '../../data/core'
import { addDays } from '../../lib/calc'
import { fmt, fmtD, loanCode } from '../../lib/format'
import { borrowerName, CURRENCIES, dashFigures, dueParts, maskMoney, openLoans, useCurrency, useHideAmounts, useMoneyData } from '../../data/money'
import { Ring } from '../loans/parts'

/**
 * Home for supervisors and collectors: only the loans they can see, their own totals, how much of today's
 * round is collected, and the stops to visit with a one-tap Record payment.
 */
export function FieldHome() {
  const { lang } = useI18n()
  const { can, me } = useAuth()
  const nav = useNavigate()
  const data = useMoneyData()
  const [cur, setCur] = useCurrency()
  const [hide, toggleHide] = useHideAmounts()
  const m = (n: number) => maskMoney(n, cur, hide)
  const collector = !can('loans.create')
  const fig = useMemo(() => dashFigures(data, cur), [data, cur])
  const open = useMemo(() => openLoans(data, cur), [data, cur])
  const weekEnd = addDays(data.today, 7)

  const stops = useMemo(() => {
    const out = open.flatMap((v) =>
      v.status.rows.filter((r) => r.state !== 'paid' && r.due <= weekEnd).map((r) => ({ v, r, owed: dueParts(r).remaining, late: r.state === 'overdue' || r.due < data.today })))
    return out.sort((a, b) => (a.late !== b.late ? (a.late ? -1 : 1) : a.r.due < b.r.due ? -1 : a.r.due > b.r.due ? 1 : 0))
  }, [open, weekEnd, data.today])

  const lateCount = stops.filter((x) => x.late).length
  const dueNow = stops.filter((x) => x.r.due <= data.today).reduce((s, x) => s + x.owed, 0)
  const paidToday = open.reduce((s, v) => s + v.payments.filter((p) => p.paid_on === data.today).reduce((t, p) => t + p.amount, 0), 0)
  const pct = paidToday + dueNow > 0 ? Math.round((paidToday / (paidToday + dueNow)) * 100) : 0
  const month = data.today.slice(0, 7)
  const thisMonth = open.reduce((s, v) => s + v.payments.filter((p) => p.paid_on.startsWith(month)).reduce((t, p) => t + p.amount, 0), 0)

  return (
    <>
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="greet">{collector ? 'Today' : 'My portfolio'}</h1>
          <p className="muted" style={{ margin: '2px 0 0' }}>{dn(me)} · {open.length} open {open.length === 1 ? 'loan' : 'loans'}</p>
        </div>
        <div className="seg" role="group" aria-label="Currency">
          {CURRENCIES.map((c) => <button key={c} aria-pressed={cur === c} onClick={() => setCur(c)}>{c}</button>)}
        </div>
      </div>
      <section className="hero">
        <div className="row between">
          <span className="row" style={{ gap: 8 }}>
            <span className="eyebrow">Out on loan</span>
            <button className="eye" onClick={toggleHide} aria-label="Show or hide amounts" aria-pressed={hide}><Icon name={hide ? 'eyeoff' : 'eye'} size={18} /></button>
          </span>
          <span className="chip curchip">{cur}</span>
        </div>
        <div className="big num">{m(fig.onLoan)}</div>
        <div className="hstats">
          <div><span>To collect</span><b className="num">{m(fig.toCollect)}</b></div>
          <div><span>Collected this month</span><b className="num">{m(thisMonth)}</b></div>
          <div><span>Late</span><b className="num">{lateCount}</b></div>
        </div>
      </section>
      <section className="bt" style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Ring p={pct} size={64} />
        <span style={{ minWidth: 0 }}>
          <span className="eyebrow" style={{ display: 'block' }}>Collected today</span>
          <b className="num" style={{ fontSize: 20 }}>{m(paidToday)}</b>
          <span className="small muted" style={{ display: 'block' }}>{dueNow > 0 ? `${m(dueNow)} still to collect` : 'Nothing left to collect today'}</span>
        </span>
      </section>
      <section>
        <h2 style={{ marginBottom: 10 }}>Next stops</h2>
        <div className="lcard">
          {!stops.length && <p className="muted">{data.isLoading ? 'Loading…' : 'Nothing due this week.'}</p>}
          {stops.slice(0, 12).map(({ v, r, owed, late }) => (
            <div className="item due" key={`${v.loan.id}-${r.i}`} style={{ cursor: 'default' }}>
              <button type="button" className="grow" style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={() => nav(`/loans/${v.loan.id}`)}>
                <b className="ell" style={{ display: 'block' }}>{borrowerName(v.borrower, lang)}</b>
                <span className={'small ' + (late ? 'tag-late' : 'muted')}>
                  {loanCode(v.loan.id)} · #{r.i} · {fmtD(r.due)}{late && r.lateDays > 0 ? ` · ${r.lateDays}d late` : ''}
                </span>
              </button>
              <b className={'num ' + (late ? 'out' : '')}>{fmt(owed, cur)}</b>
              {can('payments.record') && (
                <button type="button" className="mcta" aria-label={`Record payment for ${borrowerName(v.borrower, lang)}`} title="Record payment" onClick={() => nav(`/cashflow/pay?loan=${v.loan.id}`)}>
                  <Icon name="plus" size={17} />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
