import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { useI18n } from '../app/i18n'
import { Icon } from '../ui/Icon'
import { DateIconPicker, Fab } from '../ui/Controls'
import { diffDays } from '../lib/calc'
import { fmt, fmtD } from '../lib/format'
import { borrowerName, CURRENCIES, net, useMoneyData, type EntryType, type LedgerEntry } from '../data/money'

type Filter = 'all' | 'in' | 'out' | 'fund'
const FILTERS: [Filter, string, string][] = [['all', 'all', 'asterisk'], ['in', 'in', 'download'], ['out', 'out', 'upload'], ['fund', 'Funds', 'plus']]
const ICON: Record<EntryType, string> = { add: 'plus', wd: 'minus', in: 'download', out: 'upload' }
const PAGE = 40

export function Cashflow() {
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const nav = useNavigate()
  const { entries, today, isLoading } = useMoneyData()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [date, setDate] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const title = (e: LedgerEntry) => (e.borrower ? borrowerName(e.borrower, lang) : e.title)
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return entries.filter((e) =>
      (filter === 'all' || (filter === 'fund' ? e.type === 'add' || e.type === 'wd' : e.type === filter))
      && (!needle || `${e.borrower?.name ?? ''} ${e.borrower?.name_km ?? ''} ${e.title} ${e.detail}`.toLowerCase().includes(needle))
      && (!date || e.date === date))
  }, [entries, q, filter, date])

  const label = (iso: string) => {
    const n = diffDays(iso, today)
    return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : fmtD(iso)
  }
  const groups: { g: string; r: LedgerEntry[] }[] = []
  rows.slice(0, limit).forEach((e) => {
    const g = label(e.date)
    const last = groups[groups.length - 1]
    if (last && last.g === g) last.r.push(e)
    else groups.push({ g, r: [e] })
  })

  return (
    <>
      <div className="row">
        <input className="search" id="q" placeholder={t('search')} value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} aria-label="Search" />
        <button className="icon-btn srch" aria-label="Search" onClick={() => document.getElementById('q')?.focus()}><Icon name="search" /></button>
        <DateIconPicker value={date} onChange={(v) => { setDate(v); setLimit(PAGE) }} />
      </div>
      <div className="tabs">
        {FILTERS.map(([k, n, ic]) => (
          <button key={k} className="tab" aria-pressed={filter === k} onClick={() => { setFilter(k); setLimit(PAGE) }}><Icon name={ic} size={16} />{k === 'fund' ? n : t(n)}</button>
        ))}
      </div>
      {date && (
        <div className="cfdate">
          <span className="chip approved"><Icon name="cal" size={13} />{fmtD(date)}</span>
          <button className="btn sm" onClick={() => setDate('')}><Icon name="x" size={16} />Show all dates</button>
        </div>
      )}
      {groups.length > 0 ? (
        <>
          <div className="tblwrap card cft">
            <table>
              <thead>
                <tr><th scope="col">Description</th><th scope="col" className="r">KHR ៛</th><th scope="col" className="r">USD $</th></tr>
              </thead>
              {groups.map((G) => (
                <tbody key={G.g}>
                  <tr className="cft-g"><th colSpan={3} scope="colgroup">{G.g}</th></tr>
                  {G.r.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <span className="cft-d">
                          <span className={'tic ' + e.type}><Icon name={ICON[e.type]} size={e.type === 'add' || e.type === 'wd' ? 16 : 17} /></span>
                          <span className="grow"><b className="ell">{title(e)}</b><span className="small muted">{e.detail}</span></span>
                        </span>
                      </td>
                      {CURRENCIES.map((c) => c === e.currency
                        ? <td key={c} className="r"><b className={'num ' + e.type}>{e.direction === 'in' ? '+' : '−'}{fmt(e.amount, c)}</b></td>
                        : <td key={c} className="r"><b className="num na">—</b></td>)}
                    </tr>
                  ))}
                  <tr className="cft-n">
                    <td>Net change</td>
                    {CURRENCIES.map((c) => {
                      const part = G.r.filter((e) => e.currency === c)
                      if (!part.length) return <td key={c} className="r"><b className="na">—</b></td>
                      const v = net(part)
                      return <td key={c} className="r"><b className={v < 0 ? 'neg' : ''}>{v < 0 ? '−' : '+'}{fmt(Math.abs(v), c)}</b></td>
                    })}
                  </tr>
                </tbody>
              ))}
            </table>
          </div>
          {rows.length > limit && <button className="btn" style={{ alignSelf: 'center' }} onClick={() => setLimit(limit + PAGE)}>Show more</button>}
        </>
      ) : (
        <p className="muted">{isLoading ? 'Loading…' : date ? 'No entries on this date.' : 'No payments.'}</p>
      )}
      {can('payments.record') && <Fab label={t('record')} onClick={() => nav('/cashflow/pay')} />}
    </>
  )
}
