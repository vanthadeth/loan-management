import { describe, expect, it } from 'vitest'
import { allocatePayment, buildSchedule, loanTotals, scheduleStatus, type LoanTerms } from './calc'

const base: LoanTerms = {
  amount: 3_000_000, currency: 'KHR', feePct: 3, ratePct: 2, rateBasis: 'month',
  occurrences: 6, intervalDays: 30, mode: 'equal', releaseDate: '2026-07-01', lateFeePerDay: 2000,
}

describe('schedule', () => {
  it('splits interest and principal evenly', () => {
    const rows = buildSchedule(base)
    expect(rows).toHaveLength(6)
    expect(rows[0]).toMatchObject({ due: '2026-07-31', interest: 60_000, principal: 500_000, total: 560_000 })
    expect(rows[5].due).toBe('2026-12-28')
  })
  it('interest-only keeps all principal for the last installment', () => {
    const rows = buildSchedule({ ...base, mode: 'interest' })
    expect(rows[0].principal).toBe(0)
    expect(rows[5].principal).toBe(3_000_000)
  })
  it('handles the three interest bases', () => {
    expect(loanTotals({ ...base, rateBasis: 'contract', ratePct: 10 }).interest).toBe(300_000)
    expect(loanTotals({ ...base, rateBasis: 'occurrence', ratePct: 1 }).interest).toBe(180_000)
    expect(loanTotals(base).interest).toBe(360_000)
  })
  it('deducts the service fee upfront', () => {
    const t = loanTotals(base)
    expect(t.fee).toBe(90_000)
    expect(t.net).toBe(2_910_000)
  })
  it('rounds USD to cents', () => {
    const t = loanTotals({ ...base, currency: 'USD', amount: 500, ratePct: 3, occurrences: 4 })
    expect(t.rows[0].interest).toBe(15)
    expect(t.fee).toBe(15)
  })
})

describe('payments', () => {
  it('marks paid and overdue installments and charges late fee per day', () => {
    const s = scheduleStatus(base, [{ amount: 560_000, lateFee: 0, paidOn: '2026-07-31' }], '2026-09-05')
    expect(s.rows[0].state).toBe('paid')
    expect(s.rows[1]).toMatchObject({ state: 'overdue', lateDays: 6, lateFee: 12_000 })
    expect(s.lateFeeOutstanding).toBe(12_000)
    expect(s.paidCount).toBe(1)
  })
  it('splits a partial payment across installments', () => {
    const s = scheduleStatus(base, [{ amount: 700_000, lateFee: 0, paidOn: '2026-07-31' }], '2026-08-15')
    expect(s.rows[0].state).toBe('paid')
    expect(s.rows[1]).toMatchObject({ state: 'partial', paidAmount: 140_000 })
  })
  it('settles late fee before installments', () => {
    const t = base
    const a = allocatePayment(t, [], 600_000, '2026-08-10')
    expect(a.lateFee).toBe(20_000) // 10 days late on installment 1
    expect(a.toInstallments).toBe(580_000)
    expect(a.after.rows[0].state).toBe('paid')
  })
  it('stops charging once an installment is paid in full', () => {
    const pays = [{ amount: 580_000, lateFee: 20_000, paidOn: '2026-08-10' }]
    const s = scheduleStatus(base, pays, '2026-12-01')
    expect(s.rows[0].lateDays).toBe(10)
    expect(s.rows[0].lateFee).toBe(20_000)
  })
  it('recognises a finished loan', () => {
    const total = loanTotals(base).total
    expect(scheduleStatus(base, [{ amount: total, lateFee: 0, paidOn: '2026-12-28' }], '2026-12-30').done).toBe(true)
  })
})
