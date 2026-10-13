import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../../app/i18n'
import { Icon } from '../../ui/Icon'
import { Dropdown, DateField } from '../../ui/Controls'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { useBanks } from '../../data/core'
import { likeOf, type LoanView } from '../../data/book'
import { amountText, amountToText, borrowerName, dueParts, openLoans, parseAmount, symbol, useMoneyData, useRecordPayment } from '../../data/money'
import { allocatePayment, diffDays, todayIso } from '../../lib/calc'
import { useAuth } from '../../app/auth'
import { useSettings } from '../../data/core'
import { fmt, fmtD, initials, loanCode } from '../../lib/format'
import type { BankAccount } from '../../lib/types'

const STEPS = ['Contract', 'Payment', 'Review']
const CASH = 'Cash (no bank account)'
const bankLabel = (b: BankAccount) => `${b.bank} · ${b.account_no} · ${b.account_name}`

const nextRow = (v: LoanView) => v.status.rows.find((r) => r.state !== 'paid')
/** What the next installment still needs; late fee is collected separately. */
const owedNow = (v: LoanView) => {
  const r = nextRow(v)
  return r ? dueParts(r).remaining : 0
}

type Dialog = null | 'cancel' | 'confirm'

export function PayWizard() {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const toast = useToast()
  const { can } = useAuth()
  const settings = useSettings()
  const [params] = useSearchParams()
  const data = useMoneyData()
  const banks = useBanks()
  const rec = useRecordPayment()
  const open = useMemo(() => openLoans(data), [data])

  const first = Number(params.get('loan')) || null
  const [step, setStep] = useState(first ? 1 : 0)
  const [loanId, setLoanId] = useState<number | null>(first)
  const [q, setQ] = useState('')
  const [bank, setBank] = useState<string | null>(null)
  const [amount, setAmount] = useState<string | null>(null)
  const [paidOn, setPaidOn] = useState(todayIso())
  const [photo, setPhotoState] = useState<{ file: File; url: string } | null>(null)
  const urlRef = useRef<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])
  const setPhoto = (file: File | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = file ? URL.createObjectURL(file) : null
    setPhotoState(file && urlRef.current ? { file, url: urlRef.current } : null)
  }

  const view = open.find((v) => v.loan.id === loanId)
  const at = view ? step : 0
  const cur = view?.loan.currency ?? 'KHR'
  const history = useMemo(() => (view?.payments ?? []).map(likeOf), [view])
  const amountValue = amount ?? (view ? amountToText(owedNow(view), cur) : '')
  const bankValue = bank ?? (view?.loan.bank_account_id ? String(view.loan.bank_account_id) : '')
  const bankOptions = [{ value: '', label: CASH }, ...(banks.data ?? []).map((b) => ({ value: String(b.id), label: bankLabel(b) }))]
  const bankText = bankOptions.find((o) => o.value === bankValue)?.label ?? CASH
  const value = parseAmount(amountValue)

  const alloc = useMemo(() => {
    if (!view || !(value > 0)) return null
    return allocatePayment(view.terms, history, value, paidOn)
  }, [view, history, value, paidOn])

  const pick = (id: number) => {
    if (id !== loanId) { setPhoto(null); setAmount(null); setBank(null) }
    setLoanId(id)
    setStep(1)
  }

  const valid = (n: number) => {
    if (n === 0 && !view) { toast('Select a contract first'); return false }
    if (n === 1 && view) {
      if (!(value > 0)) { toast('Enter the amount received'); return false }
      if (value > view.status.remaining + 0.005) { toast(`More than the loan still owes (${fmt(view.status.remaining, cur)}). Hand the extra back to the borrower.`); return false }
      if (!paidOn) { toast('Select the date paid'); return false }
      if (paidOn > todayIso()) { toast('The payment date cannot be in the future'); return false }
      if (diffDays(paidOn, todayIso()) > (settings.data?.backdate_days ?? 7) && !can('payments.backdate')) { toast(`Payments can only be dated up to ${settings.data?.backdate_days ?? 7} days back. Ask an admin to record it.`); return false }
      if (paidOn < view.loan.release_date) { toast('The payment date is before the loan was released'); return false }
    }
    return true
  }

  const next = () => {
    if (!valid(at)) return
    if (at === STEPS.length - 1) setDialog('confirm')
    else setStep(at + 1)
  }
  const back = () => (at > 0 ? setStep(at - 1) : setDialog('cancel'))

  const submit = async () => {
    if (!view || !alloc) return
    try {
      await rec.mutateAsync({
        loan_id: view.loan.id, bank_account_id: bankValue ? Number(bankValue) : null, amount: value,
        late_fee: 0, late_fee_waived: 0, paid_on: paidOn, note: view.loan.written_off_at ? 'Recovery' : undefined, photo: photo?.file ?? null,
      })
      toast('Payment recorded')
      nav('/cashflow')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <div className="wz">
      <div className="wz-head"><b>Step {at + 1} of {STEPS.length}</b><span className="muted">{STEPS[at]}</span></div>
      <div className="wz-prog" style={{ gridTemplateColumns: `repeat(${STEPS.length},1fr)` }}>
        {STEPS.map((s, i) => <i key={s} className={i <= at ? 'on' : ''} />)}
      </div>
      <form className="wz-body" onSubmit={(e) => e.preventDefault()}>
        {at === 0 && <Contracts open={open} q={q} onQ={setQ} selected={loanId} onPick={pick} loading={data.isLoading} today={data.today} lang={lang} />}
        {at === 1 && view && (
          <div className="wz-step">
            <h2>Payment details</h2>
            <p className="muted small">{loanCode(view.loan.id)} · <b>{borrowerName(view.borrower, lang)}</b> · installment #{nextRow(view)?.i} due {fmtD(nextRow(view)?.due)}</p>
            <div className="form wz-1col">
              <Dropdown id="pyb" label="Receiving bank account" options={bankOptions} value={bankValue} onChange={setBank} />
              <div className="field">
                <label htmlFor="pa">Amount received</label>
                <div className="wz-amt">
                  <input id="pa" inputMode="decimal" autoComplete="off" value={amountValue} onChange={(e) => setAmount(amountText(e.target.value, cur))} />
                  <span>{symbol(cur)}</span>
                </div>
                <p className="small muted">{hint(view)}</p>
              </div>
              <DateField id="pyd" label="Paid on" value={paidOn} onChange={setPaidOn} />
              <div className="field">
                <label>Photo of payment transaction (optional)</label>
                <div className="drop">
                  <span>Screenshot or photo of the transfer</span>
                  <label className="btn sm" style={{ cursor: 'pointer' }}>
                    Take / choose photo
                    <input type="file" accept="image/*" hidden onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); e.target.value = '' }} />
                  </label>
                </div>
                {photo && (
                  <div className="py-ph">
                    <img src={photo.url} alt="Payment transaction" /><span className="grow small ell">{photo.file.name}</span>
                    <button type="button" className="btn sm" onClick={() => setPhoto(null)}>Remove</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {at === 2 && view && alloc && (
          <div className="wz-step">
            <h2>Review and confirm</h2>
            <Review view={view} alloc={alloc} amount={value} paidOn={paidOn} bankText={bankText} photo={photo ? { name: photo.file.name, url: photo.url } : null}
              onEdit={setStep} lang={lang} />
          </div>
        )}
      </form>
      <div className="wz-bar">
        <button type="button" className="btn" onClick={back}>{at === 0 ? t('cancel') : t('back')}</button>
        <button type="button" className="btn primary" onClick={next}>{at === STEPS.length - 1 ? t('record') : 'Next'}</button>
      </div>
      {dialog === 'cancel' && (
        <Sheet title="Cancel payment?" onClose={() => setDialog(null)} action={{ label: 'Yes, cancel', onClick: () => nav('/cashflow') }}>
          <p style={{ margin: '0 0 6px' }}>Discard this payment record? Nothing you entered will be saved.</p>
        </Sheet>
      )}
      {dialog === 'confirm' && view && (
        <Sheet title="Record this payment?" onClose={() => setDialog(null)} action={{ label: 'Confirm and record', onClick: submit }}>
          <p style={{ margin: '0 0 6px' }}>
            Record <b>{fmt(value, cur)}</b> received for <b>{loanCode(view.loan.id)}</b> ({borrowerName(view.borrower, lang)}) into <b>{bankText}</b>?
          </p>
        </Sheet>
      )}
    </div>
  )
}

function hint(v: LoanView) {
  const r = nextRow(v)
  if (!r) return ''
  const lf = v.status.lateFeeOutstanding
  return `Installment ${fmt(dueParts(r).remaining, v.loan.currency)}. Partial and early payments are allowed, up to what the loan still owes.`
    + (lf > 0 ? ` Late fee ${fmt(lf, v.loan.currency)} is collected separately, from the loan page.` : '')
}

function Contracts({ open, q, onQ, selected, onPick, loading, today, lang }: {
  open: LoanView[]; q: string; onQ: (v: string) => void; selected: number | null; onPick: (id: number) => void
  loading: boolean; today: string; lang: string
}) {
  const needle = q.trim().toLowerCase()
  const list = (needle
    ? open.filter((v) => `${loanCode(v.loan.id)} ${v.borrower?.name ?? ''} ${v.borrower?.name_km ?? ''}`.toLowerCase().includes(needle))
    : open.filter((v) => (nextRow(v)?.due ?? '9') <= today))
    .sort((a, b) => ((nextRow(a)?.due ?? '') < (nextRow(b)?.due ?? '') ? -1 : 1))
  return (
    <div className="wz-step">
      <h2>Which contract?</h2>
      <p className="muted small">Search by contract number or borrower. Contracts with an installment due today or overdue are listed first.</p>
      <label className="wz-search">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => onQ(e.target.value)} placeholder="Search contract or borrower…" autoComplete="off" aria-label="Search contract" />
      </label>
      <div id="pyres">
        <h3 className="wz-cap">{needle ? 'Results' : 'Due today and overdue'}</h3>
        {list.map((v) => {
          const r = nextRow(v)
          if (!r) return null
          const late = r.lateDays
          return (
            <button type="button" key={v.loan.id} className={'item' + (v.loan.id === selected ? ' sel' : '')} onClick={() => onPick(v.loan.id)}>
              <span className="avatar">{initials(borrowerName(v.borrower, lang))}</span>
              <span className="grow"><b>{borrowerName(v.borrower, lang)}</b><span className="small muted" style={{ display: 'block' }}>{loanCode(v.loan.id)} · installment #{r.i}</span></span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <b className="num">{fmt(owedNow(v), v.loan.currency)}</b>
                {late > 0 ? <span className="small tag-late">{late}d late</span>
                  : r.due === today ? <span className="small tag-late">Due today</span>
                  : <span className="small muted">Due {fmtD(r.due)}</span>}
              </span>
            </button>
          )
        })}
        {list.length === 0 && <p className="muted">{loading ? 'Loading…' : needle ? 'No outstanding contract found.' : 'No installment is due today.'}</p>}
      </div>
    </div>
  )
}

