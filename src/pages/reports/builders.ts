import { dueParts, net, openLoans, sum, borrowerName, type LedgerEntry, type MoneyData } from '../../data/money'
import type { Currency } from '../../lib/calc'
import { daysPastDue, portfolioAtRisk } from '../../lib/risk'
import { fmt, fmtD, loanCode } from '../../lib/format'

export type Cell = string | { amount: number; signed?: boolean } | { date: string }

export interface Table {
  cols: string[]
  /** indexes of right-aligned (numeric) columns */
  right: number[]
  rows: Cell[][]
  foot: Cell[]
}

export const REPORTS = [
  { name: 'Loan portfolio', desc: 'All loans with balances, progress and status', icon: 'loan', filter: 'release date' },
  { name: 'Collections', desc: 'Payments received, by date and borrower', icon: 'download', filter: null },
  { name: 'Overdue loans', desc: 'Borrowers behind on payments, with late fees', icon: 'alert', filter: 'due date' },
  { name: 'Portfolio at risk', desc: 'Outstanding principal by days past due, PAR1 and PAR30', icon: 'alert', filter: null },
  { name: 'Interest and fees', desc: 'Income earned on each loan', icon: 'pie', filter: null },
  { name: 'Cashflow statement', desc: 'Money in, money out and fund changes', icon: 'coin', filter: null },
  { name: 'Borrower statement', desc: 'Everything one borrower borrowed and paid', icon: 'userp', filter: 'release date' },
] as const

export type ReportName = (typeof REPORTS)[number]['name']
export const isReport = (n: string): n is ReportName => REPORTS.some((r) => r.name === n)

export interface Ctx {
  data: MoneyData
  cur: Currency
  lang: string
  inRange: (iso: string) => boolean
}

const amt = (n: number): Cell => ({ amount: n })
const total = (rows: number[][], i: number): Cell => amt(rows.reduce((s, r) => s + r[i], 0))
const TYPE_LABEL = { add: 'Fund added', wd: 'Fund withdrawn', in: 'Money in', out: 'Money out' } as const

