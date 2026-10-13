import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { must } from './core'

/** The loan's state after one event (finance rules R-SNAP-1): balances, collected, installments paid. */
export interface LoanSnapshot {
  id: number; loan_id: number; seq: number; event_type: string; event_id: number | null; as_of: string
  principal_outstanding: number; interest_outstanding: number; collected: number; late_fee_collected: number
  installments_paid: number; created_at: string
}

export function useLoanSnapshots(loanId: number) {
  return useQuery({
    queryKey: ['book', 'snapshots', loanId],
    enabled: Number.isFinite(loanId),
    queryFn: async () => {
      const rows = must(await supabase.from('loan_snapshots').select('*').eq('loan_id', loanId).order('seq')) as LoanSnapshot[]
      return rows.map((s) => ({ ...s, principal_outstanding: Number(s.principal_outstanding), interest_outstanding: Number(s.interest_outstanding), collected: Number(s.collected) }))
    },
  })
}

export interface Discrepancy { loan_id: number; check_name: string; expected: number; actual: number }

/** Reconciliation (R-SNAP-4, admin only): what the database's own records say about each other for this loan. */
export function useReconcile(loanId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['book', 'reconcile', loanId],
    enabled: enabled && Number.isFinite(loanId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('reconcile_books', { p_loan: loanId })
      if (error) throw new Error(error.message)
      return ((data ?? []) as Discrepancy[]).map((d) => ({ ...d, expected: Number(d.expected), actual: Number(d.actual) }))
    },
  })
}
