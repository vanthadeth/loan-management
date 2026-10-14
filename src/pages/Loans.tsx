import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../ui/Icon'
import { HeaderAction } from '../ui/HeaderAction'
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
  const { views, voidedViews, loading, error } = useLoans()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = views.filter((v) => v.active && (loanCode(v.loan.id) + bname(v.borrower, lang)).toLowerCase().includes(needle))
  const nDrafts = views.filter((v) => v.loan.status === 'drafted').length
  const nPending = views.filter((v) => v.loan.status === 'requested').length
  const nDone = views.filter((v) => v.done).length
  const needsApproval = can('loans.approve') && nPending > 0

  return (
    <>
      <SearchBar value={q} onChange={setQ} />
      <div className="bento lqs">
        <button type="button" className="bt lq" onClick={() => nav('/loans/queue/drafts')}>
          <span className="bt-h"><Icon name="doc" size={18} />{t('drafted')}</span>
          <b className="bt-big num">{nDrafts}</b>
          <span className="small bt-sub">Your saved drafts</span>
        </button>
        <button type="button" className="bt lq" onClick={() => nav('/loans/queue/requested')}>
          <span className="bt-h">
            <Icon name="checkc" size={18} />Pending approval
            {needsApproval && <i className="ndot inl" role="img" aria-label="Needs your approval" />}
          </span>
          <b className="bt-big num">{nPending}</b>
          <span className="small bt-sub">Requested, waiting for approval</span>
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
      {can('loans.void') && voidedViews.length > 0 && (
        <button type="button" className="btn blockbtn" onClick={() => nav('/loans/voided')}><Icon name="ban" size={17} />Voided loans ({voidedViews.length})</button>
      )}
      {can('loans.create') && <HeaderAction label={t('newLoan')} onClick={() => nav('/loans/new')} />}
    </>
  )
}
