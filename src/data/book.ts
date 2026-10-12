import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { must, useSettings } from './core'
import { scheduleStatus, todayIso, type LoanTerms } from '../lib/calc'
import type { Borrower, FundTransaction, Loan, Payment } from '../lib/types'

export interface Book {
  loans: Loan[]
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
      return {
        // numeric columns arrive as strings or numbers depending on precision; normalise
        loans: num(must(l) as Loan[], ['amount', 'fee_pct', 'late_fee_per_day', 'rate_pct']),
        borrowers: must(b) as Borrower[],
        payments: num(must(p) as Payment[], ['amount', 'late_fee']),
        funds: num(must(f) as FundTransaction[], ['amount']),
      }
    },
  })
}

export const termsOf = (l: Loan): LoanTerms => ({
  amount: l.amount, currency: l.currency, feePct: l.fee_pct, ratePct: l.rate_pct, rateBasis: l.rate_basis,
  occurrences: l.occurrences, intervalDays: l.interval_days, mode: l.mode, releaseDate: l.release_date,
  lateFeePerDay: l.late_fee_per_day,
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

export function useLoanViews(): { views: LoanView[]; isLoading: boolean; book: Book | undefined } {
  const { data: book, isLoading } = useBook()
  const views = useMemo(() => {
    if (!book) return []
    const today = todayIso()
    const bor = new Map(book.borrowers.map((b) => [b.id, b]))
    const pays = new Map<number, Payment[]>()
    book.payments.forEach((p) => pays.set(p.loan_id, [...(pays.get(p.loan_id) ?? []), p]))
    return book.loans.map<LoanView>((loan) => {
      const payments = pays.get(loan.id) ?? []
      const terms = termsOf(loan)
      const status = scheduleStatus(terms, payments.map((p) => ({ amount: p.amount, lateFee: p.late_fee, paidOn: p.paid_on })), today)
      const approved = loan.status === 'approved'
      return { loan, borrower: bor.get(loan.borrower_id), payments, terms, status, done: approved && status.done, active: approved && !status.done }
    })
  }, [book])
  return { views, isLoading, book }
}

/** Defaults for the new-loan form come from the shared settings. */
export function useLateFeeDefault(currency: 'KHR' | 'USD') {
  const { data } = useSettings()
  return currency === 'USD' ? data?.late_fee_usd ?? 0.5 : data?.late_fee_khr ?? 2000
}
