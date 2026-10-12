import { Fragment, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { TextArea } from '../ui/Controls'
import { useToast } from '../ui/Toast'
import { usePageTitle } from '../app/Layout'
import { useAuth } from '../app/auth'
import { useI18n } from '../app/i18n'
import { dn, useBanks, useTeam } from '../data/core'
import { bname } from '../data/borrowers'
import { errMsg, useLoanActions, useLoanFiles, useLoans } from '../data/loans'
import { loanTotals } from '../lib/calc'
import { dueParts } from '../data/money'
import { fmt, fmtD, loanCode } from '../lib/format'
import type { LoanStatus } from '../lib/types'
import { FileView } from './loans/FileView'
import { Bar, Ring } from './loans/parts'
import { SupervisorSheet } from './loans/SupervisorSheet'

const STEPS: LoanStatus[] = ['drafted', 'requested', 'approved']
type Dialog = 'submit' | 'delete' | 'return' | 'reset' | 'approve' | 'reject' | 'supervisor' | 'collector' | 'void' | 'restore' | null

export function LoanDetail() {
  const loanId = Number(useParams().id)
  const { t, lang } = useI18n()
  const { can, scoped, me } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const { views, voidedViews, loading, error } = useLoans()
  const team = useTeam()
  const banks = useBanks()
  const files = useLoanFiles(loanId)
  const actions = useLoanActions()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [reason, setReason] = useState('')
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
  const gain = fee + status.total - loan.amount
  const bank = (banks.data ?? []).find((b) => b.id === loan.bank_account_id)
  const payText = loan.pay_method === 'bank' ? 'Bank' + (bank ? ` · ${bank.bank} ${bank.account_no}` : '')
    : loan.pay_method === 'other' ? 'Other' + (loan.pay_remarks ? ` · ${loan.pay_remarks}` : '') : 'Cash'
  const collaterals = files.data?.collaterals ?? []
  const attachments = files.data?.attachments ?? []
  const voided = !!loan.voided_at
  const mine = loan.status === 'drafted' && loan.requested_by === me?.id && can('loans.create')
  const canApprove = !voided && loan.status === 'requested' && can('loans.approve')
  const canReturn = !voided && (loan.status === 'requested' || loan.status === 'rejected') && (can('loans.create') || can('loans.approve'))
  const canVoid = !voided && can('loans.void')
  const canReset = !voided && loan.status === 'approved' && can('loans.approve') && payments.length === 0
  const next = approved && !voided ? status.rows.find((r) => r.state !== 'paid') : undefined
  const phone = (borrower?.phone ?? '').replace(/[^\d+]/g, '')
  const pct = Math.round((status.paidCount / loan.occurrences) * 100)
  const lateRate = `${Number(loan.late_fee_pct)}%`
  const lateUnit = loan.frequency === 'daily' ? 'day' : loan.frequency === 'weekly' ? 'week' : loan.frequency === 'monthly' ? 'month' : `${loan.interval_days}-day period`
  const end = status.done ? status.rows[status.rows.length - 1].paidOn : status.rows[status.rows.length - 1].due

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
        <div className="row between" style={{ flexWrap: 'wrap' }}>
          <div><div className="eyebrow">{loanCode(loan.id)}</div><h1>{name}</h1></div>
          <b className="num" style={{ fontSize: 20, fontFamily: 'var(--display)' }}>{fmt(loan.amount, cur)}</b>
        </div>
        {loan.status === 'rejected'
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
        {(mine || canReturn || canReset || canVoid) && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {mine && (
              <>
                <button type="button" className="btn primary" onClick={() => setDialog('submit')}>Submit request</button>
                <button type="button" className="btn" onClick={() => nav(`/loans/new?draft=${loan.id}`)}>Edit draft</button>
                <button type="button" className="btn danger" onClick={() => setDialog('delete')}>Delete draft</button>
              </>
            )}
            {canReturn && <button type="button" className="btn" onClick={() => setDialog('return')}>Draft</button>}
            {canReset && <button type="button" className="btn" onClick={() => setDialog('reset')}>Reset approval</button>}
            {canVoid && <button type="button" className="btn danger" onClick={() => { setReason(''); setDialog('void') }}>Void</button>}
          </div>
        )}
        <div className="kv one" style={{ marginTop: 14 }}>
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
          <div><span className="eyebrow">Repayment</span>{loan.frequency === 'custom' ? `Every ${loan.interval_days} days` : loan.frequency} × {loan.occurrences} · {loan.mode === 'equal' ? 'interest + principal ÷ n' : 'interest only, principal at end'}</div>
          <div><span className="eyebrow">Interest</span>{loan.rate_pct}% per {loan.rate_basis} (flat)</div>
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: 16 }}>
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
          <div><span className="eyebrow">Late fee</span>{lateRate} per late {lateUnit}</div>
          <div><span className="eyebrow">Borrower pays by</span>{payText}</div>
          <div><span className="eyebrow">Collateral</span>{collaterals.length ? collaterals.map((c) => c.description).join(', ') : 'None'}</div>
        </div>
      </section>

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
            {can('loans.void') && <button type="button" className="btn" onClick={() => setDialog('restore')}><Icon name="refresh" size={17} />Restore loan</button>}
          </div>
        </section>
      )}

      <Link className="item" to={`/loans/${loan.id}/contract`} style={{ textDecoration: 'none' }}>
        <span className="tic in"><Icon name="doc" size={17} /></span>
        <span className="grow"><b className="ell" style={{ display: 'block' }}>Contract</b><span className="small muted">Make the printable contract (PDF)</span></span>
        <Icon name="chev" size={16} />
      </Link>

      {next && (
        <section className="card">
          <div className="eyebrow">Next installment</div>
          <div className="row between" style={{ alignItems: 'center', margin: '4px 0' }}>
            <b className="num" style={{ fontSize: 18 }}>#{next.i} · {fmt(dueParts(next).remaining + next.lateFee, cur)}</b>
            <span className={'chip ' + (next.state === 'overdue' ? 'overdue' : '')}>{next.state === 'overdue' ? `${next.lateDays}d late` : fmtD(next.due)}</span>
          </div>
          {next.lateFee > 0 && <p className="small muted" style={{ margin: 0 }}>Includes a late fee of {fmt(next.lateFee, cur)} ({next.lateOccurrences} × {lateRate}).</p>}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {can('payments.record') && <button type="button" className="btn primary" onClick={() => nav(`/cashflow/pay?loan=${loan.id}`)}>Record payment</button>}
            {phone && <a className="btn" href={'tel:' + phone}><Icon name="phone" size={16} />Call</a>}
          </div>
        </section>
      )}
      <details className="card sec">
        <summary><h2>Attachments</h2><span className="chev" aria-hidden="true">▾</span></summary>
        {can('loans.create') && (
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <label className="btn sm" style={{ cursor: 'pointer' }}>+ Add<input type="file" accept="image/*,application/pdf" multiple hidden onChange={attach} /></label>
          </div>
        )}
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
      </details>

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
        <div className="tblwrap" style={{ marginTop: 14 }}>
          <table className="num"><tbody>
            <tr><td>{t('loaned')}</td><td className="r"><b>{fmt(loan.amount, cur)}</b></td></tr>
            <tr><td>{t('collected')}</td><td className="r in"><b>{fmt(collected, cur)}</b></td></tr>
            <tr><td>{t('remaining')}</td><td className="r"><b>{fmt(status.remaining, cur)}</b></td></tr>
            {approved && status.lateFeeOutstanding > 0 && <tr><td>Late fee due</td><td className="r out"><b>{fmt(status.lateFeeOutstanding, cur)}</b></td></tr>}
          </tbody></table>
        </div>
        <div className="kv" style={{ marginTop: 14 }}>
          <div><span className="eyebrow">{t('start')}</span>{fmtD(loan.release_date)}</div>
          <div><span className="eyebrow">{t('end')}</span>{fmtD(end)}{status.done ? '' : ' (expected)'}</div>
        </div>
      </section>

      <details className="card sec">
        <summary><h2>{t('summary')}</h2><span className="chev" aria-hidden="true">▾</span></summary>
        <div className="tblwrap">
          <table className="num">
            <thead><tr><th>{t('desc')}</th><th className="r">{t('in')}</th><th className="r">{t('out')}</th></tr></thead>
            <tbody>
              <tr><td>{t('loaned')}</td><td /><td className="r out">{fmt(loan.amount, cur)}</td></tr>
              <tr><td>{t('fee')} ({loan.fee_pct}%)</td><td className="r in">{fmt(fee, cur)}</td><td /></tr>
              <tr><td>{t('collected')}</td><td className="r in">{fmt(collected, cur)}</td><td /></tr>
              {status.lateFeePaid > 0 && <tr><td>Late fees</td><td className="r in">{fmt(status.lateFeePaid, cur)}</td><td /></tr>}
              <tr className="sum"><td>{t('balance')}</td><td colSpan={2} className={'r ' + (fee + collected + status.lateFeePaid - loan.amount < 0 ? 'out' : 'in')}>{fmt(fee + collected + status.lateFeePaid - loan.amount, cur)}</td></tr>
              <tr className="gap"><td colSpan={3} /></tr>
              <tr><td>{t('tbc')}</td><td className="r in">{fmt(status.remaining, cur)}</td><td /></tr>
              <tr className="sum"><td>{t('ugl')}</td><td colSpan={2} className={'r ' + (gain < 0 ? 'out' : 'in')}>{gain >= 0 ? '+' : ''}{fmt(gain, cur)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>Service fee is deducted at release: borrower receives {fmt(net, cur)}.</p>
      </details>

      <details className="card sec">
        <summary><h2>{t('schedule')}</h2><span className="chev" aria-hidden="true">▾</span></summary>
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
        <p className="small muted" style={{ margin: '8px 0 0' }}>Late fee: {lateRate} of the unpaid installment for every {lateUnit} it is late, as agreed in this contract.</p>
      </details>

      <details className="card sec">
        <summary><h2>{t('payments')}</h2><span className="chev" aria-hidden="true">▾</span></summary>
        {approved && !voided && can('payments.record') && (
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn primary sm" onClick={() => nav(`/cashflow/pay?loan=${loan.id}`)}>+ {t('record')}</button>
          </div>
        )}
        <div className="list" style={{ marginTop: 6 }}>
          {[...payments].reverse().map((p) => (
            <div className="item" style={{ cursor: 'default' }} key={p.id}>
              <span className="grow">
                <b>{fmtD(p.paid_on)}</b>
                {(p.late_fee > 0 || p.note) && <span className="small muted" style={{ display: 'block' }}>{[p.late_fee > 0 ? `incl. ${fmt(p.late_fee, cur)} late fee` : '', p.note].filter(Boolean).join(' · ')}</span>}
              </span>
              {p.photo_path && <FileView path={p.photo_path} label="Photo" />}
              <b className="num in">+{fmt(p.amount, cur)}</b>
            </div>
          ))}
          {!payments.length && <p className="muted">No payments yet.</p>}
        </div>
      </details>

      {canApprove && (
        <>
          <div style={{ height: 72 }} aria-hidden="true" />
          <div className="fbar" role="group" aria-label="Approval">
            <button type="button" className="btn primary" onClick={() => setDialog('approve')}>Approve</button>
            <button type="button" className="btn danger" onClick={() => { setReason(''); setDialog('reject') }}>Deny</button>
          </div>
        </>
      )}

      {dialog === 'void' && (
        <Sheet title="Void this loan?" onClose={() => setDialog(null)} action={{
          label: 'Void loan', cls: 'danger', disabled: !reason.trim(),
          onClick: async () => {
            try { await actions.voidLoan(loan.id, reason.trim()); toast('Loan voided'); setDialog(null); nav('/loans', { replace: true }) } catch (e) { toast(errMsg(e)) }
          },
        }}>
          <p style={{ margin: '0 0 10px' }}>Voiding <b>{loanCode(loan.id)}</b> ({name}) hides it from everyone, including its payments, and removes it from every total and report. It stays on record and you can restore it later.</p>
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