export function buildReport(name: ReportName, { data, cur, lang, inRange }: Ctx): Table {
  const entries = data.entries.filter((e) => e.currency === cur && inRange(e.date))
  const released = data.views.filter((v) => v.loan.status === 'approved' && v.loan.currency === cur && inRange(v.loan.release_date))
  const who = (e: LedgerEntry) => (e.borrower ? borrowerName(e.borrower, lang) : e.title)

  switch (name) {
    case 'Loan portfolio': {
      const nums = released.map((v) => [v.loan.amount, v.status.rows.reduce((s, r) => s + r.interest, 0), v.status.collected, v.status.remaining])
      return {
        cols: ['Loan', 'Borrower', 'Amount', 'Interest', 'Collected', 'Remaining', 'Progress', 'Status'],
        right: [2, 3, 4, 5, 6],
        rows: released.map((v, i) => [
          loanCode(v.loan.id), borrowerName(v.borrower, lang), amt(nums[i][0]), amt(nums[i][1]), amt(nums[i][2]), amt(nums[i][3]),
          `${Math.round((v.status.paidCount / v.loan.occurrences) * 100)}%`,
          v.loan.status === 'refinanced' ? 'Refinanced' : v.loan.written_off_at ? 'Written off' : v.done ? 'Completed' : v.status.rows.some((r) => r.state === 'overdue') ? 'Overdue' : 'Active',
        ]),
        foot: ['Total', '', total(nums, 0), total(nums, 1), total(nums, 2), total(nums, 3), '', ''],
      }
    }
    case 'Collections': {
      const pays = entries.filter((e) => e.kind === 'payment')
      return {
        cols: ['Date', 'Loan', 'Borrower', 'Principal', 'Interest', 'Fees', 'Total'],
        right: [3, 4, 5, 6],
        rows: pays.map((e) => [{ date: e.date }, loanCode(e.loanId ?? 0), who(e), amt(e.principal), amt(e.interest), amt(e.lateFee), amt(e.amount)]),
        foot: ['Total', '', '', amt(sum(pays, (e) => e.principal)), amt(sum(pays, (e) => e.interest)), amt(sum(pays, (e) => e.lateFee)), amt(sum(pays))],
      }
    }
    case 'Overdue loans': {
      const out = openLoans(data, cur).flatMap((v) =>
        v.status.rows.filter((r) => r.state === 'overdue' && inRange(r.due)).map((r) => ({ v, r, owed: dueParts(r).remaining })))
      return {
        cols: ['Loan', 'Borrower', 'Installment', 'Due date', 'Days late', 'Amount', 'Late fee'],
        right: [4, 5, 6],
        rows: out.map(({ v, r, owed }) => [loanCode(v.loan.id), borrowerName(v.borrower, lang), '#' + r.i, { date: r.due }, String(r.lateDays), amt(owed), amt(r.lateFee)]),
        foot: ['Total', '', '', '', '', amt(out.reduce((s, o) => s + o.owed, 0)), amt(out.reduce((s, o) => s + o.r.lateFee, 0))],
      }
    }
    case 'Portfolio at risk': {
      // as of today, over every loan still being repaid (not limited to the date range)
      const risk = openLoans(data, cur).map((v) => ({ dpd: daysPastDue(v.status.rows), principal: v.status.remainingPrincipal }))
      const par = portfolioAtRisk(risk)
      const writtenOff = openLoans(data, cur).filter((v) => v.loan.written_off_at).map((v) => ({ principal: v.status.remainingPrincipal }))
      const pct = (n: number) => (n * 100).toFixed(1) + '%'
      const share = (n: number) => pct(par.total > 0 ? n / par.total : 0)
      return {
        cols: ['Days past due', 'Loans', 'Principal outstanding', '% of portfolio'],
        right: [1, 2, 3],
        rows: [
          ...par.buckets.map((b) => [b.label, String(b.loans), amt(b.principal), share(b.principal)] as Cell[]),
          ['of which written off', String(writtenOff.length), amt(writtenOff.reduce((s, l) => s + l.principal, 0)), share(writtenOff.reduce((s, l) => s + l.principal, 0))],
          ['PAR1 (1+ days late)', String(risk.filter((l) => l.dpd >= 1).length), amt(par.par1Amount), pct(par.par1)],
          ['PAR30 (31+ days late)', String(risk.filter((l) => l.dpd >= 31).length), amt(par.par30Amount), pct(par.par30)],
        ],
        foot: ['Total outstanding', String(risk.length), amt(par.total), par.total > 0 ? '100.0%' : '0.0%'],
      }
    }
    case 'Interest and fees': {
      const by = new Map<number, { who: string; fee: number; interest: number; late: number }>()
      for (const e of entries) {
        if (e.loanId === undefined || (e.kind !== 'fee' && e.kind !== 'payment')) continue
        const o = by.get(e.loanId) ?? { who: who(e), fee: 0, interest: 0, late: 0 }
        if (e.kind === 'fee') o.fee += e.amount
        else { o.interest += e.interest; o.late += e.lateFee }
        by.set(e.loanId, o)
      }
      const ids = [...by.keys()].sort((a, b) => a - b)
      const nums = ids.map((id) => { const o = by.get(id)!; return [o.fee, o.interest, o.late, o.fee + o.interest + o.late] })
      return {
        cols: ['Loan', 'Borrower', 'Service fee', 'Interest', 'Late fees', 'Total income'],
        right: [2, 3, 4, 5],
        rows: ids.map((id, i) => [loanCode(id), by.get(id)!.who, ...nums[i].map(amt)]),
        foot: ['Total', '', total(nums, 0), total(nums, 1), total(nums, 2), total(nums, 3)],
      }
    }
    case 'Cashflow statement':
      return {
        cols: ['Date', 'Description', 'Details', 'Type', 'Amount'],
        right: [4],
        rows: entries.map((e) => [{ date: e.date }, who(e), e.detail, TYPE_LABEL[e.type], { amount: e.direction === 'in' ? e.amount : -e.amount, signed: true }]),
        foot: ['Net change', '', '', '', { amount: net(entries), signed: true }],
      }
    case 'Borrower statement': {
      const by = new Map<number, typeof released>()
      released.forEach((v) => by.set(v.loan.borrower_id, [...(by.get(v.loan.borrower_id) ?? []), v]))
      const groups = [...by.values()]
        .map((vs) => ({ b: vs[0].borrower, n: vs.length, nums: [
          vs.reduce((s, v) => s + v.loan.amount, 0),
          vs.reduce((s, v) => s + v.status.rows.reduce((a, r) => a + r.interest, 0), 0),
          vs.reduce((s, v) => s + v.status.collected, 0),
          vs.reduce((s, v) => s + v.status.remaining, 0),
        ] }))
        .sort((a, b) => (a.b?.name ?? '').localeCompare(b.b?.name ?? ''))
      const nums = groups.map((g) => g.nums)
      return {
        cols: ['Borrower', 'Loans', 'Borrowed', 'Interest', 'Paid', 'Outstanding'],
        right: [1, 2, 3, 4, 5],
        rows: groups.map((g) => [borrowerName(g.b, lang), String(g.n), ...g.nums.map(amt)]),
        foot: ['Total', String(groups.reduce((s, g) => s + g.n, 0)), total(nums, 0), total(nums, 1), total(nums, 2), total(nums, 3)],
      }
    }
  }
}

export function cellText(c: Cell, cur: Currency) {
  if (typeof c === 'string') return c
  if ('date' in c) return fmtD(c.date)
  return c.signed ? (c.amount < 0 ? '−' : '+') + fmt(Math.abs(c.amount), cur) : fmt(c.amount, cur)
}
