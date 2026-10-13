import { describe, expect, it } from 'vitest'
import { allocatePayment, buildSchedule, loanTotals, payoffAmount, scheduleStatus, splitPayments, type LoanTerms } from './calc'

const base: LoanTerms = {
  amount: 3_000_000, currency: 'KHR', feePct: 3, ratePct: 2, rateBasis: 'month',
  occurrences: 6, frequency: 'monthly', intervalDays: 30, mode: 'equal', releaseDate: '2026-07-01', lateFeePct: 5,
}

describe('schedule', () => {
  it('splits interest and principal evenly', () => {
    const rows = buildSchedule(base)
    expect(rows).toHaveLength(6)
    expect(rows[0]).toMatchObject({ due: '2026-08-01', interest: 60_000, principal: 500_000, total: 560_000 })
    expect(rows[5].due).toBe('2027-01-01')
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

describe('repeat dates', () => {
  it('monthly repeats on the same day of every month', () => {
    expect(buildSchedule({ ...base, releaseDate: '2026-10-12', occurrences: 4 }).map((r) => r.due)).toEqual(['2026-11-12', '2026-12-12', '2027-01-12', '2027-02-12'])
  })
  it('monthly on the 31st falls back to the last day of shorter months', () => {
    expect(buildSchedule({ ...base, releaseDate: '2026-01-31', occurrences: 4 }).map((r) => r.due)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
    expect(buildSchedule({ ...base, releaseDate: '2027-12-31', occurrences: 3 }).map((r) => r.due)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31'])
  })
  it('weekly repeats on the same weekday', () => {
    const rows = buildSchedule({ ...base, frequency: 'weekly', intervalDays: 7, releaseDate: '2026-10-12', occurrences: 3 })
    expect(rows.map((r) => r.due)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02'])
  })
  it('per-month interest counts calendar months for monthly loans', () => {
    expect(loanTotals({ ...base, occurrences: 12 }).interest).toBe(720_000)
  })
})

describe('payments', () => {
  // base: 6 × 560,000 = 3,360,000 owed in all; late fee 5% of what is still owed, per late month
  it('marks paid and overdue installments and charges a % of what is still owed per late month', () => {
    const s = scheduleStatus(base, [{ amount: 560_000, lateFee: 0, paidOn: '2026-08-01' }], '2026-09-06')
    expect(s.rows[0].state).toBe('paid')
    expect(s.rows[1]).toMatchObject({ state: 'overdue', lateDays: 5, lateOccurrences: 1, lateFee: 140_000 }) // 5% of 2,800,000
    expect(s.lateFeeOutstanding).toBe(140_000)
    expect(s.paidCount).toBe(1)
  })
  it('splits a partial payment across installments', () => {
    const s = scheduleStatus(base, [{ amount: 700_000, lateFee: 0, paidOn: '2026-08-01' }], '2026-08-15')
    expect(s.rows[0].state).toBe('paid')
    expect(s.rows[1]).toMatchObject({ state: 'partial', paidAmount: 140_000 })
  })
  it('settles late fee before installments', () => {
    const a = allocatePayment(base, [], 800_000, '2026-08-11')
    expect(a.lateFee).toBe(168_000) // 5% of 3,360,000 for the first late month
    expect(a.lateFeeWaived).toBe(0)
    expect(a.toInstallments).toBe(632_000)
    expect(a.after.rows[0].state).toBe('paid')
  })
  it('forgives the late fee the collector did not take', () => {
    const a = allocatePayment(base, [], 600_000, '2026-08-11', 50_000)
    expect(a).toMatchObject({ lateFeeDue: 168_000, lateFee: 50_000, lateFeeWaived: 118_000, toInstallments: 550_000 })
    expect(a.after.lateFeeOutstanding).toBe(0)
    const none = allocatePayment(base, [], 600_000, '2026-08-11', 0)
    expect(none).toMatchObject({ lateFee: 0, lateFeeWaived: 168_000, toInstallments: 600_000 })
    expect(none.after.rows[0].state).toBe('paid')
  })
  it('stops charging once nothing is overdue', () => {
    const pays = [{ amount: 728_000, lateFee: 168_000, paidOn: '2026-08-11' }]
    const s = scheduleStatus(base, pays, '2026-08-25')
    expect(s.rows[0]).toMatchObject({ lateDays: 10, lateFee: 168_000, lateOccurrences: 1 })
    expect(s.lateFeeOutstanding).toBe(0)
  })
  it('charges every late period on the balance owed at its start', () => {
    const s = scheduleStatus(base, [], '2026-10-02') // late from 08-01: periods start 08-01, 09-01, 10-01
    expect(s.rows[0]).toMatchObject({ lateOccurrences: 3, lateFee: 504_000 })
    const paid = scheduleStatus(base, [{ amount: 1_000_000, lateFee: 0, paidOn: '2026-08-20' }], '2026-09-10')
    // 08-01: 5% of 3,360,000; 08-20 pays #1 and part of #2; 09-01: #2 overdue, 5% of 2,360,000
    expect(paid.lateFeeAccrued).toBe(168_000 + 118_000)
    const w = scheduleStatus({ ...base, frequency: 'weekly', intervalDays: 7, releaseDate: '2026-07-01' }, [], '2026-07-23')
    expect(w.rows[0]).toMatchObject({ lateDays: 15, lateOccurrences: 3 })
  })
  it('recognises a finished loan', () => {
    const total = loanTotals(base).total
    expect(scheduleStatus(base, [{ amount: total, lateFee: 0, paidOn: '2027-01-01' }], '2027-01-02').done).toBe(true)
  })
})

describe('refinancing', () => {
  const first = { amount: 560_000, lateFee: 0, paidOn: '2026-08-01' }
  it('pays off what is due plus the principal not yet due', () => {
    // on its due date #2 is not late yet: #2 in full + 4 × 500,000 principal; the 4 × 60,000 interest not due is dropped
    expect(payoffAmount(base, [first], '2026-09-01')).toEqual({ lateFee: 0, total: 2_560_000 })
    // 9 days later #2 is late: one late month at 5% of the 2,800,000 still owed on 09-01
    expect(payoffAmount(base, [first], '2026-09-10')).toEqual({ lateFee: 140_000, total: 2_700_000 })
  })
  it('leaves nothing owed on the old loan but the dropped interest', () => {
    const payoff = { amount: 2_700_000, lateFee: 140_000, paidOn: '2026-09-10' }
    const s = scheduleStatus(base, [first, payoff], '2026-09-10')
    expect(s.lateFeeOutstanding).toBe(0)
    expect(s.rows.filter((r) => r.state === 'overdue')).toHaveLength(0)
    expect(s.remaining).toBe(240_000)
  })
  it('counts only the interest that was due as interest', () => {
    const pays = [
      { id: 1, amount: 560_000, late_fee: 0, paid_on: '2026-08-01', note: '' },
      { id: 2, amount: 2_700_000, late_fee: 140_000, paid_on: '2026-09-10', note: 'Refinanced into L-020' },
    ]
    const split = splitPayments(base, pays)
    expect(split.get(1)).toEqual({ principal: 500_000, interest: 60_000 })
    expect(split.get(2)).toEqual({ principal: 2_500_000, interest: 60_000 })
  })
  it('charges the service fee on the new cash only', () => {
    const t = loanTotals({ ...base, amount: 3_200_000, carried: 2_700_000 })
    expect(t.fee).toBe(15_000) // 3% of 500,000
    expect(t.net).toBe(485_000) // what the borrower receives
  })
})
