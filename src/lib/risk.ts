// Portfolio at risk and aging (finance rules R-RISK-1/2). Days past due counts from the oldest unpaid due date.
import type { InstallmentStatus } from './calc'

export const DPD_BUCKETS: { label: string; from: number; to: number }[] = [
  { label: 'Current', from: 0, to: 0 },
  { label: '1-7 days', from: 1, to: 7 },
  { label: '8-30 days', from: 8, to: 30 },
  { label: '31-60 days', from: 31, to: 60 },
  { label: '61-90 days', from: 61, to: 90 },
  { label: 'Over 90 days', from: 91, to: Infinity },
]

/** Days since the oldest installment that is overdue was due; 0 when nothing is overdue. */
export const daysPastDue = (rows: Pick<InstallmentStatus, 'state' | 'lateDays'>[]) =>
  rows.reduce((m, r) => (r.state === 'overdue' && r.lateDays > m ? r.lateDays : m), 0)

export interface RiskLoan { dpd: number; principal: number }

/** Buckets, and PAR1 / PAR30: outstanding principal of loans 1+ / more than 30 days past due, as a share of all outstanding principal. */
export function portfolioAtRisk(loans: RiskLoan[]) {
  const total = loans.reduce((s, l) => s + l.principal, 0)
  const buckets = DPD_BUCKETS.map((b) => {
    const inside = loans.filter((l) => l.dpd >= b.from && l.dpd <= b.to)
    return { label: b.label, loans: inside.length, principal: inside.reduce((s, l) => s + l.principal, 0) }
  })
  const at = (min: number) => loans.filter((l) => l.dpd >= min).reduce((s, l) => s + l.principal, 0)
  const share = (n: number) => (total > 0 ? n / total : 0)
  return { total, buckets, par1: share(at(1)), par30: share(at(31)), par1Amount: at(1), par30Amount: at(31) }
}
