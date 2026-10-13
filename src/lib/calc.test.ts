import { describe, expect, it } from 'vitest'
import { allocatePayment, buildSchedule, earlyPayoffQuote, effectiveRate, loanTotals, payoffAmount, scheduleStatus, settleLateFee, splitPayments, type LoanTerms } from './calc'

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
  // base: 6 × (500,000 principal + 60,000 interest); late fee is 5% of the unpaid principal, per late month
  it('marks paid and overdue installments and charges a % of the unpaid principal per late month', () => {
    const s = scheduleStatus(base, [{ amount: 560_000, lateFee: 0, paidOn: '2026-08-01' }], '2026-09-06')
    expect(s.rows[0].state).toBe('paid')
    expect(s.rows[1]).toMatchObject({ state: 'overdue', lateDays: 5, lateOccurrences: 1, lateFee: 125_000 }) // 5% of 2,500,000
    expect(s.lateFeeOutstanding).toBe(125_000)
    expect(s.paidCount).toBe(1)
  })
  it('splits a partial payment across installments', () => {
    const s = scheduleStatus(base, [{ amount: 700_000, lateFee: 0, paidOn: '2026-08-01' }], '2026-08-15')
    expect(s.rows[0].state).toBe('paid')
    expect(s.rows[1]).toMatchObject({ state: 'partial', paidAmount: 140_000 })
  })
  it('applies a payment to installments only, never to late fee', () => {
    const a = allocatePayment(base, [], 800_000, '2026-08-11')
    expect(a.after.rows[0].state).toBe('paid')
    expect(a.after.rows[1].paidAmount).toBe(240_000)
    expect(a.after.lateFeeOutstanding).toBe(150_000) // 5% of the 3,000,000 principal for the first late month, still due
  })
  it('collects part of the late fee on its own and forgives the rest', () => {
    expect(settleLateFee(base, [], 50_000, '2026-08-11')).toEqual({ due: 150_000, lateFee: 50_000, lateFeeWaived: 100_000 })
    expect(settleLateFee(base, [], 0, '2026-08-11')).toEqual({ due: 150_000, lateFee: 0, lateFeeWaived: 150_000 })
    expect(settleLateFee(base, [], 999_999, '2026-08-11')).toEqual({ due: 150_000, lateFee: 150_000, lateFeeWaived: 0 })
    // the settlement is its own record: it adds nothing to the installments
    const rec = { amount: 50_000, lateFee: 50_000, lateFeeWaived: 100_000, paidOn: '2026-08-11' }
    const s = scheduleStatus(base, [rec], '2026-08-11')
    expect(s).toMatchObject({ collected: 0, lateFeeOutstanding: 0, lateFeePaid: 50_000, lateFeeWaived: 100_000 })
    expect(scheduleStatus(base, [{ ...rec, amount: 0, lateFee: 0, lateFeeWaived: 150_000 }], '2026-08-11').lateFeeOutstanding).toBe(0)
  })
  it('stops charging once nothing is overdue', () => {
    const pays = [{ amount: 710_000, lateFee: 150_000, paidOn: '2026-08-11' }]
    const s = scheduleStatus(base, pays, '2026-08-25')
    expect(s.rows[0]).toMatchObject({ lateDays: 10, lateFee: 150_000, lateOccurrences: 1 })
    expect(s.lateFeeOutstanding).toBe(0)
  })
  it('charges every late period on the unpaid principal at its start', () => {
    const s = scheduleStatus(base, [], '2026-10-02') // late from 08-01: periods start 08-01, 09-01, 10-01
    expect(s.rows[0]).toMatchObject({ lateOccurrences: 3, lateFee: 450_000 })
    const paid = scheduleStatus(base, [{ amount: 1_000_000, lateFee: 0, paidOn: '2026-08-20' }], '2026-09-10')
    // 08-01: 5% of 3,000,000; 08-20 pays #1 and 380,000 of #2's principal (after its 60,000 interest); 09-01: 5% of 2,120,000
    expect(paid.lateFeeAccrued).toBe(150_000 + 106_000)
    const w = scheduleStatus({ ...base, frequency: 'weekly', intervalDays: 7, releaseDate: '2026-07-01' }, [], '2026-07-23')
    expect(w.rows[0]).toMatchObject({ lateDays: 15, lateOccurrences: 3 })
  })
  it('recognises a finished loan', () => {
    const total = loanTotals(base).total
    expect(scheduleStatus(base, [{ amount: total, lateFee: 0, paidOn: '2027-01-01' }], '2027-01-02').done).toBe(true)
  })
})

