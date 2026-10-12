import { describe, expect, it } from 'vitest'
import { allocatePayment, buildSchedule, loanTotals, scheduleStatus, type LoanTerms } from './calc'

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
  it('marks paid and overdue installments and charges a % late fee per late month', () => {
    const s = scheduleStatus(base, [{ amount: 560_000, lateFee: 0, paidOn: '2026-08-01' }], '2026-09-06')
    expect(s.rows[0].state).toBe('paid')
    expect(s.rows[1]).toMatchObject({ state: 'overdue', lateDays: 5, lateOccurrences: 1, lateFee: 28_000 })
    expect(s.lateFeeOutstanding).toBe(28_000)
    expect(s.paidCount).toBe(1)
  })
  it('splits a partial payment across installments', () => {
    const s = scheduleStatus(base, [{ amount: 700_000, lateFee: 0, paidOn: '2026-08-01' }], '2026-08-15')
    expect(s.rows[0].state).toBe('paid')
    expect(s.rows[1]).toMatchObject({ state: 'partial', paidAmount: 140_000 })
  })
  it('settles late fee before installments', () => {
    const t = base
    const a = allocatePayment(t, [], 600_000, '2026-08-11')
    expect(a.lateFee).toBe(28_000) // 5% of 560,000 for the first late month
    expect(a.toInstallments).toBe(572_000)
    expect(a.after.rows[0].state).toBe('paid')
  })
  it('stops charging once an installment is paid in full', () => {
    const pays = [{ amount: 588_000, lateFee: 28_000, paidOn: '2026-08-11' }]
    const s = scheduleStatus(base, pays, '2026-12-01')
    expect(s.rows[0].lateDays).toBe(10)
    expect(s.rows[0].lateFee).toBe(28_000)
  })
  it('charges again for every further late period', () => {
    const s = scheduleStatus(base, [], '2026-10-02') // due 08-01: months late = 3 (to 09-01, 10-01, then 11-01 started)
    expect(s.rows[0]).toMatchObject({ lateOccurrences: 3, lateFee: 84_000 })
    const w = scheduleStatus({ ...base, frequency: 'weekly', intervalDays: 7, releaseDate: '2026-07-01' }, [], '2026-07-23')
    expect(w.rows[0]).toMatchObject({ lateDays: 15, lateOccurrences: 3 })
  })
  it('recognises a finished loan', () => {
    const total = loanTotals(base).total
    expect(scheduleStatus(base, [{ amount: total, lateFee: 0, paidOn: '2027-01-01' }], '2027-01-02').done).toBe(true)
  })
})
