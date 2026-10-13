import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fileUrl, must, uploadFile, useInvalidate, useRoles, useTeam } from './core'
import { useBook, useLoanViews, type LoanView } from './book'
import { payoffAmount } from '../lib/calc'
import type { Loan, LoanAttachment, LoanCollateral, LoanStatus } from '../lib/types'

/** Readable text for any failure (RLS and DB triggers raise plain sentences). */
export const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.')

/** Loan views plus a loading flag and a readable error, for screens that list loans. */
export function useLoans() {
  const { views, voidedViews, isLoading } = useLoanViews()
  const { error } = useBook()
  return { views, voidedViews, loading: isLoading, error: error ? errMsg(error) : null }
}

/** The date a fully repaid loan was settled. */
export const completedOn = (v: LoanView) =>
  v.loan.status === 'refinanced'
    ? v.payments.reduce((d, p) => (p.paid_on > d ? p.paid_on : d), v.loan.release_date)
    : v.status.rows[v.status.rows.length - 1].paidOn ?? v.loan.release_date

/** What it takes to pay off an ongoing loan on `asOf`; see payoffAmount. */
export const payoffOf = (v: LoanView, asOf: string) =>
  payoffAmount(v.terms, v.payments.map((p) => ({ amount: p.amount, lateFee: p.late_fee, lateFeeWaived: p.late_fee_waived, paidOn: p.paid_on })), asOf)

/** Signed URL for a private file; null while loading or when there is no file. */
export function useFileUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['file-url', path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: () => fileUrl(path),
  }).data ?? null
}

/** Collateral items and attached files of one loan. */
export function useLoanFiles(loanId: number) {
  return useQuery({
    queryKey: ['loan-files', loanId],
    enabled: Number.isFinite(loanId),
    queryFn: async () => {
      const [c, a] = await Promise.all([
        supabase.from('loan_collaterals').select('*').eq('loan_id', loanId).order('id'),
        supabase.from('loan_attachments').select('*').eq('loan_id', loanId).order('id'),
      ])
      return { collaterals: must(c) as LoanCollateral[], attachments: must(a) as LoanAttachment[] }
    },
  })
}

/** Active people in the Loan supervisor or Collector role: the choices for "collector". */
export function useCollectors() {
  const team = useTeam()
  return (team.data ?? []).filter((p) => p.status === 'active' && (p.role_id === 'supervisor' || p.role_id === 'collector'))
}

/** Active people whose role is limited to their own loans: the choices for "supervisor". */
export function useSupervisors() {
  const team = useTeam()
  const roles = useRoles()
  const makers = new Set((roles.data?.perms ?? []).filter((p) => p.permission === 'loans.create').map((p) => p.role_id))
  const scoped = new Set((roles.data?.roles ?? []).filter((r) => r.scoped && !r.locked && makers.has(r.id)).map((r) => r.id))
  return (team.data ?? []).filter((p) => p.status === 'active' && scoped.has(p.role_id))
}

export type NewLoanFields = Pick<Loan,
  'borrower_id' | 'supervisor_id' | 'collector_id' | 'refinance_of' | 'carried_amount' | 'carried_late_fee' | 'currency' | 'amount' | 'fee_pct' | 'late_fee_pct' | 'late_grace_days' | 'late_cap_pct' | 'rate_pct' | 'rate_basis'
  | 'frequency' | 'interval_days' | 'occurrences' | 'mode' | 'release_date' | 'pay_method' | 'bank_account_id' | 'pay_remarks'>

export interface NewLoanInput {
  loan: NewLoanFields
  collaterals: { description: string; files: File[] }[]
}

/** Adds collateral items and their files to a loan; returns a warning text if something could not be saved. */
async function addCollaterals(id: number, items: NewLoanInput['collaterals']) {
  try {
    for (const c of items) {
      const { data: col, error: e1 } = await supabase.from('loan_collaterals').insert({ loan_id: id, description: c.description }).select('id').single()
      if (e1) throw new Error(e1.message)
      for (const f of c.files) {
        const file_path = await uploadFile('loans', f)
        const { error: e2 } = await supabase.from('loan_attachments').insert({ loan_id: id, collateral_id: col.id, file_path, file_name: f.name })
        if (e2) throw new Error(e2.message)
      }
    }
    return null
  } catch (e) {
    return errMsg(e)
  }
}

export function useLoanActions() {
  const invalidate = useInvalidate()
  const refresh = () => invalidate('book', 'pending-approval', 'messages', 'loan-files')

  return {
    /** Moves a loan one step (submit a draft, approve) or rejects it. The database checks who may do what. */
    async setStatus(id: number, from: LoanStatus, to: LoanStatus, extra: { reject_reason?: string } = {}) {
      const { data, error } = await supabase.from('loans').update({ status: to, ...extra }).eq('id', id).eq('status', from).select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('This loan was just changed, or you are not allowed to do this. Reload and try again.')
      await refresh()
    },

    async setCollector(id: number, collectorId: string | null) {
      const { data, error } = await supabase.from('loans').update({ collector_id: collectorId }).eq('id', id).select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('You are not allowed to change the collector of this loan.')
      await refresh()
    },

    async setSupervisor(id: number, supervisorId: string | null) {
      const { data, error } = await supabase.from('loans').update({ supervisor_id: supervisorId }).eq('id', id).select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('You are not allowed to change the supervisor of this loan.')
      await refresh()
    },

    /** Voids a loan: it is hidden from everyone and left out of every total, but kept for the record. */
    async voidLoan(id: number, reason: string) {
      const { data, error } = await supabase.from('loans').update({ voided_at: new Date().toISOString(), void_reason: reason }).eq('id', id).select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('You are not allowed to void this loan.')
      await refresh()
    },

    async restoreLoan(id: number) {
      const { data, error } = await supabase.from('loans').update({ voided_at: null, void_reason: '' }).eq('id', id).select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('You are not allowed to restore this loan.')
      await refresh()
    },

    async addAttachments(loanId: number, files: File[]) {
      for (const f of files) {
        const file_path = await uploadFile('loans', f)
        const { error } = await supabase.from('loan_attachments').insert({ loan_id: loanId, collateral_id: null, file_path, file_name: f.name })
        if (error) throw new Error(error.message)
      }
      await refresh()
    },

    /**
     * Inserts the loan as a draft or as a request, then its collateral and files.
     * If only the collateral step fails the loan still exists, so the caller gets a warning, not an error.
     */
    async create(input: NewLoanInput, asDraft = false): Promise<{ id: number; warning: string | null }> {
      const { data, error } = await supabase.from('loans').insert({ ...input.loan, status: asDraft ? 'drafted' : 'requested' }).select('id').single()
      if (error) throw new Error(error.message)
      const id = data.id as number
      const warning = await addCollaterals(id, input.collaterals)
      await refresh()
      return { id, warning }
    },

    /** Saves changes to a draft; collateral entered now is added to what the draft already has. */
    async saveDraft(id: number, input: NewLoanInput): Promise<{ warning: string | null }> {
      const { data, error } = await supabase.from('loans').update(input.loan).eq('id', id).eq('status', 'drafted').select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('This draft is no longer editable.')
      const warning = await addCollaterals(id, input.collaterals)
      await refresh()
      return { warning }
    },

    async deleteDraft(id: number) {
      const { data, error } = await supabase.from('loans').delete().eq('id', id).eq('status', 'drafted').select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('You are not allowed to delete this draft.')
      await refresh()
    },
  }
}
