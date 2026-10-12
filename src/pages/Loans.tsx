import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../ui/Icon'
import { Fab } from '../ui/Controls'
import { useAuth } from '../app/auth'
import { useI18n } from '../app/i18n'
import { bname } from '../data/borrowers'
import { useLoans } from '../data/loans'
import { loanCode } from '../lib/format'
import { LoanRow, SearchBar } from './loans/parts'

export function Loans() {
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const nav = useNavigate()
  const { views, loading, error } = useLoans()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = views.filter((v) => v.active && (loanCode(v.loan.id) + bname(v.borrower, lang)).toLowerCase().includes(needle))
  const nRequested = views.filter((v) => v.loan.status === 'requested').length
  const nPending = views.filter((v) => v.loan.status === 'verified').length
  const nDone = views.filter((v) => v.done).length
  const needsApproval = can('loans.approve') && nPending > 0

  return (
    <>
      <SearchBar value={q} onChange={setQ} />
      <div className="bento lqs">
        <button type="button" className="bt lq" onClick={() => nav('/loans/queue/requested')}>
          <span className="bt-h"><Icon name="doc" size={18} />{t('requested')}</span>
          <b className="bt-big num">{nRequested}</b>
          <span className="small bt-sub">Waiting to be verified</span>
        </button>
        <button type="button" className="bt lq" onClick={() => nav('/loans/queue/pending')}>
          <span className="bt-h">
            <Icon name="checkc" size={18} />Pending approval
            {needsApproval && <i className="ndot inl" role="img" aria-label="Needs your approval" />}
          </span>
          <b className="bt-big num">{nPending}</b>
          <span className="small bt-sub">Verified, waiting for approval</span>
        </button>
      </div>
      {error && <p className="muted">{error}</p>}
      <div className="eyebrow">{rows.length} active {rows.length === 1 ? 'loan' : 'loans'}</div>
      <div className="lcard">
        {rows.map((v) => <LoanRow key={v.loan.id} v={v} />)}
        {!rows.length && <p className="muted">{loading ? 'Loading…' : 'No active loans.'}</p>}
      </div>
      {nDone > 0 && (
        <button type="button" className="btn blockbtn" onClick={() => nav('/loans/history')}><Icon name="clock" size={17} />Loans history ({nDone})</button>
      )}
      {can('loans.create') && <Fab label={t('newLoan')} onClick={() => nav('/loans/new')} />}
    </>
  )
}
