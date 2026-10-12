// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { allScheduleRows, allValues, contractValues, fillScheduleRows, fillScheduleTable, fillTemplate, scheduleRowValues, type ContractInput } from './contract'
import type { LoanTerms } from './calc'

const terms: LoanTerms = {
  amount: 3_000_000, currency: 'KHR', feePct: 3, ratePct: 2, rateBasis: 'month', occurrences: 6, frequency: 'monthly',
  intervalDays: 30, mode: 'equal', releaseDate: '2026-10-12', lateFeePct: 5,
}
const input = (over: Partial<ContractInput> = {}, t: Partial<LoanTerms> = {}): ContractInput => ({
  loanId: 14, terms: { ...terms, ...t }, frequency: t.frequency ?? 'monthly', payMethod: 'bank', payRemarks: '',
  bank: { bank: 'ABA Bank', account_no: '000 123 456', account_name: 'Family Loans' },
  borrower: { name: 'Sokha Chan', name_km: 'សុខា ចាន់', gender: 'F', id_no: '010 234 567', dob: null, phone: '012 345 678', address: 'Phnom Penh' },
  collaterals: [], supervisor: 'Vichea', supervisorName: { km: 'វិជ្ជា លី', latin: 'Vichea Ly' }, collector: 'Sok', collectorName: { km: 'សុខ ចាន់', latin: 'Sok Chan' }, ...over,
})
const get = (v: ReturnType<typeof contractValues>, k: string) => v[k].text

