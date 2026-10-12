// Loan maths. Dates are plain 'YYYY-MM-DD' strings handled in UTC so results never
// depend on the device time zone.

export type Currency = 'KHR' | 'USD'
export type RateBasis = 'month' | 'occurrence' | 'contract'
export type PayMode = 'equal' | 'interest'
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'custom'

export interface LoanTerms {
  amount: number
  currency: Currency
  feePct: number
  ratePct: number
  rateBasis: RateBasis
  occurrences: number
  /** Monthly repeats on the same day of every calendar month; the others repeat every `intervalDays` days. */
  frequency: Frequency
  intervalDays: number
  mode: PayMode
  releaseDate: string
  /** Percent of the unpaid installment charged for every late occurrence (one payment period). */
  lateFeePct: number
}

export interface PaymentLike {
  amount: number
  lateFee: number
  paidOn: string
}

export interface Installment {
  i: number
  due: string
  interest: number
  principal: number
  total: number
}

export type InstallmentState = 'paid' | 'partial' | 'overdue' | 'upcoming'

export interface InstallmentStatus extends Installment {
  paidAmount: number
  paidOn: string | null
  state: InstallmentState
  lateDays: number
  /** Payment periods the installment has been late (a started period counts). */
  lateOccurrences: number
  lateFee: number
}

const DAY = 864e5
const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
export const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (iso: string, n: number) => toIso(parse(iso) + n * DAY)
/** Same day of the month `n` months later; a 31st falls back to the month's last day (31 Jan → 28 Feb → 31 Mar). */
export const addMonths = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  const first = Date.UTC(y, m - 1 + n, 1)
  const last = new Date(Date.UTC(new Date(first).getUTCFullYear(), new Date(first).getUTCMonth() + 1, 0)).getUTCDate()
  return toIso(first + (Math.min(d, last) - 1) * DAY)
}
export const diffDays = (from: string, to: string) => Math.round((parse(to) - parse(from)) / DAY)
export const todayIso = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** USD to the cent, KHR to the nearest 100 riel. */
export const roundMoney = (v: number, cur: Currency) =>
  cur === 'USD' ? Math.round(v * 100) / 100 : Math.round(v / 100) * 100

/** Date of installment `i` (1-based). */
export const dueDate = (t: Pick<LoanTerms, 'frequency' | 'releaseDate' | 'intervalDays'>, i: number) =>
  t.frequency === 'monthly' ? addMonths(t.releaseDate, i) : addDays(t.releaseDate, t.intervalDays * i)

export function totalInterest(t: Pick<LoanTerms, 'amount' | 'ratePct' | 'rateBasis' | 'occurrences' | 'intervalDays' | 'frequency'>) {
  const r = t.ratePct / 100
  if (t.rateBasis === 'contract') return t.amount * r
  if (t.rateBasis === 'occurrence') return t.amount * r * t.occurrences
  // per month: monthly loans count calendar months, other frequencies count days / 30
  return t.amount * r * (t.frequency === 'monthly' ? t.occurrences : (t.occurrences * t.intervalDays) / 30)
}

export function buildSchedule(t: LoanTerms): Installment[] {
  const I = totalInterest(t)
  const rows: Installment[] = []
  for (let i = 1; i <= t.occurrences; i++) {
    const interest = roundMoney(I / t.occurrences, t.currency)
    const principal = t.mode === 'equal' ? roundMoney(t.amount / t.occurrences, t.currency) : i === t.occurrences ? t.amount : 0
    rows.push({ i, due: dueDate(t, i), interest, principal, total: interest + principal })
  }
  return rows
}

export function loanTotals(t: LoanTerms) {
  const rows = buildSchedule(t)
  const fee = roundMoney((t.amount * t.feePct) / 100, t.currency)
  const total = rows.reduce((s, r) => s + r.total, 0)
  const interest = rows.reduce((s, r) => s + r.interest, 0)
  return { rows, fee, interest, total, net: t.amount - fee, endDate: rows[rows.length - 1].due }
}

