import type { LoanView } from './book'
import { dueParts, serviceFee } from './money'
import { addDays, diffDays, todayIso } from '../lib/calc'
import { fmtD } from '../lib/format'
import { daysPastDue } from '../lib/risk'

export interface Item { key: string; v: LoanView; main: string; sub: string; amount?: number; tone?: 'warn'; today?: boolean }

/** Sort the loans into the day's to-do groups. */
export function buildToday(views: LoanView[], canApprove = false) {
  const today = todayIso()
  const soon = addDays(today, 3)

  // written-off loans are chased as recoveries, not as the day's collections
  const active = views.filter((v) => v.active && !v.loan.written_off_at)
  const late: (Item & { dpd: number })[] = []
  const dueToday: Item[] = []
  const dueSoon: Item[] = []
  for (const v of active) {
    const overdue = v.status.rows.filter((r) => r.state === 'overdue')
    const dpd = daysPastDue(overdue)
    if (dpd > 0) {
      const owed = overdue.reduce((sum, r) => sum + dueParts(r).remaining, 0)
      late.push({ key: 'l' + v.loan.id, v, main: `${dpd} day${dpd > 1 ? 's' : ''} late`, sub: `since ${fmtD(overdue[0].due)}`, amount: owed, tone: 'warn', dpd })
    }
    for (const r of v.status.rows) {
      if (r.state === 'paid' || r.state === 'overdue') continue
      const item = { key: `d${v.loan.id}-${r.i}`, v, amount: dueParts(r).remaining }
      if (r.due === today) dueToday.push({ ...item, main: `Installment ${r.i} of ${v.loan.occurrences}`, sub: r.state === 'partial' ? 'part paid' : '' })
      else if (r.due > today && r.due <= soon) dueSoon.push({ ...item, main: `Installment ${r.i} of ${v.loan.occurrences}`, sub: `due ${fmtD(r.due)}` })
    }
  }
  late.sort((a, b) => b.dpd - a.dpd)

  const pending: Item[] = views.filter((v) => v.loan.status === 'requested')
    .map((v) => ({ key: 'p' + v.loan.id, v, main: 'Waiting for approval', sub: `requested ${fmtD(v.loan.created_at.slice(0, 10))}`, amount: v.loan.amount }))
  const release: Item[] = views.filter((v) => v.loan.status === 'approved' && v.loan.release_date >= today)
    .sort((a, b) => (a.loan.release_date < b.loan.release_date ? -1 : 1))
    .map((v) => {
      const days = diffDays(today, v.loan.release_date)
      return { key: 'r' + v.loan.id, v, main: days === 0 ? 'Release today' : `Release ${fmtD(v.loan.release_date)}`, sub: '', amount: v.loan.amount - Number(v.loan.carried_amount ?? 0) - serviceFee(v.loan), today: days === 0 }
    })

  // what the More tile counts: everything that needs doing today
  const todo = late.length + dueToday.length + (canApprove ? pending.length : 0) + release.filter((x) => x.today).length
  return { today, late, dueToday, dueSoon, pending, release, todo }
}


/** Loans in progress and the worst days past due, per borrower. */
export function borrowerStanding(views: LoanView[]) {
  const standing = new Map<number, { open: number; late: number }>()
  for (const v of views) {
    if (!v.active) continue
    const cur = standing.get(v.loan.borrower_id) ?? { open: 0, late: 0 }
    cur.open += 1
    cur.late = Math.max(cur.late, daysPastDue(v.status.rows))
    standing.set(v.loan.borrower_id, cur)
  }
  return standing
}