describe('contract values', () => {
  it('fills bank, gender and words in Khmer', () => {
    const v = contractValues(input())
    expect(get(v, 'bank_name')).toBe('ABA Bank')
    expect(get(v, 'bank_account_no')).toBe('០០០ ១២៣ ៤៥៦')
    expect(get(v, 'bank_account_name')).toBe('Family Loans')
    expect(get(v, 'borrower_gender')).toBe('ស្រី')
    expect(get(v, 'installment_words')).toBe('ប្រាំសែនប្រាំមួយម៉ឺនរៀល')
  })
  it('leaves bank fields empty when the borrower pays another way', () => {
    const v = contractValues(input({ payMethod: 'cash', bank: null }))
    expect(get(v, 'bank_name')).toBe('')
    expect(get(v, 'pay_method')).toBe('សាច់ប្រាក់')
  })
  it('measures the contract in months, weeks or days by how it is paid', () => {
    expect(get(contractValues(input()), 'contract_duration')).toBe('៦ ខែ')
    expect(get(contractValues(input({}, { frequency: 'weekly', intervalDays: 7, occurrences: 8 })), 'contract_duration')).toBe('៨ សប្តាហ៍')
    expect(get(contractValues(input({}, { frequency: 'daily', intervalDays: 1, occurrences: 30 })), 'contract_duration')).toBe('៣០ ថ្ងៃ')
    expect(get(contractValues(input({}, { frequency: 'custom', intervalDays: 10, occurrences: 4 })), 'contract_duration')).toBe('៤០ ថ្ងៃ')
  })
  it('counts the duration in days between release and the last payment', () => {
    expect(get(contractValues(input()), 'contract_duration_days')).toBe('១៨២') // 12 Oct 2026 to 12 Apr 2027
    expect(get(contractValues(input({}, { frequency: 'weekly', intervalDays: 7, occurrences: 8 })), 'contract_duration_days')).toBe('៥៦')
  })
  it('gives the release date and the first payment date', () => {
    const v = contractValues(input())
    expect(get(v, 'released_date')).toBe('ថ្ងៃទី១២ ខែតុលា ឆ្នាំ២០២៦')
    expect(get(v, 'release_date')).toBe(get(v, 'released_date'))
    expect(get(v, 'first_payment_date')).toBe('ថ្ងៃទី១២ ខែវិច្ឆិកា ឆ្នាំ២០២៦') // same day next month
    expect(get(contractValues(input({}, { frequency: 'weekly', intervalDays: 7 }), 'en'), 'first_payment_date')).toBe('19 Oct 2026')
  })
  it('works in English too', () => {
    const v = contractValues(input(), 'en')
    expect(get(v, 'borrower_gender')).toBe('Female')
    expect(get(v, 'contract_duration')).toBe('6 months')
  })
  it('fills placeholders split across formatting spans', () => {
    expect(fillTemplate('Bank: {{<span>bank_</span><span>name}}', contractValues(input()))).toBe('Bank: ABA Bank')
  })

  it('repeats a table row once per payment', () => {
    const html = '<table><tr><td>No</td><td>Date</td></tr><tr><td>{{schedule_no}}</td><td>{{schedule_<span>date}}</span></td><td>{{schedule_total}}</td></tr></table>'
    const out = fillScheduleRows(html, scheduleRowValues(input({}, { occurrences: 3 })))
    const rows = new DOMParser().parseFromString(out, 'text/html').querySelectorAll('tr')
    expect(rows).toHaveLength(4) // header + 3 payments
    expect(rows[1].textContent).toContain('1')
    expect(rows[1].textContent).toContain('12 វិច្ឆិកា 2026')
    expect(rows[3].textContent).toContain('1,060,000.00')
    expect(rows[3].textContent).not.toContain('រៀល')
  })
  it('leaves templates without row placeholders alone', () => {
    const html = '<p>{{schedule}}</p>'
    expect(fillScheduleRows(html, scheduleRowValues(input()))).toBe(html)
  })

  it('puts the schedule table in the placeholder paragraph\'s own text style', () => {
    const html = '<html><body><p class="c2"><span class="c9" style="font-size:14pt">{{sched<span>ule}}</span></span></p><p>after</p></body></html>'
    const out = fillScheduleTable(html, input({}, { occurrences: 2 }), 'km')
    const doc = new DOMParser().parseFromString(out, 'text/html')
    expect(doc.querySelectorAll('table')).toHaveLength(1)
    expect(doc.querySelector('.komjei-annex')?.textContent).toContain('ឧបសម្ព័ន្ធ')
    expect(doc.querySelector('.komjei-annex')?.getAttribute('style')).toContain('page-break-before:always')
    expect(doc.querySelectorAll('tbody tr')).toHaveLength(2)
    const cellSpan = doc.querySelector('tbody td span')!
    expect(cellSpan.getAttribute('class')).toBe('c9')
    expect(cellSpan.getAttribute('style')).toContain('font-size:14pt')
    expect(doc.querySelector('thead th span')!.getAttribute('style')).toContain('color:#fff')
    expect(doc.body.textContent).not.toContain('{{')
    expect(out).toContain('0.5pt solid #9a9a9a')
  })
  it('leaves {{schedule}} alone when it sits inside other text', () => {
    const html = '<p>See {{schedule}} below</p>'
    expect(fillScheduleTable(html, input(), 'km')).toBe(html)
  })
  it('{{schedule_table}} gives the table without the annex page', () => {
    const out = fillScheduleTable('<p><span class="c9">{{schedule_table}}</span></p>', input(), 'km')
    const doc = new DOMParser().parseFromString(out, 'text/html')
    expect(doc.querySelectorAll('table')).toHaveLength(1)
    expect(doc.querySelector('.komjei-annex')).toBeNull()
  })

  it('offers every placeholder in _km and _en as well', () => {
    const v = allValues(input(), 'en')
    expect(get(v, 'amount')).toBe('3,000,000 ៛')
    expect(get(v, 'amount_km')).toBe('៣,០០០,០០០ រៀល')
    expect(get(v, 'amount_en')).toBe('3,000,000 ៛')
    expect(get(v, 'borrower_gender_km')).toBe('ស្រី')
    expect(get(v, 'contract_duration_en')).toBe('6 months')
    expect(get(v, 'first_payment_date_en')).toBe('12 Nov 2026')
  })
  it('keeps names that already end in _km as they were', () => {
    expect(get(allValues(input({ borrower: { name: 'Sokha', name_km: '', gender: 'F', id_no: '', dob: null, phone: '', address: '' } }), 'km'), 'borrower_name_km')).toBe('')
  })
  it('gives per-payment rows in both languages', () => {
    const rows = allScheduleRows(input(), 'km')
    expect(rows[0].schedule_date.text).toBe('12 វិច្ឆិកា 2026')
    expect(rows[0].schedule_date_en.text).toBe('12 Nov 2026')
    expect(rows[0].schedule_weekday_date_km.text).toBe('ថ្ងៃព្រហស្បតិ៍ 12 វិច្ឆិកា 2026')
  })
  it('{{schedule_en}} makes the English annex inside a Khmer template', () => {
    const out = fillScheduleTable('<p><span>{{schedule_en}}</span></p>', input(), 'km')
    expect(out).toContain('ANNEX')
    expect(out).toContain('Balance at start')
    expect(out).not.toContain('ឧបសម្ព័ន្ធ')
  })

  it('uses the Khmer name by default and the Latin name in English templates', () => {
    const b = { name: 'Sokha Chan', name_km: 'សុខា ចាន់', gender: 'F' as const, id_no: '', dob: null, phone: '', address: '' }
    expect(get(contractValues(input({ borrower: b }), 'km'), 'borrower_name')).toBe('សុខា ចាន់')
    expect(get(contractValues(input({ borrower: b }), 'en'), 'borrower_name')).toBe('Sokha Chan')
    expect(get(contractValues(input({ borrower: { ...b, name: '' } }), 'en'), 'borrower_name')).toBe('សុខា ចាន់')
  })

  it('gives the collector', () => {
    expect(get(contractValues(input()), 'collector')).toBe('Sok')
    expect(get(contractValues(input()), 'collector_name')).toBe('សុខ ចាន់')
    expect(get(contractValues(input(), 'en'), 'collector_name')).toBe('Sok Chan')
  })
  it('gives the supervisor full name', () => {
    expect(get(contractValues(input()), 'supervisor_name')).toBe('វិជ្ជា លី')
    expect(get(contractValues(input(), 'en'), 'supervisor_name')).toBe('Vichea Ly')
    expect(get(contractValues(input({ supervisorName: { km: 'វិជ្ជា លី', latin: '' } }), 'en'), 'supervisor_name')).toBe('វិជ្ជា លី')
    expect(get(contractValues(input()), 'supervisor')).toBe('Vichea')
    expect(get(allValues(input(), 'km'), 'supervisor_name_en')).toBe('Vichea Ly')
  })
})
