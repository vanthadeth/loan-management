import { describe, expect, it } from 'vitest'
import { khDate, khDigits, khMoney, khMoneyWords, khWeekdayDate, khWords } from './khmer'

describe('khmer formatting', () => {
  it('converts digits and dates', () => {
    expect(khDigits('1,500.50')).toBe('១,៥០០.៥០')
    expect(khDate('2026-10-12')).toBe('ថ្ងៃទី១២ ខែតុលា ឆ្នាំ២០២៦')
  })
  it('formats money', () => {
    expect(khMoney(3_000_000, 'KHR')).toBe('៣,០០០,០០០ រៀល')
    expect(khMoney(500, 'USD')).toBe('៥០០ ដុល្លារ')
    expect(khMoney(12.5, 'USD')).toBe('១២.៥០ ដុល្លារ')
  })
  it('writes numbers in words', () => {
    expect(khWords(0)).toBe('សូន្យ')
    expect(khWords(11)).toBe('ដប់មួយ')
    expect(khWords(25)).toBe('ម្ភៃប្រាំ')
    expect(khWords(560_000)).toBe('ប្រាំសែនប្រាំមួយម៉ឺន')
    expect(khWords(1_500_000)).toBe('មួយលានប្រាំសែន')
    expect(khWords(3_000_000)).toBe('បីលាន')
    expect(khMoneyWords(500, 'USD')).toBe('ប្រាំរយដុល្លារ')
  })
})

describe('weekday dates', () => {
  it('writes the weekday, Khmer month and Latin digits', () => {
    expect(khWeekdayDate('2026-10-02')).toBe('ថ្ងៃសុក្រ 2 តុលា 2026')
    expect(khWeekdayDate('2026-10-04')).toBe('ថ្ងៃអាទិត្យ 4 តុលា 2026')
  })
})