const EPS = 0.005

/** Payment periods between a due date and `end`; a period that has started counts as one. */
export function lateOccurrences(t: Pick<LoanTerms, 'frequency' | 'intervalDays'>, due: string, end: string) {
  const days = diffDays(due, end)
  if (days <= 0) return 0
  if (t.frequency === 'monthly') {
    let n = 1
    while (addMonths(due, n) < end) n++
    return n
  }
  return Math.ceil(days / Math.max(1, t.intervalDays))
}

/**
 * Walks the payments in order and spreads what is left after late fees over the
 * installments, oldest first. The late fee is a percentage of the installment,
 * charged once per payment period from the due date until the installment is
 * paid in full (or until today if it is still open).
 */
export function scheduleStatus(t: LoanTerms, payments: PaymentLike[], today: string) {
  const rows = buildSchedule(t)
  const ordered = [...payments].sort((a, b) => (a.paidOn < b.paidOn ? -1 : a.paidOn > b.paidOn ? 1 : 0))
  const cumulative: { total: number; on: string }[] = []
  let run = 0
  for (const p of ordered) {
    run += p.amount - p.lateFee
    cumulative.push({ total: run, on: p.paidOn })
  }
  const applied = run
  let before = 0
  const status: InstallmentStatus[] = rows.map((r) => {
    const upTo = before + r.total
    const paidAmount = Math.min(Math.max(applied - before, 0), r.total)
    const full = paidAmount >= r.total - EPS
    const paidOn = full ? (cumulative.find((c) => c.total >= upTo - EPS)?.on ?? today) : null
    const end = paidOn ?? today
    const lateDays = Math.max(0, diffDays(r.due, end))
    const state: InstallmentState = full ? 'paid' : r.due < today ? 'overdue' : paidAmount > 0 ? 'partial' : 'upcoming'
    before = upTo
    const occ = lateOccurrences(t, r.due, end)
    return { ...r, paidAmount, paidOn, state, lateDays, lateOccurrences: occ, lateFee: roundMoney((occ * t.lateFeePct * r.total) / 100, t.currency) }
  })
  const total = rows.reduce((s, r) => s + r.total, 0)
  const lateFeeAccrued = status.reduce((s, r) => s + r.lateFee, 0)
  const lateFeePaid = payments.reduce((s, p) => s + p.lateFee, 0)
  const collected = Math.min(applied, total)
  return {
    rows: status,
    total,
    collected,
    remaining: Math.max(total - applied, 0),
    paidCount: status.filter((r) => r.state === 'paid').length,
    lateFeeAccrued,
    lateFeePaid,
    lateFeeOutstanding: Math.max(lateFeeAccrued - lateFeePaid, 0),
    done: applied >= total - EPS,
  }
}

/** What a new payment settles: late fee first, then installments oldest first. */
export function allocatePayment(t: LoanTerms, payments: PaymentLike[], amount: number, paidOn: string) {
  const before = scheduleStatus(t, payments, paidOn)
  const lateFee = Math.min(amount, before.lateFeeOutstanding)
  const after = scheduleStatus(t, [...payments, { amount, lateFee, paidOn }], paidOn)
  const toInstallments = amount - lateFee
  return {
    lateFee,
    toInstallments,
    above: Math.max(toInstallments - before.remaining, 0),
    balanceAfter: after.remaining,
    before,
    after,
  }
}

/** Live numbers for the new-loan wizard. */
export function previewLoan(t: LoanTerms) {
  const { rows, fee, interest, total, net, endDate } = loanTotals(t)
  const first = rows[0]
  return {
    rows,
    fee,
    net,
    interest,
    total,
    endDate,
    installment: first.total,
    interestPct: t.amount ? Math.round((interest / t.amount) * 100) : 0,
  }
}
