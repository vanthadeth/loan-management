import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { must, useSettings } from './core'
import { scheduleStatus, todayIso, type LoanTerms } from '../lib/calc'
import type { Borrower, FundTransaction, Loan, Payment } from '../lib/types'

export interface Book {
  /** loans that are not voided: every list and total uses these */
  loans: Loan[]
  /** voided loans (only people holding loans.void ever receive them) and their payments */
  voidedLoans: Loan[]
  voidedPayments: Payment[]
  borrowers: Borrower[]
  payments: Payment[]
  funds: FundTransaction[]
}

/**
 * Everything the money screens need, in one fetch. A family business has at most a
 * few hundred rows, so one cached query keeps every screen consistent.
 * Row level security already limits what each user can read (e.g. supervisors only
 * receive their own loans and the payments on them).
 */
export function useBook() {
  return useQuery({
    queryKey: ['book'],
    queryFn: async (): Promise<Book> => {
      const [l, b, p, f] = await Promise.all([
        supabase.from('loans').select('*').order('id', { ascending: false }),
        supabase.from('borrowers').select('*').order('name'),
        supabase.from('payments').select('*').order('paid_on').order('id'),
        supabase.from('fund_transactions').select('*').order('txn_date', { ascending: false }),
      ])
      // numeric columns can arrive as strings; normalise them
      const num = <T extends object>(rows: T[], keys: (keyof T)[]): T[] =>
        rows.map((r) => { const o = { ...r }; keys.forEach((k) => { if (o[k] != null) o[k] = Number(o[k]) as T[keyof T] }); return o })
      const allLoans = num(must(l) as Loan[], ['amount', 'fee_pct', 'late_fee_pct', 'rate_pct'])
      const allPayments = num(must(p) as Payment[], ['amount', 'late_fee'])
      const voidedIds = new Set(allLoans.filter((x) => x.voided_at).map((x) => x.id))
      return {
        loans: allLoans.filter((x) => !x.voided_at),
        voidedLoans: allLoans.filter((x) => x.voided_at),
        payments: allPayments.filter((x) => !voidedIds.has(x.loan_id)),
        voidedPayments: allPayments.filter((x) => voidedIds.has(x.loan_id)),
        borrowers: must(b) as Borrower[],
        funds: num(must(f) as FundTransaction[], ['amount']),
      }
    },
  })
}

const termsOf = (l: Loan): LoanTerms => ({
  amount: l.amount, currency: l.currency, feePct: l.fee_pct, ratePct: l.rate_pct, rateBasis: l.rate_basis,
  occurrences: l.occurrences, frequency: l.frequency, intervalDays: l.interval_days, mode: l.mode, releaseDate: l.release_date,
  lateFeePct: l.late_fee_pct,
})

/** A loan joined with its borrower, payments and live schedule status. */
export interface LoanView {
  loan: Loan
  borrower: Borrower | undefined
  payments: Payment[]
  terms: LoanTerms
  status: ReturnType<typeof scheduleStatus>
  /** approved and fully repaid */
  done: boolean
  /** approved and still collecting */
  active: boolean
}

export function useLoanViews(): { views: LoanView[]; voidedViews: LoanView[]; isLoading: boolean; book: Book | undefined } {
  const { data: book, isLoading } = useBook()
  const { views, voidedViews } = useMemo(() => {
    if (!book) return { views: [], voidedViews: [] }
    const today = todayIso()
    const bor = new Map(book.borrowers.map((b) => [b.id, b]))
    const pays = new Map<number, Payment[]>()
    ;[...book.payments, ...book.voidedPayments].forEach((p) => pays.set(p.loan_id, [...(pays.get(p.loan_id) ?? []), p]))
    const build = (loan: Loan): LoanView => {
      const payments = pays.get(loan.id) ?? []
      const terms = termsOf(loan)
      const status = scheduleStatus(terms, payments.map((p) => ({ amount: p.amount, lateFee: p.late_fee, paidOn: p.paid_on })), today)
      const approved = loan.status === 'approved'
      return { loan, borrower: bor.get(loan.borrower_id), payments, terms, status, done: approved && status.done, active: approved && !status.done }
    }
    return { views: book.loans.map(build), voidedViews: book.voidedLoans.map(build) }
  }, [book])
  return { views, voidedViews, isLoading, book }
}

/** Defaults for the new-loan form come from the shared settings. */
export function useLateFeeDefault() {
  const { data } = useSettings()
  return data?.late_fee_pct ?? 2
}
