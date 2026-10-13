import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { Icon } from '../ui/Icon'
import { CURRENCIES, dueParts, net, openLoans, sum, useCurrency, useMoneyData } from '../data/money'
import { fmt } from '../lib/format'
import { RangeControls } from './reports/RangeControls'
import { useReportRange } from './reports/range'
import { REPORTS } from './reports/builders'

export function Reports() {
  const { can } = useAuth()
  if (!can('reports.view')) return <p className="muted">You do not have access to reports.</p>
  return <ReportsHome />
}

function ReportsHome() {
  const data = useMoneyData()
  const range = useReportRange()
  const [cur, setCur] = useCurrency()
  const { from, to } = range

  const f = useMemo(() => {
    const E = data.entries.filter((e) => e.currency === cur && e.date >= from && e.date <= to)
    const pays = E.filter((e) => e.kind === 'payment')
    const open = openLoans(data, cur)
    return {
      pays: pays.length,
      collected: sum(pays),
      interest: sum(pays, (e) => e.interest),
      principal: sum(pays, (e) => e.principal),
      misc: [
        ['Service fees', fmt(sum(E.filter((e) => e.kind === 'fee')), cur)],
        ['Late and prepayment fees', fmt(sum(pays, (e) => e.lateFee), cur)],
        ['Loans released', fmt(sum(E.filter((e) => e.kind === 'release')), cur)],
        ['Fund added', fmt(sum(E.filter((e) => e.kind === 'add')), cur)],
        ['Fund withdrawn', fmt(sum(E.filter((e) => e.kind === 'withdraw')), cur)],
        ['Net cash change', (net(E) < 0 ? '−' : '+') + fmt(Math.abs(net(E)), cur)],
        ['Overdue now', fmt(open.reduce((s, v) => s + v.status.rows.filter((r) => r.state === 'overdue').reduce((a, r) => a + dueParts(r).remaining, 0), 0), cur)],
        ['Active loans', String(open.length)],
      ],
    }
  }, [data, cur, from, to])

  return (
    <>
      <RangeControls range={range} />
      <div className="row between" style={{ alignItems: 'center', gap: 10 }}>
        <span className="small muted">{range.label}</span>
        <div className="seg" role="group" aria-label="Currency">
          {CURRENCIES.map((c) => <button key={c} aria-pressed={cur === c} onClick={() => setCur(c)}>{c}</button>)}
        </div>
      </div>
      <div className="rep">
        <section className="bt r-hero">
          <span className="bt-h"><Icon name="download" size={18} />Collected</span>
          <b className="bt-big num">{fmt(f.collected, cur)}</b>
          <span className="small bt-sub">{f.pays} {f.pays === 1 ? 'payment' : 'payments'} received</span>
        </section>
        <section className="bt r-side">
          <span className="bt-h"><Icon name="pie" size={18} />Interest earned</span>
          <b className="bt-big num">{fmt(f.interest, cur)}</b>
          <span className="small bt-sub">Income from interest</span>
        </section>
        <section className="bt r-side">
          <span className="bt-h"><Icon name="coin" size={18} />Principal collected</span>
          <b className="bt-big num">{fmt(f.principal, cur)}</b>
          <span className="small bt-sub">Loan amount paid back</span>
        </section>
        <div className="bh r-cap">Other figures</div>
        {f.misc.map(([k, v]) => <div className="r-misc" key={k}><span className="small muted">{k}</span><b className="num">{v}</b></div>)}
      </div>
      <div className="bh" style={{ paddingTop: 8 }}>Reports</div>
      <div className="lcard">
        {REPORTS.map((r) => (
          <div className="item" style={{ cursor: 'default' }} key={r.name}>
            <Link className="rlink" to={`/reports/${encodeURIComponent(r.name)}`}>
              <span className="tic in"><Icon name={r.icon} size={17} /></span>
              <span className="grow"><b className="ell" style={{ display: 'block' }}>{r.name}</b><span className="small muted">{r.desc}</span></span>
            </Link>
          </div>
        ))}
      </div>
    </>
  )
}