describe('rounding', () => {
  it('makes the principal add up to the loan amount and the interest to the total interest', () => {
    // 1,000,000 riel over 60 days at 17% per contract: 16,666.67 a day rounds to 16,700
    const t: LoanTerms = { ...base, amount: 1_000_000, ratePct: 17, rateBasis: 'contract', occurrences: 60, frequency: 'daily', intervalDays: 1, mode: 'equal' }
    const rows = buildSchedule(t)
    expect(rows.reduce((s, r) => s + r.principal, 0)).toBe(1_000_000)
    expect(rows.reduce((s, r) => s + r.interest, 0)).toBe(170_000)
    expect(rows[0]).toMatchObject({ principal: 16_700, interest: 2_800 })
    expect(rows[59]).toMatchObject({ principal: 14_700, interest: 4_800 })
    // nothing collected yet, nothing due: refinancing carries over exactly the loan amount
    expect(payoffAmount(t, [], t.releaseDate).total).toBe(1_000_000)
    const thirds = buildSchedule({ ...t, occurrences: 3, frequency: 'monthly', intervalDays: 30 })
    expect(thirds.map((r) => r.principal)).toEqual([333_300, 333_300, 333_400])
  })
})

describe('refinancing', () => {
  const first = { amount: 560_000, lateFee: 0, paidOn: '2026-08-01' }
  it('pays off what is due plus the principal not yet due', () => {
    // on its due date #2 is not late yet: #2 in full + 4 × 500,000 principal; the 4 × 60,000 interest not due is dropped
    expect(payoffAmount(base, [first], '2026-09-01')).toEqual({ lateFee: 0, total: 2_560_000 })
    // 9 days later #2 is late: one late month at 5% of the 2,500,000 unpaid principal on 09-01
    expect(payoffAmount(base, [first], '2026-09-10')).toEqual({ lateFee: 125_000, total: 2_685_000 })
  })
  it('leaves nothing owed on the old loan but the dropped interest', () => {
    const payoff = { amount: 2_685_000, lateFee: 125_000, paidOn: '2026-09-10' }
    const s = scheduleStatus(base, [first, payoff], '2026-09-10')
    expect(s.lateFeeOutstanding).toBe(0)
    expect(s.rows.filter((r) => r.state === 'overdue')).toHaveLength(0)
    expect(s.remaining).toBe(240_000)
  })
  it('counts only the interest that was due as interest', () => {
    const pays = [
      { id: 1, amount: 560_000, late_fee: 0, paid_on: '2026-08-01', note: '' },
      { id: 2, amount: 2_685_000, late_fee: 125_000, paid_on: '2026-09-10', note: 'Refinanced into L-020' },
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

describe('late fee lines', () => {
  it('lists every late period with the unpaid principal it was charged on', () => {
    const s = scheduleStatus(base, [{ amount: 1_000_000, lateFee: 0, paidOn: '2026-08-20' }], '2026-09-10')
    expect(s.lateLines).toEqual([
      { from: '2026-08-01', installment: 1, owed: 3_000_000, pct: 5, fee: 150_000 },
      { from: '2026-09-01', installment: 2, owed: 2_120_000, pct: 5, fee: 106_000 },
    ])
  })
})

describe('remaining split', () => {
  it('splits what is left into principal and interest', () => {
    const none = scheduleStatus(base, [], '2026-07-02')
    expect(none).toMatchObject({ remaining: 3_360_000, remainingPrincipal: 3_000_000, remainingInterest: 360_000 })
    const one = scheduleStatus(base, [{ amount: 560_000, lateFee: 0, paidOn: '2026-08-01' }], '2026-08-02')
    expect(one).toMatchObject({ remaining: 2_800_000, remainingPrincipal: 2_500_000, remainingInterest: 300_000 })
    // 700,000: #1 in full (560,000), then 140,000 of #2 = 60,000 interest first, then 80,000 principal
    const part = scheduleStatus(base, [{ amount: 700_000, lateFee: 0, paidOn: '2026-08-01' }], '2026-08-02')
    expect(part).toMatchObject({ remaining: 2_660_000, remainingPrincipal: 2_420_000, remainingInterest: 240_000 })
  })
  it('adds up to the remaining balance, rounding included', () => {
    const t: LoanTerms = { ...base, amount: 1_000_000, ratePct: 17, rateBasis: 'contract', occurrences: 60, frequency: 'daily', intervalDays: 1 }
    for (const paid of [0, 19_500, 250_000, 1_000_000, 1_170_000]) {
      const s = scheduleStatus(t, paid ? [{ amount: paid, lateFee: 0, paidOn: t.releaseDate }] : [], t.releaseDate)
      expect(s.remainingPrincipal + s.remainingInterest).toBe(s.remaining)
    }
  })
})

describe('stored schedule', () => {
  // the same loan as stored by private.build_schedule at approval (checked against buildSchedule on 150 random loans)
  it('matches the schedule the database stores', () => {
    const t: LoanTerms = { amount: 2_500_000, currency: 'KHR', feePct: 3, ratePct: 17, rateBasis: 'contract', occurrences: 12, frequency: 'weekly', intervalDays: 7, mode: 'interest', releaseDate: '2026-10-13', lateFeePct: 5 }
    const rows = buildSchedule(t)
    expect(rows[0]).toMatchObject({ due: '2026-10-20', principal: 0, interest: 35_400 })
    expect(rows[11]).toMatchObject({ due: '2027-01-05', principal: 2_500_000, interest: 35_600 })
    const daily: LoanTerms = { ...t, amount: 1_000_000, occurrences: 60, frequency: 'daily', intervalDays: 1, mode: 'equal', releaseDate: '2026-10-01' }
    expect(buildSchedule(daily)[59]).toMatchObject({ principal: 14_700, interest: 4_800 })
  })
})

describe('late fee grace and cap', () => {
  it('does not count a payment made within the grace days as late', () => {
    const t = { ...base, lateGraceDays: 3 }
    const on = scheduleStatus(t, [{ amount: 560_000, lateFee: 0, paidOn: '2026-08-04' }], '2026-08-10') // 3 days after 08-01
    expect(on.lateFeeAccrued).toBe(0)
    const over = scheduleStatus(t, [{ amount: 560_000, lateFee: 0, paidOn: '2026-08-05' }], '2026-08-10') // 4 days: late
    expect(over.lateFeeAccrued).toBe(150_000)
    // still unpaid inside the grace window: nothing is due yet
    expect(scheduleStatus(t, [], '2026-08-03').lateFeeOutstanding).toBe(0)
  })
  it('stops charging at the cap, as a % of the loan amount, across all periods', () => {
    const t = { ...base, lateCapPct: 6 } // 6% of 3,000,000 = 180,000
    const s = scheduleStatus(t, [], '2026-10-02') // three periods would be 150,000 each = 450,000
    expect(s.lateFeeAccrued).toBe(180_000)
    expect(s.lateLines.map((l) => l.fee)).toEqual([150_000, 30_000])
    expect(scheduleStatus({ ...base, lateCapPct: null }, [], '2026-10-02').lateFeeAccrued).toBe(450_000)
  })
})

describe('early payoff', () => {
  const first = { amount: 560_000, lateFee: 0, paidOn: '2026-08-01' }
  it('is the unpaid principal plus the prepayment fee, with no future interest', () => {
    const q = earlyPayoffQuote(base, [first], '2026-08-15', 2)
    expect(q).toMatchObject({ eligible: true, principal: 2_500_000, interestDropped: 300_000, fee: 50_000, total: 2_550_000 })
  })
  it('is not valid while an installment is due or a late fee is outstanding', () => {
    expect(earlyPayoffQuote(base, [first], '2026-09-01', 2)).toMatchObject({ eligible: false, reason: 'Pay the installments that are due first.' })
    expect(earlyPayoffQuote(base, [first], '2026-09-10', 2).eligible).toBe(false)
    // overdue installment paid but its late fee not collected yet
    const late = earlyPayoffQuote(base, [first, { amount: 560_000, lateFee: 0, paidOn: '2026-09-06' }], '2026-09-07', 2)
    expect(late).toMatchObject({ eligible: false, reason: 'Collect or forgive the late fee first.' })
  })
  it('closes the loan: principal and fee in cash, the interest not yet due waived', () => {
    const payoff = { amount: 2_550_000, lateFee: 0, prepayFee: 50_000, interestWaived: 300_000, paidOn: '2026-08-15' }
    const s = scheduleStatus(base, [first, payoff], '2026-08-15')
    expect(s).toMatchObject({ done: true, remaining: 0, collected: 3_060_000, prepayFeePaid: 50_000, interestWaived: 300_000 })
    const split = splitPayments(base, [
      { id: 1, amount: 560_000, late_fee: 0, paid_on: '2026-08-01', note: '' },
      { id: 2, amount: 2_550_000, late_fee: 0, prepay_fee: 50_000, paid_on: '2026-08-15', note: 'Early payoff' },
    ])
    expect(split.get(2)).toEqual({ principal: 2_500_000, interest: 0 })
  })
})

describe('effective rate', () => {
  it('solves the daily rate and annualises it', () => {
    // 1,000,000 received, 1,100,000 paid after 100 days: (1+d)^100 = 1.1
    const t: LoanTerms = { ...base, amount: 1_000_000, feePct: 0, ratePct: 10, rateBasis: 'contract', occurrences: 1, frequency: 'custom', intervalDays: 100, mode: 'equal' }
    expect(effectiveRate(t)).toBeCloseTo(0.348, 2)
  })
  it('is higher than the flat rate once the service fee is taken upfront', () => {
    const noFee = effectiveRate({ ...base, feePct: 0 })
    const withFee = effectiveRate(base)
    expect(withFee).toBeGreaterThan(noFee)
    // 2% a month flat with the principal repaid along the way costs far more than 24% a year
    expect(noFee).toBeGreaterThan(0.24)
    expect(effectiveRate({ ...base, feePct: 0, ratePct: 0 })).toBe(0)
  })
})
