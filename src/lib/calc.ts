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
  /** Percent of the unpaid principal, charged for every payment period the loan is late. */
  lateFeePct: number
  /** Balance carried over from a loan this one refinances: part of `amount`, but no service fee and not paid out. */
  carried?: number
}

export interface PaymentLike {
  amount: number
  lateFee: number
  /** late fee that was due with this payment but forgiven */
  lateFeeWaived?: number
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

/**
 * Installments: interest and principal split evenly, each rounded (riel to 100, dollars to the cent). The last
 * installment takes the rounding difference, so the principal adds up to exactly the loan amount and the interest
 * to exactly the total interest (1,000,000 over 60 is 59 × 16,700 + 14,700, not 60 × 16,700 = 1,002,000).
 */
export function buildSchedule(t: LoanTerms): Installment[] {
  const n = t.occurrences
  const interestTotal = roundMoney(totalInterest(t), t.currency)
  const interestEach = roundMoney(interestTotal / n, t.currency)
  const principalEach = t.mode === 'equal' ? roundMoney(t.amount / n, t.currency) : 0
  const rows: Installment[] = []
  for (let i = 1; i <= n; i++) {
    const last = i === n
    const interest = last ? roundMoney(interestTotal - interestEach * (n - 1), t.currency) : interestEach
    const principal = last ? roundMoney(t.amount - principalEach * (n - 1), t.currency) : principalEach
    rows.push({ i, due: dueDate(t, i), interest, principal, total: interest + principal })
  }
  return rows
}

export function loanTotals(t: LoanTerms) {
  const rows = buildSchedule(t)
  const carried = t.carried ?? 0
  const fee = roundMoney(((t.amount - carried) * t.feePct) / 100, t.currency)
  const total = rows.reduce((s, r) => s + r.total, 0)
  const interest = rows.reduce((s, r) => s + r.interest, 0)
  // net: what the borrower actually receives (a carried balance pays off the old loan instead)
  return { rows, fee, interest, total, net: t.amount - carried - fee, endDate: rows[rows.length - 1].due }
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

/** One late period: from `from`, installment `installment` was the oldest overdue; `pct` % of `owed` is `fee`. */
export interface LateFeeLine { from: string; installment: number; owed: number; pct: number; fee: number }

/** How much of an amount applied to the installments (oldest first, each one's interest before its principal) went to principal and to interest. */
function splitApplied(rows: Installment[], applied: number) {
  let left = applied
  let principal = 0
  let interest = 0
  for (const r of rows) {
    if (left <= 0) break
    const take = Math.min(left, r.total)
    const toInterest = Math.min(take, r.interest)
    interest += toInterest
    principal += take - toInterest
    left -= take
  }
  return { principal, interest }
}

/** Start of late period `k` (0-based) that began on `start`: same day of the month, or every `intervalDays` days. */
const periodStart = (t: Pick<LoanTerms, 'frequency' | 'intervalDays'>, start: string, k: number) =>
  t.frequency === 'monthly' ? addMonths(start, k) : addDays(start, k * Math.max(1, t.intervalDays))

/**
 * Walks the payments in order and spreads what is left after late fees over the
 * installments, oldest first.
 *
 * Late fee: while any installment is overdue the loan is late. For every payment
 * period it is late (a started period counts) the borrower owes `lateFeePct` % of
 * the unpaid principal (not interest, not late fees) at the start of that period. Each period's
 * fee is shown on the oldest installment that was overdue then.
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
  const total = rows.reduce((s, r) => s + r.total, 0)
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
    return { ...r, paidAmount, paidOn, state, lateDays, lateOccurrences: 0, lateFee: 0 }
  })

  // late stretches: from an installment's due date until it is paid; overlapping ones join up
  // unpaid principal on a date: payments go to each installment's interest first, then its principal, oldest first
  const principalTotal = rows.reduce((s, r) => s + r.principal, 0)
  const interestTotal = rows.reduce((s, r) => s + r.interest, 0)
  const owedOn = (date: string) => {
    const upTo = cumulative.filter((c) => c.on <= date).reduce((m, c) => Math.max(m, c.total), 0)
    return principalTotal - splitApplied(rows, upTo).principal
  }
  const stretches: [string, string][] = []
  for (const r of status) {
    const end = r.paidOn ?? today
    if (end <= r.due) continue
    const last = stretches[stretches.length - 1]
    if (last && r.due < last[1]) last[1] = end > last[1] ? end : last[1]
    else stretches.push([r.due, end])
  }
  // one line per late period, for showing how the late fee was worked out
  const lateLines: LateFeeLine[] = []
  for (const [start, end] of stretches) {
    for (let k = 0; ; k++) {
      const at = periodStart(t, start, k)
      if (at >= end) break
      const owed = Math.max(owedOn(at), 0)
      const fee = roundMoney((owed * t.lateFeePct) / 100, t.currency)
      const row = status.find((r) => r.due <= at && (r.paidOn === null || r.paidOn > at)) ?? status[0]
      row.lateFee += fee
      row.lateOccurrences++
      lateLines.push({ from: at, installment: row.i, owed, pct: t.lateFeePct, fee })
    }
  }

  const lateFeeAccrued = status.reduce((s, r) => s + r.lateFee, 0)
  const lateFeePaid = payments.reduce((s, p) => s + p.lateFee, 0)
  const lateFeeWaived = payments.reduce((s, p) => s + (p.lateFeeWaived ?? 0), 0)
  const collected = Math.min(applied, total)
  return {
    rows: status,
    total,
    collected,
    remaining: Math.max(total - applied, 0),
    /** what is left, split the same way payments are applied (interest first, then principal): the two add up to `remaining` */
    remainingPrincipal: Math.max(principalTotal - splitApplied(rows, applied).principal, 0),
    remainingInterest: Math.max(interestTotal - splitApplied(rows, applied).interest, 0),
    paidCount: status.filter((r) => r.state === 'paid').length,
    lateFeeAccrued,
    lateFeePaid,
    lateFeeWaived,
    lateFeeOutstanding: Math.max(lateFeeAccrued - lateFeePaid - lateFeeWaived, 0),
    lateLines,
    done: applied >= total - EPS,
  }
}

