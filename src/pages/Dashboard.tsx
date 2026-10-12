import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { useI18n } from '../app/i18n'
import { Icon } from '../ui/Icon'
import { addDays } from '../lib/calc'
import { fmt, fmtD, loanCode } from '../lib/format'
import {
  borrowerName, buildPeriods, CURRENCIES, dashFigures, dueParts, maskMoney, net, openLoans, useCurrency, useHideAmounts, useMoneyData,
  type Unit,
} from '../data/money'
import { HeroBars } from './money/HeroBars'
import { FundSheet } from './money/FundSheet'

type DueTab = 'all' | 'upcoming' | 'overdue'
const TAB_ICON: Record<DueTab, string> = { all: 'asterisk', upcoming: 'clock', overdue: 'alert' }

export function Dashboard() {
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const nav = useNavigate()
  const data = useMoneyData()
  const [cur, setCur] = useCurrency()
  const [hide, toggleHide] = useHideAmounts()
  const [unit, setUnit] = useState<Unit>('week')
  const [sel, setSel] = useState(3)
  const [dueTab, setDueTab] = useState<DueTab>('all')
  const [fundOpen, setFundOpen] = useState(false)

  const seeFunds = can('funds.view')
  const fig = useMemo(() => dashFigures(data, cur), [data, cur])
  const periods = useMemo(() => buildPeriods(unit, data, cur), [unit, data, cur])
  const available = useMemo(
    () => ({ KHR: net(data.entries.filter((e) => e.currency === 'KHR')), USD: net(data.entries.filter((e) => e.currency === 'USD')) }),
    [data.entries],
  )
  const due = useMemo(() => {
    const out = openLoans(data, cur).flatMap((v) =>
      v.status.rows.filter((r) => r.state !== 'paid').map((r) => ({ v, r, owed: dueParts(r).remaining, late: r.state === 'overdue' })))
    return out.sort((a, b) => (a.r.due < b.r.due ? -1 : a.r.due > b.r.due ? 1 : 0))
  }, [data, cur])

  const m = (n: number) => maskMoney(n, cur, hide)
  const shown = due.filter((x) => dueTab === 'all' || (dueTab === 'overdue') === x.late).slice(0, 8)
  const weekEnd = addDays(data.today, 7)
  const groups = [
    [t('overdue'), shown.filter((x) => x.late)],
    ['This week', shown.filter((x) => !x.late && x.r.due <= weekEnd)],
    ['Later', shown.filter((x) => !x.late && x.r.due > weekEnd)],
  ] as const

  return (
    <>
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div><h1 className="greet">{t('greet')}</h1><p className="muted" style={{ margin: '2px 0 0' }}>{t('greetSub')}</p></div>
        <div className="seg" role="group" aria-label="Currency">
          {CURRENCIES.map((c) => <button key={c} aria-pressed={cur === c} onClick={() => { setCur(c); setSel(3) }}>{c}</button>)}
        </div>
      </div>
      <section className="hero">
        <div className="row between">
          <span className="row" style={{ gap: 8 }}>
            <span className="eyebrow">{t('available')}</span>
            <button className="eye" onClick={toggleHide} aria-label="Show or hide amounts" aria-pressed={hide}><Icon name={hide ? 'eyeoff' : 'eye'} size={18} /></button>
          </span>
          <span className="chip curchip">{cur}</span>
        </div>
        <div className="row between bigrow">
          <div className="big num">{seeFunds ? m(fig.funds) : '—'}</div>
          {can('funds.add') && <button className="hbtn" onClick={() => setFundOpen(true)}>{t('addFund')}</button>}
        </div>
        <div className="hstats">
          <div><span>{t('shOn')}</span><b className="num">{m(fig.onLoan)}</b></div>
          <div><span>{t('shTbc')}</span><b className="num">{m(fig.toCollect)}</b></div>
          <div><span>{t('shAfter')}</span><b className="num">{seeFunds ? m(fig.funds + fig.toCollect) : '—'}</b></div>
        </div>
        <HeroBars periods={periods} unit={unit} onUnit={(u) => { setUnit(u); setSel(3) }} sel={sel} onSel={setSel} cur={cur} hide={hide} />
      </section>
      <section>
        <h2 style={{ marginBottom: 10 }}>{t('due')}</h2>
        <div className="tabs">
          {([['all', t('all')], ['upcoming', t('upcoming')], ['overdue', t('overdue')]] as [DueTab, string][]).map(([k, n]) => (
            <button key={k} className="tab" aria-pressed={dueTab === k} onClick={() => setDueTab(k)}><Icon name={TAB_ICON[k]} size={16} />{n}</button>
          ))}
        </div>
        <div className="lcard" style={{ marginTop: 12 }}>
          {shown.length === 0 && <p className="muted">{data.isLoading ? 'Loading…' : 'Nothing due.'}</p>}
          {groups.filter(([, rows]) => rows.length > 0).map(([h, rows]) => (
            <Fragment key={h}>
              <div className="dh">{h}</div>
              {rows.map(({ v, r, owed, late }) => (
                <button key={`${v.loan.id}-${r.i}`} className="item due" onClick={() => nav(`/loans/${v.loan.id}`)}>
                  <span className="grow">
                    <b className="ell">{borrowerName(v.borrower, lang)}</b>
                    <span className={'small ' + (late ? 'tag-late' : 'muted')}>
                      {loanCode(v.loan.id)} · #{r.i} · {fmtD(r.due)}{late ? ` · ${r.lateDays}d late` : ''}
                    </span>
                  </span>
                  <b className={'num ' + (late ? 'out' : '')}>{fmt(owed, cur)}</b>
                </button>
              ))}
            </Fragment>
          ))}
        </div>
      </section>
      {fundOpen && <FundSheet currency={cur} available={available} onClose={() => setFundOpen(false)} />}
    </>
  )
}
