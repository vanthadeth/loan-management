import { useState } from 'react'
import { DateField } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { usePageTitle } from '../app/Layout'
import { useI18n } from '../app/i18n'
import { bname } from '../data/borrowers'
import { completedOn, useLoans } from '../data/loans'
import { fmtD, loanCode } from '../lib/format'
import { LoanRow, SearchBar } from './loans/parts'

export function LoanHistory() {
  usePageTitle('Loans history')
  const { lang } = useI18n()
  const { views, loading, error } = useLoans()
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = views.filter((v) => {
    if (!v.done || !(loanCode(v.loan.id) + bname(v.borrower, lang)).toLowerCase().includes(needle)) return false
    const end = completedOn(v)
    return (!from || end >= from) && (!to || end <= to)
  })
  return (
    <>
      <SearchBar value={q} onChange={setQ} />
      <div className="lhr">
        <DateField id="lhf" label="Completed from" value={from} onChange={setFrom} />
        <DateField id="lht" label="Completed to" value={to} onChange={setTo} />
        {(from || to) && <button type="button" className="btn sm" onClick={() => { setFrom(''); setTo('') }}><Icon name="x" size={16} />Clear dates</button>}
      </div>
      {error && <p className="muted">{error}</p>}
      <div className="eyebrow">{rows.length} completed {rows.length === 1 ? 'loan' : 'loans'}</div>
      <div className="lcard">
        {rows.map((v) => <LoanRow key={v.loan.id} v={v} doneLabel={'Completed ' + fmtD(completedOn(v))} />)}
        {!rows.length && <p className="muted">{loading ? 'Loading…' : 'No completed loans match.'}</p>}
      </div>
    </>
  )
}
