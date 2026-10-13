import { describe, expect, it } from 'vitest'
import { daysPastDue, portfolioAtRisk } from './risk'

describe('portfolio at risk', () => {
  it('counts days past due from the oldest overdue installment', () => {
    expect(daysPastDue([{ state: 'paid', lateDays: 0 }, { state: 'overdue', lateDays: 12 }, { state: 'overdue', lateDays: 3 }])).toBe(12)
    expect(daysPastDue([{ state: 'upcoming', lateDays: 0 }])).toBe(0)
  })
  it('buckets loans by days past due and works out PAR1 and PAR30', () => {
    const r = portfolioAtRisk([
      { dpd: 0, principal: 600 }, { dpd: 5, principal: 100 }, { dpd: 30, principal: 100 }, { dpd: 31, principal: 100 }, { dpd: 120, principal: 100 },
    ])
    expect(r.total).toBe(1000)
    expect(r.buckets.map((b) => [b.label, b.loans, b.principal])).toEqual([
      ['Current', 1, 600], ['1-7 days', 1, 100], ['8-30 days', 1, 100], ['31-60 days', 1, 100], ['61-90 days', 0, 0], ['Over 90 days', 1, 100],
    ])
    expect(r.par1).toBeCloseTo(0.4)
    expect(r.par30).toBeCloseTo(0.2) // 31 and 120 days
  })
  it('is zero for an empty book', () => {
    expect(portfolioAtRisk([])).toMatchObject({ total: 0, par1: 0, par30: 0 })
  })
})
