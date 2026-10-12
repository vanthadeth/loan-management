import { describe, expect, it } from 'vitest'
import { inferPage } from './pagesetup'

const m = { top: 96, right: 96, bottom: 96, left: 96 }
describe('page setup', () => {
  it('recognises Letter and A4 from the exported width', () => {
    expect(inferPage(816, m).name).toBe('Letter') // 468pt + 2 × 72pt
    expect(inferPage(793.7, m).name).toBe('A4')
    expect(inferPage(793.7, m).hMm).toBeCloseTo(297, 0)
  })
  it('recognises landscape pages', () => {
    expect(inferPage(1122.5, m).name).toBe('A4 landscape')
    expect(inferPage(1056, m).name).toBe('Letter landscape')
  })
  it('keeps proportions for custom sizes', () => {
    const p = inferPage(700, m)
    expect(p.name).toBe('Custom')
    expect(p.hPx / p.wPx).toBeCloseTo(1.414, 2)
  })
})