/**
 * What a new payment settles: late fee first, then installments oldest first.
 * `collectLateFee` is how much late fee the collector actually took (0 up to what is due); the rest of the
 * late fee due is forgiven. Left out, the full late fee is collected as far as the amount covers it.
 */
export function allocatePayment(t: LoanTerms, payments: PaymentLike[], amount: number, paidOn: string, collectLateFee?: number) {
  const before = scheduleStatus(t, payments, paidOn)
  const due = before.lateFeeOutstanding
  const lateFee = Math.max(0, Math.min(collectLateFee ?? due, due, amount))
  const lateFeeWaived = roundMoney(Math.max(due - lateFee, 0), t.currency)
  const after = scheduleStatus(t, [...payments, { amount, lateFee, lateFeeWaived, paidOn }], paidOn)
  const toInstallments = amount - lateFee
  return {
    lateFeeDue: due,
    lateFee,
    lateFeeWaived,
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

/* ------------------------------------------------------------- refinancing */

/** The payment recorded on a loan when a new loan paid it off (refinancing). */
export const isPayoff = (p: { note: string }) => p.note.startsWith('Refinanced into')

/**
 * What it takes to pay off a loan on `asOf` (the refinancing loan's release date): everything due by then
 * (principal and interest), the principal of installments not yet due (their interest is dropped), and the
 * late fee owed by then. `total` includes `lateFee`.
 */
export function payoffAmount(t: LoanTerms, payments: PaymentLike[], asOf: string) {
  const st = scheduleStatus(t, payments, asOf)
  let owed = 0
  for (const r of st.rows) {
    if (r.state === 'paid') continue
    const left = r.total - r.paidAmount
    // payments go to interest first, so what is left of a row not yet due is at most its principal
    owed += r.due <= asOf ? left : Math.min(r.principal, left)
  }
  const lateFee = st.lateFeeOutstanding
  return { lateFee, total: roundMoney(owed + lateFee, t.currency) }
}

interface SplitPayment { id: number; amount: number; late_fee: number; paid_on: string; note: string }
const cents = (n: number) => Math.round(n * 100) / 100

/**
 * How much of each payment went to principal and how much to interest (interest first, oldest installment first).
 * Late fee is separate. A refinancing payoff pays only the principal of installments not yet due (their interest
 * was dropped), so none of it counts as interest for those.
 */
export function splitPayments(terms: LoanTerms, payments: SplitPayment[]) {
  const rows = buildSchedule(terms)
  const ordered = [...payments].sort((a, b) => (a.paid_on < b.paid_on ? -1 : a.paid_on > b.paid_on ? 1 : 0))
  const out = new Map<number, { principal: number; interest: number }>()
  let idx = 0
  let used = 0
  for (const p of ordered) {
    let left = p.amount - p.late_fee
    let principal = 0
    let interest = 0
    const payoff = isPayoff(p)
    while (left > EPS && idx < rows.length) {
      const r = rows[idx]
      if (payoff && r.due > p.paid_on && used < r.interest) used = r.interest // dropped interest: skip it
      const take = Math.min(left, r.total - used)
      const toInterest = Math.min(take, Math.max(r.interest - used, 0))
      interest += toInterest
      principal += take - toInterest
      used += take
      left -= take
      if (used >= r.total - EPS) { idx++; used = 0 }
    }
    out.set(p.id, { principal: cents(principal + Math.max(left, 0)), interest: cents(interest) })
  }
  return out
}
