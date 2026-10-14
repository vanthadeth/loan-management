import { Fragment, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { TextArea } from '../ui/Controls'
import { useToast } from '../ui/Toast'
import { usePageTitle, useActionSlot } from '../app/Layout'
import { useAuth } from '../app/auth'
import { useI18n } from '../app/i18n'
import { dn, useBanks, useTeam } from '../data/core'
import { bname } from '../data/borrowers'
import { completedOn, errMsg, payoffOf, useLoanActions, useLoanFiles, useLoans } from '../data/loans'
import { effectiveRate, isEarlyPayoff, isPayoff, loanTotals, splitPayments, todayIso } from '../lib/calc'
import { dueParts, useVoidPayment } from '../data/money'
import { fmt, fmtD, loanCode } from '../lib/format'
import type { LoanStatus, Payment } from '../lib/types'
import { FileView } from './loans/FileView'
import { Bar, Ring } from './loans/parts'
import { SupervisorSheet } from './loans/SupervisorSheet'
import { LateFeeBreakdown } from './loans/LateFee'
import { findings, Insight } from './loans/Insight'
import { CollectLateFee } from './loans/CollectLateFee'
import { EarlyPayoff } from './loans/EarlyPayoff'
import { ActionMenu, type MenuAction } from '../ui/ActionMenu'
import { useLoanSnapshots, useReconcile } from '../data/audit'

const STEPS: LoanStatus[] = ['drafted', 'requested', 'approved']
type Tab = 'main' | 'schedule' | 'contract' | 'insight'
type Dialog = 'submit' | 'delete' | 'return' | 'reset' | 'approve' | 'reject' | 'supervisor' | 'collector' | 'void' | 'restore' | 'latefee' | 'early' | 'writeoff' | 'unwriteoff' | null

export function LoanDetail() {
  const loanId = Number(useParams().id)
  const { t, lang } = useI18n()
  const { can, scoped, me, role } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const { views, voidedViews, loading, error } = useLoans()
  const team = useTeam()
  const banks = useBanks()
  const files = useLoanFiles(loanId)
  const actions = useLoanActions()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [reason, setReason] = useState('')
  const [progOpen, setProgOpen] = useState(true)
  const [payTarget, setPayTarget] = useState<{ p: Payment; restore: boolean } | null>(null)
  const voidPay = useVoidPayment()
  const snaps = useLoanSnapshots(loanId)
  const isAdminRole = !!role?.locked
  const books = useReconcile(loanId, isAdminRole)
  const [params, setParams] = useSearchParams()
  const actionSlot = useActionSlot()
  usePageTitle(Number.isFinite(loanId) ? loanCode(loanId) : 'Loan')

  const v = views.find((x) => x.loan.id === loanId) ?? voidedViews.find((x) => x.loan.id === loanId)
  if (!v) return <p className="muted">{loading ? 'Loading…' : error ?? 'Loan not found.'}</p>

  const { loan, status, terms, payments, borrower } = v
  const name = bname(borrower, lang)
  const cur = loan.currency
  const approved = loan.status === 'approved'
  const si = STEPS.indexOf(loan.status)
  const who = (id: string | null) => (id ? dn((team.data ?? []).find((p) => p.id === id)) : null)
  const { fee, net } = loanTotals(terms)
  const collected = status.collected
  const refinanced = loan.status === 'refinanced'
  // a refinanced loan only earns what was collected up to the payoff; its interest not yet due was dropped
  const paidEarly = status.interestWaived > 0
  // money received for the installments, by what it paid (principal / interest), and the fees on top
  const cash = Array.from(splitPayments(terms, payments).values()).reduce((o, x) => ({ principal: o.principal + x.principal, interest: o.interest + x.interest }), { principal: 0, interest: 0 })
  const serviceFeeIn = (approved || refinanced) && loan.release_date <= todayIso() ? fee : 0
  const feesIn = serviceFeeIn + status.lateFeePaid + status.prepayFeePaid
  const gain = fee + (refinanced || paidEarly ? status.collected + status.lateFeePaid + status.prepayFeePaid : status.total) - loan.amount
  const bank = (banks.data ?? []).find((b) => b.id === loan.bank_account_id)
  const payText = loan.pay_method === 'bank' ? 'Bank' + (bank ? ` · ${bank.bank} ${bank.account_no}` : '')
    : loan.pay_method === 'other' ? 'Other' + (loan.pay_remarks ? ` · ${loan.pay_remarks}` : '') : 'Cash'
  const collaterals = files.data?.collaterals ?? []
  const attachments = files.data?.attachments ?? []
  const voided = !!loan.voided_at
  const mine = loan.status === 'drafted' && loan.requested_by === me?.id && can('loans.create')
  // refinancing loan: the old loan's balance must still match what was carried over when this was drafted
  const oldView = loan.refinance_of ? [...views, ...voidedViews].find((x) => x.loan.id === loan.refinance_of) : undefined
  const freshPayoff = oldView?.active ? payoffOf(oldView, loan.release_date > todayIso() ? loan.release_date : todayIso()) : null
  const stale = !!loan.refinance_of && (loan.status === 'requested' || loan.status === 'drafted')
    && (!freshPayoff || Math.abs(freshPayoff.total - Number(loan.carried_amount ?? 0)) > 0.005)
  const canApprove = !voided && loan.status === 'requested' && can('loans.approve') && !stale
  const canReturn = !voided && (loan.status === 'requested' || loan.status === 'rejected') && (can('loans.create') || can('loans.approve'))
  const isAdmin = !!role?.locked
  const tabs: [Tab, string, string][] = [['main', 'Overview', 'pie'], ['schedule', 'Schedule', 'cal'], ['contract', 'Details', 'doc'], ...(isAdmin ? [['insight', 'Insight', 'eye'] as [Tab, string, string]] : [])]
  const wanted = params.get('tab')
  const tab: Tab = tabs.some(([k]) => k === wanted) ? (wanted as Tab) : 'main'
  const setTab = (k: Tab) => setParams((q) => { const n = new URLSearchParams(q); if (k === 'main') n.delete('tab'); else n.set('tab', k); return n }, { replace: true })
  // an approved loan is not voided (reset its approval first); the exception is undoing a refinancing, a refinancing loan with no payments
  const canVoid = !voided && can('loans.void') && (!(loan.status === 'approved' || loan.status === 'refinanced') || (loan.status === 'approved' && !!loan.refinance_of && payments.length === 0))
  const canVoidPay = approved && !voided && can('payments.void')
  const canReset = !voided && loan.status === 'approved' && can('loans.approve') && payments.length === 0 && !loan.refinance_of
  // refinance: an approved loan still collecting, with no other refinancing loan in progress
  const refinancedBy = [...views, ...voidedViews].find((x) => x.loan.refinance_of === loan.id && !x.loan.voided_at && x.loan.status !== 'rejected')
  const writtenOff = !!loan.written_off_at
  const canEarly = !voided && v.active && !refinancedBy && !writtenOff && can('payments.record')
  const canWriteOff = !voided && v.active && !writtenOff && can('loans.write_off') && status.rows.some((r) => r.state === 'overdue')
  const canUnWriteOff = !voided && writtenOff && can('loans.write_off')
  const canRefinance = !voided && v.active && !refinancedBy && !writtenOff && can('loans.create')
  const next = approved && !voided ? status.rows.find((r) => r.state !== 'paid') : undefined
  const phone = (borrower?.phone ?? '').replace(/[^\d+]/g, '')
  const pct = Math.round((status.paidCount / loan.occurrences) * 100)
  const lateRate = `${Number(loan.late_fee_pct)}%`
  const lateExtra = (loan.late_grace_days ? `, after ${loan.late_grace_days} grace day${loan.late_grace_days > 1 ? 's' : ''}` : '') + (loan.late_cap_pct ? `, capped at ${Number(loan.late_cap_pct)}% of the loan` : '')
  const lateUnit = loan.frequency === 'daily' ? 'day' : loan.frequency === 'weekly' ? 'week' : loan.frequency === 'monthly' ? 'month' : `${loan.interval_days}-day period`
  const end = refinanced ? completedOn(v) : status.done ? status.rows[status.rows.length - 1].paidOn : status.rows[status.rows.length - 1].due

  // what the loan looked like right after a payment, from its snapshot: remaining principal before to after
  const balanceLine = (paymentId: number) => {
    const list = snaps.data ?? []
    const s = list.find((x) => x.event_id === paymentId && x.event_type !== 'void' && x.event_type !== 'restore')
    if (!s) return ''
    const before = list.find((x) => x.seq === s.seq - 1)
    return `Principal left ${before ? fmt(before.principal_outstanding, cur) + ' → ' : ''}${fmt(s.principal_outstanding, cur)} · interest left ${fmt(s.interest_outstanding, cur)}`
  }
  // every action on the loan, in one menu at the top right of the header
  const menuActions: MenuAction[] = [
    ...(mine ? [
      { key: 'submit', label: 'Submit request', icon: 'check', onClick: () => setDialog('submit') },
      { key: 'edit', label: 'Edit draft', icon: 'edit', onClick: () => nav(`/loans/new?draft=${loan.id}`) },
    ] : []),
    ...(canReturn ? [{ key: 'draft', label: 'Draft', icon: 'back', onClick: () => setDialog('return') }] : []),
    ...(canEarly ? [{ key: 'early', label: 'Early payoff', icon: 'coin', onClick: () => setDialog('early') }] : []),
    ...(canRefinance ? [{ key: 'refi', label: 'Refinance', icon: 'loan', onClick: () => nav(`/loans/new?refinance=${loan.id}`) }] : []),
    ...(canReset ? [{ key: 'reset', label: 'Reset approval', icon: 'refresh', onClick: () => setDialog('reset') }] : []),
    ...(mine ? [{ key: 'delete', label: 'Delete draft', icon: 'trash', danger: true, onClick: () => setDialog('delete') }] : []),
    ...(canWriteOff ? [{ key: 'writeoff', label: 'Write off', icon: 'alert', danger: true, onClick: () => { setReason(''); setDialog('writeoff') } }] : []),
    ...(canVoid ? [{ key: 'void', label: loan.status === 'approved' ? 'Undo refinancing' : 'Void', icon: 'ban', danger: true, onClick: () => { setReason(''); setDialog('void') } }] : []),
  ]
  const move = (to: LoanStatus, done: string) => async () => {
    try {
      await actions.setStatus(loan.id, loan.status, to)
      toast(done)
      setDialog(null)
    } catch (e) {
      toast(errMsg(e))
    }
  }
  const attach = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!picked.length) return
    try {
      await actions.addAttachments(loan.id, picked)
      toast(picked.length > 1 ? 'Files added' : 'File added')
    } catch (err) {
      toast(errMsg(err))
    }
  }

  return (
    <>
      <section className="card">
        {actionSlot && createPortal(<ActionMenu actions={menuActions} label="Loan actions" />, actionSlot)}
        <div className="row between" style={{ alignItems: 'baseline', gap: 12 }}>
          <h1>{can('borrowers.view') ? <Link to={`/borrowers/${loan.borrower_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{name}</Link> : name}</h1>
          <b className="num" style={{ fontSize: 20, fontFamily: 'var(--display)', whiteSpace: 'nowrap' }}>{fmt(loan.amount, cur)}</b>
        </div>
        {loan.status === 'refinanced'
          ? <div style={{ margin: '14px 0' }}><span className="chip approved">Refinanced</span>{refinancedBy && <p style={{ margin: '8px 0 0' }}>Paid off by <Link to={`/loans/${refinancedBy.loan.id}`}>{loanCode(refinancedBy.loan.id)}</Link>.</p>}</div>
          : loan.status === 'rejected'
          ? <div style={{ margin: '14px 0' }}><span className="chip overdue">Denied</span>{loan.reject_reason && <p style={{ margin: '8px 0 0' }}>Reason: {loan.reject_reason}</p>}</div>
          : (
            <div className="stepper" style={{ margin: '14px 0' }}>
              {STEPS.map((k, i) => (
                <Fragment key={k}>
                  <span className={'step ' + (i < si ? 'done' : i === si ? 'now' : '')}><b>{i < si ? '✓' : i + 1}</b>{t(k)}</span>
                  {i < 2 && <hr />}
                </Fragment>
              ))}
            </div>
          )}
        {loan.refinance_of && (
          <p className="small" style={{ margin: '0 0 12px' }}>
            Refinances <Link to={`/loans/${loan.refinance_of}`}>{loanCode(loan.refinance_of)}</Link>: {fmt(Number(loan.carried_amount ?? 0), cur)} of this loan is the balance carried over
            {Number(loan.carried_late_fee ?? 0) > 0 ? ` (incl. ${fmt(Number(loan.carried_late_fee), cur)} late fee)` : ''}; the borrower receives {fmt(net, cur)}.
          </p>
        )}
        {stale && (
          <p className="small tag-late" style={{ margin: '0 0 12px' }}>
            {freshPayoff
              ? <>The balance of {loanCode(loan.refinance_of!)} has changed since this was drafted: it is now {fmt(freshPayoff.total, cur)}, not {fmt(Number(loan.carried_amount ?? 0), cur)}. Return it to draft and save it again to update it before approval.</>
              : <>{loanCode(loan.refinance_of!)} is no longer open, so this loan cannot refinance it. Return it to draft or deny it.</>}
          </p>
        )}
        {refinancedBy && loan.status === 'approved' && (
          <p className="small" style={{ margin: '0 0 12px' }}>
            Being refinanced by <Link to={`/loans/${refinancedBy.loan.id}`}>{loanCode(refinancedBy.loan.id)}</Link> ({t(refinancedBy.loan.status)}). It is paid off when that loan is approved.
          </p>
        )}
      </section>

      {writtenOff && !voided && (
        <section className="card" style={{ borderColor: 'var(--late)' }}>
          <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div>
              <b style={{ color: 'var(--late)' }}>Written off</b>
              <p className="small muted" style={{ margin: '2px 0 0' }}>
                {fmtD(loan.written_off_at?.slice(0, 10))}{who(loan.written_off_by) ? ` by ${who(loan.written_off_by)}` : ''}. Still counted in the portfolio and the risk figures; money received now is recorded as a recovery.
              </p>
              {loan.write_off_reason && <p style={{ margin: '6px 0 0' }}>Reason: {loan.write_off_reason}</p>}
            </div>
            {canUnWriteOff && <button type="button" className="btn" onClick={() => { setReason(''); setDialog('unwriteoff') }}>Reverse</button>}
          </div>
        </section>
      )}

      {voided && (
        <section className="card" style={{ borderColor: 'var(--late)' }}>
          <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div>
              <b style={{ color: 'var(--late)' }}>Voided</b>
              <p className="small muted" style={{ margin: '2px 0 0' }}>
                {fmtD(loan.voided_at)} by {dn(team.data?.find((p) => p.id === loan.voided_by))}. Hidden from everyone else and left out of every total.
              </p>
              {loan.void_reason && <p style={{ margin: '6px 0 0' }}>Reason: {loan.void_reason}</p>}
            </div>
            {can('loans.void') && !loan.refinance_of && <button type="button" className="btn" onClick={() => setDialog('restore')}><Icon name="refresh" size={17} />Restore loan</button>}
          </div>
        </section>
      )}







      <div className="tabs ltabs" role="tablist" aria-label="Loan sections">
        {tabs.map(([k, label, icon]) => (
          <button type="button" role="tab" key={k} className="tab" aria-pressed={tab === k} aria-selected={tab === k} onClick={() => setTab(k)}
            ref={(el) => { if (el && tab === k) el.scrollIntoView({ inline: 'nearest', block: 'nearest' }) }}><Icon name={icon} size={16} />{label}</button>
        ))}
      </div>
      {tab === 'main' && <>
      {!voided && (next || (approved && status.done) || status.lateFeeOutstanding > 0) && (
        <div className="qa2">
          {next ? (
            <section className="card">
              <div className="eyebrow">Next installment · {next.i} of {loan.occurrences}</div>
              <div className="row between" style={{ alignItems: 'center', margin: '4px 0' }}>
                <b className="num" style={{ fontSize: 22, fontFamily: 'var(--display)' }}>{fmt(dueParts(next).remaining, cur)}</b>
                <span className={'chip ' + (next.state === 'overdue' ? 'overdue' : '')}>{next.state === 'overdue' ? `${next.lateDays}d late` : `Due ${fmtD(next.due)}`}</span>
              </div>
              <div className="ctas" style={{ marginTop: 10 }}>
                {can('payments.record') && <button type="button" className="btn primary" onClick={() => nav(`/cashflow/pay?loan=${loan.id}`)}>Record payment</button>}
                {phone && <a className="btn" style={{ textDecoration: 'none' }} href={'tel:' + phone}><Icon name="phone" size={16} />Call</a>}
              </div>
            </section>
          ) : approved && status.done ? (
            <section className="card">
              <div className="eyebrow">Repaid</div>
              <b style={{ fontSize: 18, color: 'var(--paid)' }}>Fully repaid</b>
              <p className="small muted" style={{ margin: '4px 0 0' }}>{paidEarly ? 'Paid off early' : 'Every installment has been collected'}{end ? ` (${fmtD(end)})` : ''}.</p>
            </section>
          ) : null}
          {status.lateFeeOutstanding > 0 && (
            <section className="card" style={{ borderColor: 'var(--late)' }}>
              <div className="eyebrow">Late fee due</div>
              <b className="num out" style={{ fontSize: 22, fontFamily: 'var(--display)', display: 'block', margin: '4px 0' }}>{fmt(status.lateFeeOutstanding, cur)}</b>
              <p className="small muted" style={{ margin: 0 }}>{lateRate} of the unpaid principal, per late {lateUnit}{lateExtra}. Collected separately from payments.</p>
              {approved && can('payments.record') && (
                <div className="ctas" style={{ marginTop: 10 }}><button type="button" className="btn" onClick={() => setDialog('latefee')}>Collect late fee</button></div>
              )}
            </section>
          )}
        </div>
      )}
      <section className="card">
        <div className="row between">
          <h2>{t('progress')}</h2>
          <span className="row" style={{ gap: 8 }}>
            <span className="small muted num">{status.paidCount}/{loan.occurrences}</span>
            <Ring p={pct} size={46} color="var(--paid)" stroke={6} />
          </span>
        </div>
        <div style={{ margin: '10px 0 8px' }}><Bar rows={status.rows} flagLate={approved} /></div>
        <div className="legend">
          <span><i style={{ background: 'var(--paid)' }} />Paid</span>
          <span><i style={{ background: 'var(--remain)' }} />Remaining</span>
          <span><i style={{ background: 'var(--late)' }} />{t('overdue')}</span>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="linkbtn" aria-expanded={progOpen} onClick={() => setProgOpen((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {progOpen ? 'Hide details' : 'Show details'}
            <span aria-hidden="true" style={{ display: 'inline-flex', transform: progOpen ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform .15s' }}><Icon name="chev" size={14} /></span>
          </button>
        </div>
        <div className="tblwrap" style={{ marginTop: 4 }}>
          <table className={'num prog' + (progOpen ? '' : ' collapsed')}><tbody>
            <tr className="head"><td>On contract</td><td className="r"><b>{fmt(status.total, cur)}</b></td></tr>
            <tr className="sub"><td>Principal</td><td className="r">{fmt(loan.amount, cur)}</td></tr>
            <tr className="sub"><td>Interest</td><td className="r">{fmt(status.total - loan.amount, cur)}</td></tr>
            <tr className="head"><td>{t('collected')}</td><td className="r in"><b>{fmt(cash.principal + cash.interest, cur)}</b></td></tr>
            <tr className="sub"><td>Principal</td><td className="r">{fmt(cash.principal, cur)}</td></tr>
            <tr className="sub"><td>Interest</td><td className="r">{fmt(cash.interest, cur)}</td></tr>
            {serviceFeeIn > 0 && <tr className="sub"><td>Service fee</td><td className="r">{fmt(serviceFeeIn, cur)}</td></tr>}
            {status.lateFeePaid > 0 && <tr className="sub"><td>Late fee</td><td className="r">{fmt(status.lateFeePaid, cur)}</td></tr>}
            {status.prepayFeePaid > 0 && <tr className="sub"><td>Other fee (prepayment)</td><td className="r">{fmt(status.prepayFeePaid, cur)}</td></tr>}
            {feesIn > 0 && <tr className="sub total"><td>Received with fees</td><td className="r">{fmt(cash.principal + cash.interest + feesIn, cur)}</td></tr>}
            {refinanced
              ? <tr className="head"><td>Interest dropped at refinancing</td><td className="r"><b>{fmt(status.remaining, cur)}</b></td></tr>
              : (
                <>
                  <tr className="head"><td>{t('remaining')}</td><td className="r"><b>{fmt(status.remaining, cur)}</b></td></tr>
                  <tr className="sub"><td>Principal</td><td className="r">{fmt(status.remainingPrincipal, cur)}</td></tr>
                  <tr className="sub"><td>Interest</td><td className="r">{fmt(status.remainingInterest, cur)}</td></tr>
                </>
              )}
            {approved && status.lateFeeOutstanding > 0 && <tr className="head"><td>Late fee due</td><td className="r out"><b>{fmt(status.lateFeeOutstanding, cur)}</b></td></tr>}
          </tbody></table>
        </div>
        <div className="kv dates" style={{ marginTop: 14 }}>
          <div><span className="eyebrow">{t('start')}</span>{fmtD(loan.release_date)}</div>
          <div><span className="eyebrow">{t('end')}</span>{fmtD(end)}{status.done || refinanced ? '' : ' (expected)'}</div>
        </div>
        {(approved || refinanced) && !voided && <LateFeeBreakdown status={status} cur={cur} />}
      </section>
      <section className="card">
        <h2>{t('payments')}</h2>
        <div className="list" style={{ marginTop: 6 }}>
          {[...payments, ...v.voided].sort((x, y) => (x.paid_on === y.paid_on ? y.id - x.id : x.paid_on < y.paid_on ? 1 : -1)).map((p) => {
            const gone = !!p.voided_at
            return (
              <div className="item" style={{ cursor: 'default', opacity: gone ? 0.65 : 1 }} key={p.id}>
                <span className="grow">
                  <b style={gone ? { textDecoration: 'line-through' } : undefined}>{fmtD(p.paid_on)}{p.late_fee > 0 || p.late_fee_waived > 0 ? ' · Late fee' : ''}{isEarlyPayoff(p) ? ' · Early payoff' : ''}</b>
                  {!gone && balanceLine(p.id) && <span className="small muted" style={{ display: 'block' }}>{balanceLine(p.id)}</span>}
                  {gone
                    ? <span className="small muted" style={{ display: 'block' }}>Voided {fmtD(p.voided_at?.slice(0, 10))}{who(p.voided_by) ? ` by ${who(p.voided_by)}` : ''}: {p.void_reason}</span>
                    : (p.late_fee_waived > 0 || p.note || (p.prepay_fee ?? 0) > 0) && <span className="small muted" style={{ display: 'block' }}>{[p.late_fee_waived > 0 ? `${fmt(p.late_fee_waived, cur)} forgiven` : '', (p.prepay_fee ?? 0) > 0 ? `incl. ${fmt(p.prepay_fee ?? 0, cur)} prepayment fee` : '', (p.prepay_fee_waived ?? 0) > 0 ? `${fmt(p.prepay_fee_waived ?? 0, cur)} fee waived: ${p.waive_reason}` : '', isEarlyPayoff(p) ? '' : p.note].filter(Boolean).join(' · ')}</span>}
                </span>
                {!gone && p.photo_path && <FileView path={p.photo_path} label="Photo" />}
                <b className={'num' + (gone ? '' : ' in')} style={gone ? { textDecoration: 'line-through' } : undefined}>{!gone && p.amount > 0 ? '+' : ''}{fmt(p.amount, cur)}</b>
                {canVoidPay && !gone && !isPayoff(p) && <button type="button" className="icon-btn" style={{ width: 34, height: 34 }} aria-label="Void payment" title="Void payment" onClick={() => { setReason(''); setPayTarget({ p, restore: false }) }}><Icon name="trash" size={17} /></button>}
                {canVoidPay && gone && <button type="button" className="icon-btn" style={{ width: 34, height: 34 }} aria-label="Restore payment" title="Restore payment" onClick={() => setPayTarget({ p, restore: true })}><Icon name="refresh" size={17} /></button>}
              </div>
            )
          })}
          {!payments.length && !v.voided.length && <p className="muted">No payments yet.</p>}
        </div>
      </section>
      </>}
      {tab === 'schedule' && <>
      <section className="card">
        <h2>{t('schedule')}</h2>
        <div className="sched">
          {status.rows.map((r) => {
            const late = r.state === 'overdue'
            const chip = r.state === 'paid' ? <span className="chip approved">Paid</span>
              : late ? <span className="chip overdue">{r.lateDays}d late</span>
              : r.state === 'partial' ? <span className="chip requested">Partial</span>
              : <span className="chip requested">Pending</span>
            return (
              <details className={'srow' + (late ? ' late' : '')} key={r.i}>
                <summary>
                  <span className="grow"><b>#{r.i}</b> <span className="muted">· {fmtD(r.due)}</span></span>
                  <b className="num">{fmt(r.total, cur)}</b>
                  {r.state === 'paid'
                    ? <span className="cta done" aria-label="Paid">✓</span>
                    : approved && !voided && can('payments.record') && (
                      <button type="button" className="cta" aria-label={`Collect installment ${r.i}`} onClick={(e) => { e.preventDefault(); nav(`/cashflow/pay?loan=${loan.id}`) }}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="12" rx="2" /><circle cx="12" cy="13" r="2.5" /><path d="M7 7V5h10v2" /></svg>
                      </button>
                    )}
                  <span className="chev" aria-hidden="true">▾</span>
                </summary>
                <div className="sdetail">
                  <div className="row between"><span className="muted small">Status</span>{chip}</div>
                  <div className="calc num">
                    <div><span>Principal</span><b>{fmt(r.principal, cur)}</b></div>
                    <div><span>Interest ({loan.rate_pct}% {loan.rate_basis}, flat)</span><b>{fmt(r.interest, cur)}</b></div>
                    {r.lateFee > 0 && <div className="tag-late"><span>Late fee ({r.lateOccurrences} × {lateRate})</span><b>{fmt(r.lateFee, cur)}</b></div>}
                    <div className="t"><span>Total</span><b>{fmt(r.total + r.lateFee, cur)}</b></div>
                  </div>
                </div>
              </details>
            )
          })}
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>Late fee: {lateRate} of the unpaid principal, for every {lateUnit} a payment is late, as agreed in this contract.</p>
      </section>
      </>}
      {tab === 'contract' && <>
      <section className="card">
        <h2>Loan information</h2>
        <div className="kv one" style={{ marginTop: 10 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <span className="eyebrow">Workflow</span>
            <div className="people">
              {([['Created by', who(loan.requested_by)], ['Approved', who(loan.approved_by)]] as const).map(([k, p]) => (
                <div key={k} className={'person' + (p ? '' : ' empty')}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-4 3-6 7-6s7 2 7 6" /></svg>
                  <span className="muted">{k}</span><b>{p ?? 'Pending'}</b>
                </div>
              ))}
            </div>
          </div>
          <div><span className="eyebrow">Released</span>{fmtD(loan.release_date)} · service fee {loan.fee_pct}% ({fmt(fee, cur)}), borrower receives {fmt(net, cur)}</div>
          <div><span className="eyebrow">Repayment</span>{loan.frequency === 'custom' ? `${loan.occurrences} payments every ${loan.interval_days} days` : `${loan.occurrences} ${loan.frequency} payments`} of {loan.mode === 'equal' ? 'interest and principal' : 'interest, principal paid at the end'}</div>
          <div><span className="eyebrow">Interest</span>{loan.rate_pct}% per {loan.rate_basis} (flat) · effective {(effectiveRate(terms) * 100).toFixed(1)}% a year</div>
          <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'row', gap: 16 }}>
            {([
              ['Supervisor', who(loan.supervisor_id), !scoped && can('loans.approve') && !voided, 'supervisor'],
              ['Collector', who(loan.collector_id), can('loans.approve') && !voided, 'collector'],
            ] as const).map(([k, p, canEdit, dlg]) => (
              <div key={k} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}><span className="eyebrow">{k}</span><span className="ell" style={{ display: 'block' }}>{p ?? 'Not assigned'}</span></div>
                {canEdit && (
                  <button type="button" className="mcta" style={{ background: 'none', border: 0, cursor: 'pointer' }} aria-label={`Change ${k.toLowerCase()}`} title={`Change ${k.toLowerCase()}`} onClick={() => setDialog(dlg)}>
                    <Icon name="edit" size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div><span className="eyebrow">Late fee</span>{lateRate} per late {lateUnit}{lateExtra}</div>
          <div><span className="eyebrow">Borrower pays by</span>{payText}</div>
          <div><span className="eyebrow">Collateral</span>{collaterals.length ? collaterals.map((c) => c.description).join(', ') : 'None'}</div>
        </div>      </section>
      <Link className="item" to={`/loans/${loan.id}/contract`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <span className="tic in"><Icon name="doc" size={17} /></span>
        <span className="grow"><b className="ell" style={{ display: 'block' }}>Contract</b><span className="small muted">Make the printable contract (PDF)</span></span>
        <Icon name="chev" size={16} />
      </Link>
      <section className="card">
        <div className="row between">
          <h2>Attachments</h2>
          {can('loans.create') && <label className="btn sm" style={{ cursor: 'pointer' }}>+ Add<input type="file" accept="image/*,application/pdf" multiple hidden onChange={attach} /></label>}
        </div>
        <div className="att">
          {attachments.map((a) => {
            const col = collaterals.find((c) => c.id === a.collateral_id)
            return (
              <div className="afile" key={a.id}>
                <span className="aico">{/\.pdf$/i.test(a.file_name || a.file_path) ? '▤' : '▣'}</span>
                <span className="grow">
                  <b className="ell" style={{ display: 'block' }}>{col ? 'Collateral: ' + col.description : 'Attachment'}</b>
                  <span className="small muted ell" style={{ display: 'block' }}>{a.file_name || a.file_path.split('/').pop()}</span>
                </span>
                <FileView path={a.file_path} />
              </div>
            )
          })}
          {!attachments.length && <p className="muted">No attachments yet.</p>}
        </div>
      </section>
      </>}
      {tab === 'insight' && isAdmin && <>
        <Insight items={findings(v, views, gain, books.data)} borrowerName={name} />
      <section className="card">
        <h2>{t('summary')}</h2>
        <div className="tblwrap">
          <table className="num">
            <thead><tr><th>{t('desc')}</th><th className="r">{t('in')}</th><th className="r">{t('out')}</th></tr></thead>
            <tbody>
              <tr><td>{t('loaned')}</td><td /><td className="r out">{fmt(loan.amount, cur)}</td></tr>
              <tr><td>{t('fee')} ({loan.fee_pct}%)</td><td className="r in">{fmt(fee, cur)}</td><td /></tr>
              <tr><td>{t('collected')}</td><td className="r in">{fmt(collected, cur)}</td><td /></tr>
              {status.lateFeePaid > 0 && <tr><td>Late fees</td><td className="r in">{fmt(status.lateFeePaid, cur)}</td><td /></tr>}
              {status.prepayFeePaid > 0 && <tr><td>Prepayment fee</td><td className="r in">{fmt(status.prepayFeePaid, cur)}</td><td /></tr>}
              <tr className="sum"><td>{t('balance')}</td><td colSpan={2} className={'r ' + (fee + collected + status.lateFeePaid + status.prepayFeePaid - loan.amount < 0 ? 'out' : 'in')}>{fmt(fee + collected + status.lateFeePaid + status.prepayFeePaid - loan.amount, cur)}</td></tr>
              <tr className="gap"><td colSpan={3} /></tr>
              <tr><td>{t('tbc')}</td><td className="r in">{fmt(refinanced || paidEarly ? 0 : status.remaining, cur)}</td><td /></tr>
              <tr className="sum"><td>{t('ugl')}</td><td colSpan={2} className={'r ' + (gain < 0 ? 'out' : 'in')}>{gain >= 0 ? '+' : ''}{fmt(gain, cur)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>Service fee is deducted at release: borrower receives {fmt(net, cur)}.</p>
      </section>
      </>}

      {canApprove && (
        <>
          <div style={{ height: 72 }} aria-hidden="true" />
          {createPortal(
            <div className="fbar" role="group" aria-label="Approval">
              <button type="button" className="btn danger" onClick={() => { setReason(''); setDialog('reject') }}>Deny</button>
              <button type="button" className="btn primary" onClick={() => setDialog('approve')}>Approve</button>
            </div>,
            document.body,
          )}
        </>
      )}

      {payTarget && (
        <Sheet title={payTarget.restore ? 'Restore this payment?' : 'Void this payment?'} onClose={() => setPayTarget(null)} action={{
          label: payTarget.restore ? 'Restore payment' : 'Void payment', cls: payTarget.restore ? undefined : 'danger', disabled: !payTarget.restore && !reason.trim(),
          onClick: async () => {
            try { await voidPay.mutateAsync({ id: payTarget.p.id, reason: payTarget.restore ? null : reason.trim() }); toast(payTarget.restore ? 'Payment restored' : 'Payment voided'); setPayTarget(null) } catch (e) { toast(errMsg(e)) }
          },
        }}>
          <p style={{ margin: '0 0 10px' }}>
            {payTarget.restore ? 'It counts again: the balance and the schedule go back to include it.' : <>The {fmt(payTarget.p.amount, cur)} payment of {fmtD(payTarget.p.paid_on)} stops counting: the balance, the schedule and the cashflow are recalculated without it. It stays on record.</>}
          </p>
          {!payTarget.restore && <TextArea id="vpr" label="Reason (required)" value={reason} onChange={setReason} />}
        </Sheet>
      )}
      {dialog === 'writeoff' && (
        <Sheet title="Write off this loan?" onClose={() => setDialog(null)} action={{
          label: 'Write off', cls: 'danger', disabled: !reason.trim(),
          onClick: async () => { try { await actions.writeOff(loan.id, reason.trim()); toast('Loan written off'); setDialog(null) } catch (e) { toast(errMsg(e)) } },
        }}>
          <p style={{ margin: '0 0 10px' }}>Give up collecting <b>{loanCode(loan.id)}</b> ({name}). {fmt(status.remainingPrincipal, cur)} of principal is still owed. The loan stays on record and in the portfolio and risk figures, and anything the borrower pays later is recorded as a recovery. You can reverse it.</p>
          <TextArea id="wor" label="Reason (required)" value={reason} onChange={setReason} />
        </Sheet>
      )}
      {dialog === 'unwriteoff' && (
        <Sheet title="Reverse the write-off?" onClose={() => setDialog(null)} action={{
          label: 'Reverse write-off', disabled: !reason.trim(),
          onClick: async () => { try { await actions.reverseWriteOff(loan.id, reason.trim()); toast('Write-off reversed'); setDialog(null) } catch (e) { toast(errMsg(e)) } },
        }}>
          <p style={{ margin: '0 0 10px' }}>{loanCode(loan.id)} goes back to being an ordinary loan. Recoveries already recorded stay as they are.</p>
          <TextArea id="uwr" label="Reason (required)" value={reason} onChange={setReason} />
        </Sheet>
      )}
      {dialog === 'early' && <EarlyPayoff view={v} onClose={() => setDialog(null)} />}
      {dialog === 'latefee' && <CollectLateFee view={v} onClose={() => setDialog(null)} />}
      {dialog === 'void' && (
        <Sheet title="Void this loan?" onClose={() => setDialog(null)} action={{
          label: 'Void loan', cls: 'danger', disabled: !reason.trim(),
          onClick: async () => {
            try { await actions.voidLoan(loan.id, reason.trim()); toast('Loan voided'); setDialog(null); nav('/loans', { replace: true }) } catch (e) { toast(errMsg(e)) }
          },
        }}>
          <p style={{ margin: '0 0 10px' }}>Voiding <b>{loanCode(loan.id)}</b> ({name}) hides it from everyone, including its payments, and removes it from every total and report. {loan.refinance_of && loan.status === 'approved' ? <>It refinanced <b>{loanCode(loan.refinance_of)}</b>, so voiding it reverses that: the payoff on {loanCode(loan.refinance_of)} is voided and its installments open again. This is only possible while this loan has no payments, and it cannot be restored afterwards.</> : 'It stays on record and you can restore it later.'}</p>
          <TextArea id="vr" label="Reason (required)" value={reason} onChange={setReason} />
        </Sheet>
      )}
      {dialog === 'restore' && (
        <Sheet title="Restore this loan?" onClose={() => setDialog(null)} action={{
          label: 'Restore loan',
          onClick: async () => { try { await actions.restoreLoan(loan.id); toast('Loan restored'); setDialog(null) } catch (e) { toast(errMsg(e)) } },
        }}>
          <p style={{ margin: '0 0 6px' }}>Show <b>{loanCode(loan.id)}</b> again in lists and totals?</p>
        </Sheet>
      )}

      {dialog === 'submit' && (
        <Sheet title="Submit loan request?" onClose={() => setDialog(null)} action={{ label: 'Confirm and submit', onClick: move('requested', 'Loan request submitted') }}>
          <p style={{ margin: '0 0 6px' }}>Submit <b>{loanCode(loan.id)}</b> for <b>{name}</b>? It will then wait for approval and can no longer be edited.</p>
        </Sheet>
      )}
      {dialog === 'return' && (
        <Sheet title="Draft?" onClose={() => setDialog(null)} action={{
          label: 'Draft',
          onClick: async () => { try { await actions.setStatus(loan.id, loan.status, 'drafted'); toast('Loan is a draft again'); nav('/loans', { replace: true }) } catch (e) { toast(errMsg(e)) } },
        }}>
          <p style={{ margin: '0 0 6px' }}>Move <b>{loanCode(loan.id)}</b> for <b>{name}</b> back to a draft so it can be edited? It is private to the person who created it until it is requested again.</p>
        </Sheet>
      )}
      {dialog === 'reset' && (
        <Sheet title="Reset approval?" onClose={() => setDialog(null)} action={{ label: 'Reset approval', onClick: move('requested', 'Approval reset. The loan is requested again') }}>
          <p style={{ margin: '0 0 6px' }}>Take back the approval of <b>{loanCode(loan.id)}</b> for <b>{name}</b>? It goes back to requested and has to be approved again. This is only possible before any payment is recorded.</p>
        </Sheet>
      )}
      {dialog === 'delete' && (
        <Sheet title="Delete draft?" onClose={() => setDialog(null)} action={{
          label: 'Delete draft', cls: 'danger',
          onClick: async () => { try { await actions.deleteDraft(loan.id); toast('Draft deleted'); nav('/loans', { replace: true }) } catch (e) { toast(errMsg(e)) } },
        }}>
          <p style={{ margin: '0 0 6px' }}>Delete the draft <b>{loanCode(loan.id)}</b> for <b>{name}</b>? This cannot be undone.</p>
        </Sheet>
      )}
      {dialog === 'approve' && (
        <Sheet title="Approve loan?" onClose={() => setDialog(null)} action={{ label: 'Confirm approve', onClick: move('approved', 'Loan approved') }}>
          <p style={{ margin: '0 0 6px' }}>Approve <b>{loanCode(loan.id)}</b> for <b>{name}</b>? <b>{fmt(net, cur)}</b> is released on <b>{fmtD(loan.release_date)}</b> after the service fee.</p>
        </Sheet>
      )}
      {dialog === 'reject' && (
        <Sheet title="Deny loan?" onClose={() => setDialog(null)} action={{ label: 'Confirm deny', cls: 'danger', disabled: !reason.trim(), onClick: async () => { try { await actions.setStatus(loan.id, loan.status, 'rejected', { reject_reason: reason.trim() }); toast('Loan denied'); setDialog(null) } catch (e) { toast(errMsg(e)) } } }}>
          <p style={{ margin: '0 0 6px' }}>Deny <b>{loanCode(loan.id)}</b> for <b>{name}</b>? It can be returned to a draft and edited afterwards.</p>
          <TextArea id="dr" label="Reason (required)" value={reason} onChange={setReason} />
        </Sheet>
      )}
      {dialog === 'collector' && <SupervisorSheet kind="collector" loanId={loan.id} current={loan.collector_id} onClose={() => setDialog(null)} />}
      {dialog === 'supervisor' && <SupervisorSheet loanId={loan.id} current={loan.supervisor_id} onClose={() => setDialog(null)} />}
    </>
  )
}