function Review({ view, alloc, amount, paidOn, bankText, photo, onEdit, lang }: {
  view: LoanView; alloc: ReturnType<typeof allocatePayment>; amount: number; paidOn: string; bankText: string
  photo: { name: string; url: string } | null; onEdit: (step: number) => void; lang: string
}) {
  const cur = view.loan.currency
  const applied = amount - alloc.above
  const row = (k: string, v: string, x = '') => <div className={'lr ' + x}><span>{k}</span><b className="num">{v}</b></div>
  return (
    <>
      <section className="wz-sec">
        <div className="row between"><h3 className="wz-cap">This payment</h3><button type="button" className="linkbtn" onClick={() => onEdit(1)}>Edit</button></div>
        <div className="ls-t">
          {row('Contract', `${loanCode(view.loan.id)} · ${borrowerName(view.borrower, lang)}`)}
          {row('Receiving account', bankText)}
          {row('Paid on', fmtD(paidOn))}
          {row('Amount received', fmt(amount, cur), 'strong')}
          {row('Applied to installments', fmt(applied, cur), 'sub')}
          {row('Balance after payment', fmt(Math.max(alloc.balanceAfter, 0), cur), 'strong')}
        </div>
        {photo && <div className="py-ph" style={{ marginTop: 12 }}><img src={photo.url} alt="Payment transaction" /><span className="grow small ell">{photo.name}</span></div>}
      </section>
      <section className="wz-sec">
        <div className="row between"><h3 className="wz-cap">Installment schedule</h3></div>
        <div className="py-sched">
          {alloc.after.rows.map((r, i) => {
            const was = alloc.before.rows[i]
            const state = was.state === 'paid' ? 'paid' : r.state === 'paid' ? 'now' : r.paidAmount > 0 ? 'part' : r.state === 'overdue' ? 'late' : 'up'
            const hit = state === 'now' || (state === 'part' && r.paidAmount > was.paidAmount + 0.005)
            return (
              <div className={'py-row' + (hit ? ' hit' : '')} key={r.i}>
                <span className="grow">
                  <b>#{r.i}</b> <span className="muted">· {fmtD(r.due)}</span>
                  {state === 'part' && <span className="small muted" style={{ display: 'block' }}>{fmt(r.paidAmount, cur)} paid · {fmt(r.total - r.paidAmount, cur)} left</span>}
                </span>
                <b className="num">{fmt(r.total, cur)}</b>
                {state === 'paid' && <span className="chip approved">Paid</span>}
                {state === 'now' && <span className="chip approved">Paid now</span>}
                {state === 'part' && <span className="chip requested">Partial</span>}
                {state === 'late' && <span className="chip overdue">Overdue</span>}
                {state === 'up' && <span className="small muted">Upcoming</span>}
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
