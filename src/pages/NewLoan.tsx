import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Choice, DateField, Dropdown, Field, Seg } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { usePageTitle } from '../app/Layout'
import { useAuth } from '../app/auth'
import { useI18n } from '../app/i18n'
import { useBook, useLateFeeDefault, useLoanViews } from '../data/book'
import { bname } from '../data/borrowers'
import { dn, useBanks, useSettings } from '../data/core'
import { useContractTemplates } from '../data/contract'
import { errMsg, payoffOf, useCollectors, useLoanActions, useSupervisors } from '../data/loans'
import { dayList, nextReleaseDates, previewLoan, todayIso, weekdayOf, type Currency, type LoanTerms, type PayMode, type RateBasis } from '../lib/calc'
import { fmt, fmtD, initials, loanCode } from '../lib/format'
import type { BankAccount, Loan } from '../lib/types'
import { borrowerStanding } from '../data/today'
import { TierChip } from './borrowers/parts'
import { BorrowerSheet } from './borrowers/BorrowerSheet'

type Freq = 'Daily' | 'Weekly' | 'Monthly' | 'Custom'
type Method = Loan['pay_method']
interface Collateral { key: string; desc: string; files: File[] }

const STEPS = ['Borrower', 'Amount', 'Terms', 'Payment', 'Review']
const FREQ: Record<Exclude<Freq, 'Custom'>, [number, string]> = { Daily: [1, 'day'], Weekly: [7, 'week'], Monthly: [30, 'month'] }
const BASIS = [{ value: 'month', label: 'per month' }, { value: 'occurrence', label: 'per occurrence' }, { value: 'contract', label: 'per contract period' }]
const MAX_OCCURRENCES = 1000
const NO_LOANS = { open: 0, late: 0 }

const num = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0
const group = (s: string) => { const d = s.replace(/\D/g, ''); return d ? Number(d).toLocaleString('en-US') : '' }
const bankLabel = (b: BankAccount) => `${b.bank} · ${b.account_no} · ${b.account_name}`

function Section({ title, step, onEdit, children }: { title: string; step: number; onEdit: (s: number) => void; children: React.ReactNode }) {
  return (
    <section className="wz-sec">
      <div className="row between"><h3 className="wz-cap">{title}</h3><button type="button" className="linkbtn" onClick={() => onEdit(step)}>Edit</button></div>
      {children}
    </section>
  )
}
const Tile = ({ k, v, cls = '', sub }: { k: string; v: string; cls?: string; sub?: string }) => (
  <div className={'bt wzt ' + cls}><span className="muted small">{k}</span><div><b className="num">{v || '—'}</b>{sub && <div className="muted small">{sub}</div>}</div></div>
)
const Line = ({ k, v }: { k: string; v: string }) => <div className="wz-r"><span>{k}</span><b>{v || '—'}</b></div>
const Lr = ({ k, v, cls = '' }: { k: string; v: string; cls?: string }) => <div className={'lr ' + cls}><span>{k}</span><b className="num">{v}</b></div>

export function NewLoan() {
  const { t, lang } = useI18n()
  const { can, me, scoped } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { data: book } = useBook()
  const { data: settings } = useSettings()
  const banks = useBanks().data ?? []
  const supervisors = useSupervisors()
  const collectors = useCollectors()
  const actions = useLoanActions()
  const draftId = Number(params.get('draft')) || null
  const { views } = useLoanViews()
  // refinancing: this loan pays off an ongoing one; the amount typed in is the new cash on top of its balance
  const [refiOf, setRefiOf] = useState<number | null>(Number(params.get('refinance')) || null)
  const refi = views.find((v) => v.loan.id === refiOf && v.active)
  usePageTitle(refiOf ? `Refinance ${loanCode(refiOf)}` : draftId ? 'Edit draft' : t('newLoan'))

  const [step, setStep] = useState(0)
  const [registering, setRegistering] = useState(false)
  const contractReady = (useContractTemplates().data ?? []).some((t) => t.kind === 'contract')
  const [dialog, setDialog] = useState<null | 'cancel' | 'submit'>(null)
  const [borrowerId, setBorrowerId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [currency, setCurrency] = useState<Currency>('KHR')
  const [amount, setAmount] = useState('1,000,000')
  const [fee, setFee] = useState<string | null>(null)
  const [releaseState, setRelease] = useState<string | null>(null)
  const [rate, setRate] = useState('17')
  const [basis, setBasis] = useState<RateBasis>('contract')
  const [occ, setOcc] = useState('60')
  const [freq, setFreq] = useState<Freq>('Daily')
  const [days, setDays] = useState('30')
  const [mode, setMode] = useState<PayMode>('equal')
  const [supervisor, setSupervisor] = useState('')
  const [collector, setCollector] = useState('')
  const [late, setLate] = useState<string | null>(null)
  const [grace, setGrace] = useState<string | null>(null)
  const [cap, setCap] = useState<string | null>(null)
  const [prepay, setPrepay] = useState<string | null>(null)
  const [method, setMethod] = useState<Method | null>(null)
  const [bankId, setBankId] = useState('')
  const [remarks, setRemarks] = useState('')
  const [hasCollateral, setHasCollateral] = useState(false)
  const [collaterals, setCollaterals] = useState<Collateral[]>([])
  const lateDefault = Number(useLateFeeDefault())

  // editing a draft: fill the form from the saved loan once
  const loaded = useRef(false)
  useEffect(() => {
    if (!book || !draftId || loaded.current) return
    const d = book.loans.find((x) => x.id === draftId && x.status === 'drafted')
    loaded.current = true
    if (!d) return
    const b = book.borrowers.find((x) => x.id === d.borrower_id)
    setBorrowerId(d.borrower_id); setQuery(b ? bname(b) : ''); setCurrency(d.currency)
    setRefiOf(d.refinance_of)
    setAmount(group(String(d.amount - (d.refinance_of ? Number(d.carried_amount ?? 0) : 0)))); setFee(String(d.fee_pct)); setRelease(d.release_date)
    setRate(String(d.rate_pct)); setBasis(d.rate_basis); setOcc(String(d.occurrences))
    setFreq(({ daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', custom: 'Custom' } as const)[d.frequency])
    setDays(String(d.interval_days)); setMode(d.mode); setSupervisor(d.supervisor_id ?? ''); setCollector(d.collector_id ?? '')
    setLate(String(d.late_fee_pct)); setGrace(String(d.late_grace_days ?? 0)); setCap(d.late_cap_pct != null ? String(d.late_cap_pct) : ''); setPrepay(String(d.prepay_fee_pct ?? 0)); setMethod(d.pay_method); setBankId(d.bank_account_id ? String(d.bank_account_id) : '')
    setRemarks(d.pay_remarks); setStep(4)
  }, [book, draftId])

  // refinancing: start from the old loan's borrower, currency and terms; the new cash starts at 0
  const refiLoaded = useRef(false)
  useEffect(() => {
    if (!refi || draftId || refiLoaded.current || !book) return
    refiLoaded.current = true
    const o = refi.loan
    const b = book.borrowers.find((x) => x.id === o.borrower_id)
    setBorrowerId(o.borrower_id); setQuery(b ? bname(b) : ''); setCurrency(o.currency); setAmount('0')
    setRate(String(o.rate_pct)); setBasis(o.rate_basis); setOcc(String(o.occurrences))
    setFreq(({ daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', custom: 'Custom' } as const)[o.frequency])
    setDays(String(o.interval_days)); setMode(o.mode); setSupervisor(o.supervisor_id ?? ''); setCollector(o.collector_id ?? '')
    setLate(String(o.late_fee_pct)); setGrace(String(o.late_grace_days ?? 0)); setCap(o.late_cap_pct != null ? String(o.late_cap_pct) : ''); setPrepay(String(o.prepay_fee_pct ?? 0)); setMethod(o.pay_method); setBankId(o.bank_account_id ? String(o.bank_account_id) : '')
    setRemarks(o.pay_remarks); setStep(1)
  }, [refi, draftId, book])

  // a borrower chosen on the borrower page: skip the first step
  const preselect = useRef(params.get('borrower'))
  useEffect(() => {
    if (!book || preselect.current === null) return
    const b = book.borrowers.find((x) => x.id === Number(preselect.current) && x.status === 'active')
    preselect.current = null
    if (b) { setBorrowerId(b.id); setQuery(bname(b)); setStep(1) }
  }, [book])
  useEffect(() => { document.getElementById('main')?.scrollTo({ top: 0 }) }, [step])

  if (!can('loans.create')) return <p className="muted">You are not allowed to request loans.</p>

  const borrower = book?.borrowers.find((b) => b.id === borrowerId)
  const standing = borrowerStanding(views)
  const stand = (id: number) => standing.get(id) ?? NO_LOANS
  const warnings: string[] = []
  if (borrower) {
    const { open, late } = stand(borrower.id)
    // the loan being refinanced is not "another" loan
    const others = open - (refi?.loan.borrower_id === borrower.id ? 1 : 0)
    if (borrower.tier === 'bad') warnings.push('Marked as a bad borrower')
    if (borrower.tier === 'banned') warnings.push('Marked as banned')
    if (others > 0) warnings.push(`Already has ${others} loan${others > 1 ? 's' : ''} in progress`)
    if (late > 0) warnings.push(`Late on a payment (${late} day${late > 1 ? 's' : ''} past due)`)
  }
  // money is released on the week days set in Settings: the date defaults to the next of them, others are allowed with a warning
  const releaseDays = settings?.release_weekdays ?? [3, 5]
  const releaseOptions = nextReleaseDates(releaseDays, todayIso(), 3)
  const release = releaseState ?? releaseOptions[0] ?? ''
  const offDay = !!release && !releaseDays.includes(weekdayOf(release))
  const feeText = fee ?? (settings ? String(Number(settings.service_fee_pct)) : '')
  const graceText = grace ?? String(settings?.late_grace_days ?? 0)
  const prepayText = prepay ?? String(settings?.prepay_fee_pct ?? 0)
  const capText = cap ?? (settings?.late_cap_pct != null ? String(settings.late_cap_pct) : '')
  const lateText = late ?? lateDefault.toLocaleString('en-US', { maximumFractionDigits: 2 })
  const effMethod: Method = method ?? (banks.length ? 'bank' : 'cash')
  const bank = banks.find((b) => String(b.id) === bankId) ?? banks[0]
  const khrPerUsd = Number(settings?.khr_per_usd) || 4000
  const sym = currency === 'USD' ? '$' : '៛'

  const n = Math.min(MAX_OCCURRENCES, Math.max(1, Math.round(num(occ)) || 1))
  const intervalDays = freq === 'Custom' ? Math.max(1, Math.round(num(days)) || 1) : FREQ[freq][0]
  const unit = freq === 'Custom' ? `${intervalDays} days` : FREQ[freq][1]
  // the old loan is paid off on this loan's release date, so its balance is taken as of that day
  const payoffDate = release && release > todayIso() ? release : todayIso()
  const payoff = refi ? payoffOf(refi, payoffDate) : null
  const carried = payoff?.total ?? 0
  const terms: LoanTerms = {
    amount: num(amount) + carried, carried, currency, feePct: num(feeText), ratePct: num(rate), rateBasis: basis, occurrences: n,
    frequency: freq.toLowerCase() as Loan['frequency'], intervalDays, mode, releaseDate: release || todayIso(), lateFeePct: num(lateText),
    lateGraceDays: Math.round(num(graceText)), lateCapPct: capText.trim() ? num(capText) : null,
  }
  const p = previewLoan(terms)
  const aprText = `${(p.apr * 100).toFixed(1)}% a year`
  const lateLabel = `${terms.lateFeePct}% per late ${freq === 'Custom' ? `${intervalDays}-day period` : freq === 'Daily' ? 'day' : freq === 'Weekly' ? 'week' : 'month'}`
    + (terms.lateGraceDays ? `, after ${terms.lateGraceDays} grace day${terms.lateGraceDays > 1 ? 's' : ''}` : '') + (terms.lateCapPct ? `, capped at ${terms.lateCapPct}% of the loan` : '')
  const equal = mode === 'equal'
  const first = p.rows[0]
  const installment = equal ? first.total : first.interest
  const feeLabel = `Service fee (${terms.feePct}%, deducted)`
  const collectorName = collector ? dn(collectors.find((s) => s.id === collector)) : 'Not assigned'
  const supervisorName = scoped ? dn(me) : supervisor ? dn(supervisors.find((s) => s.id === supervisor)) : 'Not assigned'
  const needle = query.trim().toLowerCase()
  const matches = (book?.borrowers ?? []).filter((b) => b.status === 'active' && (!needle || (b.name + b.name_km + b.phone + b.id_no).toLowerCase().includes(needle)))
  const collateralText = !hasCollateral ? 'None'
    : collaterals.map((c, i) => c.desc.trim() || 'Collateral ' + (i + 1)).join(', ') + (collaterals.length > 1 ? ` (${collaterals.length} items)` : '')
      + (collaterals.some((c) => c.files.length) ? ` · ${collaterals.reduce((s, c) => s + c.files.length, 0)} file(s)` : '')

  /** The message to show when a step is not ready, or null. */
  const problem = (s: number) => {
    if (s === 0 && !borrower) return 'Select a borrower first'
    if (refiOf && !refi) return 'The loan being refinanced is no longer open'
    if (s === 1 && !(terms.amount > 0)) return 'Enter a loan amount'
    if (s === 1 && !(terms.feePct >= 0 && terms.feePct < 100)) return 'The service fee must be between 0 and 100%'
    if (s === 1 && !release) return 'Choose a release date'
    if (s === 2 && (!(num(occ) >= 1) || num(occ) > MAX_OCCURRENCES || !(terms.ratePct >= 0))) return 'Check interest rate and occurrences'
    return null
  }
  const next = () => {
    const msg = problem(step)
    if (msg) { toast(msg); return }
    if (step === STEPS.length - 1) setDialog('submit')
    else setStep(step + 1)
  }

  const switchCurrency = (c: string) => {
    if (c === currency || refiOf) return
    const raw = Number(amount.replace(/\D/g, ''))
    if (c === 'USD' && raw >= 10000) setAmount(group(String(Math.round(raw / khrPerUsd))))
    else if (c === 'KHR' && raw > 0 && raw < 10000) setAmount(group(String(raw * khrPerUsd)))
    setCurrency(c as Currency)
    setLate(null)
  }
  const changeQuery = (v: string) => {
    setQuery(v)
    if (borrower && bname(borrower).toLowerCase() !== v.trim().toLowerCase()) setBorrowerId(null)
  }
  const stepOcc = (d: number) => setOcc(String(Math.min(MAX_OCCURRENCES, Math.max(1, (Math.round(num(occ)) || 1) + d))))
  const setCollateral = (key: string, patch: Partial<Collateral>) => setCollaterals((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  const newCollateral = (): Collateral => ({ key: crypto.randomUUID(), desc: '', files: [] })
  const toggleCollateral = (yes: boolean) => {
    setHasCollateral(yes)
    if (yes && !collaterals.length) setCollaterals([newCollateral()])
  }

  /** Saves the loan as a draft (kept private, can be edited) or submits it as a request. */
  const submit = async (asDraft = false) => {
    const failed = [0, 1, 2].map(problem).find(Boolean)
    if (failed || !borrower) { toast(failed ?? 'Select a borrower first'); setDialog(null); return }
    try {
      const input = {
        loan: {
          borrower_id: borrower.id, supervisor_id: scoped ? (me?.id ?? null) : supervisor || null, collector_id: collector || null, currency, amount: terms.amount,
          refinance_of: refi ? refi.loan.id : null, carried_amount: carried, carried_late_fee: payoff?.lateFee ?? 0,
          fee_pct: terms.feePct, late_fee_pct: terms.lateFeePct, late_grace_days: terms.lateGraceDays ?? 0, late_cap_pct: terms.lateCapPct ?? null, prepay_fee_pct: num(prepayText), rate_pct: terms.ratePct, rate_basis: basis,
          frequency: freq.toLowerCase() as Loan['frequency'], interval_days: intervalDays, occurrences: n, mode, release_date: terms.releaseDate,
          pay_method: effMethod, bank_account_id: effMethod === 'bank' && bank ? bank.id : null, pay_remarks: effMethod === 'other' ? remarks.trim() : '',
        },
        collaterals: hasCollateral ? collaterals.map((c, i) => ({ description: c.desc.trim() || 'Collateral ' + (i + 1), files: c.files })) : [],
      }
      let id: number
      let warning: string | null
      if (draftId) {
        ({ warning } = await actions.saveDraft(draftId, input))
        id = draftId
        if (!asDraft) await actions.setStatus(id, 'drafted', 'requested')
      } else {
        ({ id, warning } = await actions.create(input, asDraft))
      }
      const what = asDraft ? 'Draft saved' : 'Loan request submitted'
      toast(warning ? `${what}, but the collateral was not fully saved: ${warning}` : what)
      // a draft goes to its page; a request goes straight to the printable contract when a template is set up
      nav(contractReady && !asDraft ? `/loans/${id}/contract` : `/loans/${id}`, { replace: true })
    } catch (e) {
      toast(errMsg(e))
    }
  }

  const breakdown = (
    <div className="ls-t">
      {refi && <Lr k={`Carried over from ${loanCode(refi.loan.id)}`} v={fmt(carried, currency)} />}
      {refi && <Lr k="New cash" v={fmt(terms.amount - carried, currency)} cls="sub" />}
      <Lr k="Loan amount" v={fmt(terms.amount, currency)} />
      <Lr k={feeLabel} v={'−' + fmt(p.fee, currency)} />
      <Lr k="Borrower receives" v={fmt(p.net, currency)} cls="strong" />
      <Lr k={`Total interest (~${p.interestPct}%)`} v={fmt(p.interest, currency)} />
      {equal ? (
        <>
          <Lr k="Installment" v={fmt(installment, currency)} />
          <Lr k="Principal" v={fmt(first.principal, currency)} cls="sub" />
          <Lr k="Interest" v={fmt(first.interest, currency)} cls="sub" />
        </>
      ) : (
        <>
          <Lr k="Interest payment" v={fmt(installment, currency)} />
          <Lr k="Principal due at the end" v={fmt(terms.amount, currency)} cls="sub" />
        </>
      )}
      <Lr k="Total to collect" v={fmt(p.total, currency)} cls="strong" />
    </div>
  )

  return (
    <div className="wz">
      <div className="wz-head"><b>Step {step + 1} of {STEPS.length}</b><span className="muted">{STEPS[step]}</span></div>
      <div className="wz-prog">{STEPS.map((s, i) => <i key={s} className={i <= step ? 'on' : ''} />)}</div>
      <form className="wz-body" onSubmit={(e) => e.preventDefault()}>
        {step === 0 && (
          <div className="wz-step">
            <h2>Who is borrowing?</h2>
            <p className="muted small">Search by name, phone or ID card number, or pick an active borrower.</p>
            <label className="wz-search"><Icon name="search" size={18} />
              <input id="lb" value={query} onChange={(e) => changeQuery(e.target.value)} placeholder="Search borrower…" autoComplete="off" aria-label="Search borrower" />
            </label>
            <div id="lbres">
              <h3 className="wz-cap">{needle ? 'Results' : 'Active borrowers'}</h3>
              {matches.map((b) => (
                <button type="button" key={b.id} className={'item' + (b.id === borrowerId ? ' sel' : '')} onClick={() => { setBorrowerId(b.id); setQuery(bname(b)); setStep(1) }}>
                  <span className="avatar">{initials(bname(b))}</span>
                  <span className="grow"><b>{bname(b, lang)}</b><span className="small muted" style={{ display: 'block' }}>{[b.phone, b.id_no].filter(Boolean).join(' · ')}</span></span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <TierChip tier={b.tier} />
                    {stand(b.id).open > 0 && <span className="small muted">{stand(b.id).open} in progress</span>}
                    {stand(b.id).late > 0 && <span className="small" style={{ color: 'var(--warn)' }}>Late {stand(b.id).late}d</span>}
                  </span>
                </button>
              ))}
              {!!matches.length && can('borrowers.edit') && (
                <button type="button" className="btn" style={{ width: '100%', marginTop: 10 }} onClick={() => setRegistering(true)}><Icon name="plus" size={17} />New borrower</button>
              )}
              {!matches.length && (book ? (
                <div className="lcard" style={{ padding: 20, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <span className="hb-ic"><Icon name="userp" size={22} /></span>
                  <b>{needle ? 'No borrower matches your search' : 'No borrowers yet'}</b>
                  <span className="small muted">{can('borrowers.edit') ? 'Register the borrower first, then pick them here.' : 'Ask someone with permission to register the borrower first.'}</span>
                  {can('borrowers.edit') && <button type="button" className="btn primary" onClick={() => setRegistering(true)}><Icon name="plus" size={17} />Register borrower</button>}
                </div>
              ) : <p className="muted">Loading…</p>)}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="wz-step">
            <h2>How much?</h2>
            {!!warnings.length && (
              <div className="small" role="alert" style={{ margin: '0 0 14px', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--warn)', color: 'var(--warn)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Icon name="alert" size={16} />
                <span><b>Check before you continue</b>{warnings.map((w) => <span key={w} style={{ display: 'block' }}>{w}</span>)}</span>
              </div>
            )}
            {refi && payoff && (
              <div className="card" style={{ margin: '0 0 14px' }}>
                <div className="eyebrow">Refinancing {loanCode(refi.loan.id)}</div>
                <b className="num" style={{ fontSize: 18 }}>{fmt(payoff.total, currency)} carried over</b>
                <p className="small muted" style={{ margin: '4px 0 0' }}>
                  What is due by the release date ({fmtD(payoffDate)}) plus the principal not yet due{payoff.lateFee > 0 ? `, including ${fmt(payoff.lateFee, currency)} late fee` : ''}.
                  Interest not yet due is dropped. When this loan is approved, {loanCode(refi.loan.id)} is paid off and closed.
                  No service fee is charged on the carried-over balance.
                </p>
              </div>
            )}
            <div className="form wz-1col">
              <div className="wz-amtrow">
                <div className="field">
                  <label htmlFor="la">{refi ? 'New cash to the borrower' : 'Loan amount'}</label>
                  <div className="wz-amt"><input id="la" inputMode="numeric" value={amount} onChange={(e) => setAmount(group(e.target.value))} autoComplete="off" /><span id="lsym">{sym}</span></div>
                </div>
                {!refi && <Seg id="lc" label="Currency" options={['KHR', 'USD']} value={currency} onChange={switchCurrency} />}
              </div>
              <div className="field">
                <label htmlFor="lf">Service fee (deducted upfront)</label>
                <div className="wz-amt"><input id="lf" inputMode="decimal" value={feeText} onChange={(e) => setFee(e.target.value)} autoComplete="off" /><span>%</span></div>
                <p className="small muted" id="lfeei">Service fee {fmt(p.fee, currency)} · borrower receives {fmt(p.net, currency)}</p>
              </div>
              <DateField id="lrd" label="Release date" value={release} onChange={setRelease} />
              {offDay && (
                <p className="small" role="alert" style={{ margin: '-4px 0 0', color: 'var(--warn)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <Icon name="alert" size={16} />
                  <span>Money is usually released on {dayList(releaseDays)}.</span>
                </p>
              )}
              <div className="wz-chips" role="group" aria-label="Release date choices">
                {releaseOptions.map((d) => <button type="button" key={d} className="wz-chip" aria-pressed={release === d} onClick={() => setRelease(d)}>{fmtD(d)}</button>)}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wz-step">
            <h2>Interest and repayment</h2>
            <div className="form wz-1col">
              <div className="field">
                <label htmlFor="lr">Interest rate</label>
                <div className="wz-amt"><input id="lr" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} autoComplete="off" /><span>%</span></div>
              </div>
              <Choice id="lbs" label="Interest applies" options={BASIS} value={basis} onChange={(v) => setBasis(v as RateBasis)} />
              <div className="field">
                <label htmlFor="ln">Number of occurrences</label>
                <div className="wz-stepper">
                  <button type="button" aria-label="Decrease" onClick={() => stepOcc(-1)}>−</button>
                  <input id="ln" inputMode="numeric" value={occ} onChange={(e) => setOcc(e.target.value.replace(/\D/g, ''))} autoComplete="off" />
                  <button type="button" aria-label="Increase" onClick={() => stepOcc(1)}>+</button>
                </div>
              </div>
              <Seg id="lfq" label="Payback frequency" options={['Daily', 'Weekly', 'Monthly', 'Custom']} value={freq} onChange={(v) => setFreq(v as Freq)} />
              {freq === 'Custom' && <Field id="ld" label="Days between payments" inputMode="decimal" value={days} onChange={setDays} />}
              <Seg id="lm" label="How they pay" options={[{ value: 'equal', label: 'Interest and principal' }, { value: 'interest', label: 'Interest only' }]} value={mode} onChange={(v) => setMode(v as PayMode)} />
              {scoped
                ? <div className="field"><label>Supervisor</label><p style={{ margin: 0 }}><b>{dn(me)}</b> <span className="muted small">(you)</span></p></div>
                : <Dropdown id="lsv" label="Supervisor" options={[{ value: '', label: 'Not assigned' }, ...supervisors.map((s) => ({ value: s.id, label: dn(s) }))]} value={supervisor} onChange={setSupervisor} />}
              <Dropdown id="lcl" label="Collector" options={[{ value: '', label: 'Not assigned' }, ...collectors.map((s) => ({ value: s.id, label: dn(s) }))]} value={collector} onChange={setCollector} />
              <div className="field">
                <label htmlFor="llf">Late fee (%)</label>
                <div className="wz-amt"><input id="llf" inputMode="decimal" value={lateText} onChange={(e) => setLate(e.target.value)} autoComplete="off" /><span id="llfs">%</span></div>
                <p className="small muted">Percent of the unpaid principal, charged for every payment period a payment is late. Defaults from Settings; change it for this contract.</p>
              </div>
              <div className="field">
                <label htmlFor="lgr">Grace days</label>
                <input id="lgr" inputMode="numeric" value={graceText} onChange={(e) => setGrace(e.target.value)} autoComplete="off" />
                <p className="small muted">A payment made within this many days after its due date is not late.</p>
              </div>
              <div className="field">
                <label htmlFor="lcp">Late fee cap (% of the loan)</label>
                <div className="wz-amt"><input id="lcp" inputMode="decimal" value={capText} onChange={(e) => setCap(e.target.value)} autoComplete="off" placeholder="No cap" /><span>%</span></div>
                <p className="small muted">The most late fee this loan can ever charge, as a % of the loan amount. Leave empty for no cap.</p>
              </div>
              <div className="field">
                <label htmlFor="lpf">Prepayment fee (%)</label>
                <div className="wz-amt"><input id="lpf" inputMode="decimal" value={prepayText} onChange={(e) => setPrepay(e.target.value)} autoComplete="off" /><span>%</span></div>
                <p className="small muted">If the borrower pays the loan off early they pay the unpaid principal plus this % of it, and no future interest. An admin can waive it.</p>
              </div>
            </div>
            <div className="wz-bento" id="linst">
              <div className="bt wzt inst wide">
                <span className="muted small">{equal ? 'Installment' : 'Interest payment'}</span>
                <div><b className="num">{fmt(installment, currency)}</b><div className="muted small">per {unit} × {n}</div></div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="wz-step">
            <h2>Payment and collateral</h2>
            <div className="form wz-1col">
              <Seg id="lpay" label="Borrower pays by" options={[{ value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank' }, { value: 'other', label: 'Other' }]} value={effMethod} onChange={(v) => setMethod(v as Method)} />
              {effMethod === 'bank' && (banks.length
                ? <Dropdown id="lba" label="Receiving bank account" options={banks.map((b) => ({ value: String(b.id), label: bankLabel(b) }))} value={String(bank?.id ?? '')} onChange={setBankId} />
                : <div className="field"><label>Receiving bank account</label><p className="muted small" style={{ margin: 0 }}>No bank account yet. Add one in Profile.</p></div>)}
              {effMethod === 'other' && (
                <div className="field">
                  <label htmlFor="lpr">Remarks</label>
                  <textarea id="lpr" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. paid through a relative, goods in kind…" />
                </div>
              )}
              <Seg id="lco" label="Collateral" options={['No', 'Yes']} value={hasCollateral ? 'Yes' : 'No'} onChange={(v) => toggleCollateral(v === 'Yes')} />
              {hasCollateral && (
                <div id="lcolwrap">
                  <div id="lcols">
                    {collaterals.map((c, i) => (
                      <div className="col-item" key={c.key}>
                        <div className="row between">
                          <b className="ct">Collateral {i + 1}</b>
                          {collaterals.length > 1 && <button type="button" className="linkbtn" onClick={() => setCollaterals((cs) => cs.filter((x) => x.key !== c.key))}>Remove</button>}
                        </div>
                        <Field id={'cd' + c.key} label="Description" placeholder="e.g. Motorbike, registration card" value={c.desc} onChange={(v) => setCollateral(c.key, { desc: v })} />
                        <div className="catt">
                          <span className="muted small">Attachments: documents or photos</span>
                          <div className="atl">
                            {c.files.map((f, j) => (
                              <span className="achip" key={j}>
                                <span className="ell">{f.name}</span>
                                <button type="button" aria-label={'Remove ' + f.name} onClick={() => setCollateral(c.key, { files: c.files.filter((_, k) => k !== j) })}>×</button>
                              </span>
                            ))}
                          </div>
                          <label className="btn sm" style={{ cursor: 'pointer' }}>
                            + Add files
                            <input type="file" accept="image/*,application/pdf" capture="environment" multiple hidden
                              onChange={(e) => { setCollateral(c.key, { files: [...c.files, ...Array.from(e.target.files ?? [])] }); e.target.value = '' }} />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="btn" style={{ width: '100%' }} onClick={() => setCollaterals((cs) => [...cs, newCollateral()])}>+ Add collateral</button>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="wz-step">
            <h2>Review and submit</h2>
            <div id="wzrev">
              {borrower && (
                <Section title="Borrower" step={0} onEdit={setStep}>
                  <section className="wz-sec">
                    <div className="wz-bor">
                      <span className="avatar xl">{initials(bname(borrower))}</span>
                      <div className="grow"><b style={{ fontSize: 18, display: 'block' }}>{bname(borrower, lang)}</b><TierChip tier={borrower.tier} /></div>
                    </div>
                  </section>
                </Section>
              )}
              <Section title="Loan" step={1} onEdit={setStep}>
                <div className="wz-bento">
                  <Tile k="Loan amount" v={fmt(terms.amount, currency)} cls="big" sub={refi ? `incl. ${fmt(carried, currency)} carried over from ${loanCode(refi.loan.id)}` : undefined} />
                  <Tile k={equal ? 'Installment' : 'Interest payment'} v={fmt(installment, currency)} cls="inst" sub={`per ${unit} × ${n}`} />
                  <Tile k="Release date" v={fmtD(release)} cls="wide" />
                  <Tile k="How they pay" v={equal ? 'Interest and principal' : 'Interest only'} cls="wide" />
                  <Tile k="Interest" v={terms.ratePct + '%'} sub={BASIS.find((b) => b.value === basis)?.label} />
                  <Tile k="Occurrences" v={String(n)} sub={freq === 'Custom' ? `Every ${intervalDays} days` : freq} />
                  <Tile k="Service fee" v={terms.feePct + '%'} />
                </div>
              </Section>
              <Section title="Late fee and people" step={2} onEdit={setStep}>
                <Line k="Effective annual rate (APR)" v={aprText} />
                <Line k="Late fee" v={lateLabel} />
                <Line k="Supervisor" v={supervisorName} />
                <Line k="Collector" v={collectorName} />
              </Section>
              <Section title="Payment and collateral" step={3} onEdit={setStep}>
                <Line k="Borrower pays by" v={effMethod === 'bank' ? 'Bank' + (bank ? ' · ' + bankLabel(bank) : '') : effMethod === 'other' ? 'Other' + (remarks.trim() ? ' · ' + remarks.trim() : '') : 'Cash'} />
                <Line k="Collateral" v={collateralText} />
              </Section>
              <section className="wz-sec"><h3 className="wz-cap">Loan breakdown</h3>{breakdown}</section>
            </div>
          </div>
        )}
      </form>
      <div className="wz-bar">
        {(() => {
          const first = step === 0 || (refiOf && step === 1)
          return (
            <button type="button" className="btn ico" aria-label={first ? t('cancel') : t('back')} title={first ? t('cancel') : t('back')}
              onClick={() => (first ? setDialog('cancel') : setStep(step - 1))}><Icon name={first ? 'x' : 'back'} size={22} /></button>
          )
        })()}
        {step === STEPS.length - 1 && (
          <button type="button" className="btn ico" aria-label="Save draft" title="Save draft"
            onClick={() => { const m = [0, 1, 2].map(problem).find(Boolean); if (m) toast(m); else void submit(true) }}><Icon name="save" size={22} /></button>
        )}
        {step === STEPS.length - 1
          ? <button type="button" className="btn primary wide" onClick={next}><Icon name="check" size={20} />Submit request</button>
          : <button type="button" className="btn primary wide" onClick={next}>Next<Icon name="chev" size={20} /></button>}
      </div>

      {dialog === 'cancel' && (
        <Sheet title="Cancel new loan?" onClose={() => setDialog(null)} action={{ label: 'Yes, cancel', onClick: () => nav('/loans') }}>
          <p style={{ margin: '0 0 6px' }}>Discard this loan request? Nothing you entered will be saved.</p>
        </Sheet>
      )}
      {dialog === 'submit' && borrower && (
        <Sheet title="Submit loan request?" onClose={() => setDialog(null)} action={{ label: 'Confirm and submit', onClick: () => submit() }}>
          <p style={{ margin: '0 0 6px' }}>Submit a loan request of <b>{fmt(terms.amount, currency)}</b> for <b>{bname(borrower, lang)}</b>? The borrower receives <b>{fmt(p.net, currency)}</b> after the service fee.</p>
        </Sheet>
      )}
      {registering && <BorrowerSheet onClose={() => setRegistering(false)} />}
    </div>
  )
}
