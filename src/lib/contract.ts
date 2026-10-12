import { fmt, fmtD, loanCode } from './format'
import { loanTotals, todayIso, type LoanTerms } from './calc'
import { khDate, khDigits, khMoney, khMoneyWords } from './khmer'

export type ContractLang = 'km' | 'en'

/** Placeholders a contract template can use, written {{name}} in the Google Doc. */
export const PLACEHOLDERS: [string, string][] = [
  ['contract_no', 'Loan code, e.g. L-021'],
  ['contract_date', 'Date the contract is printed'],
  ['borrower_name', 'Borrower name (Khmer when recorded, otherwise English letters)'],
  ['borrower_name_km', 'Borrower name in Khmer (empty if not recorded)'],
  ['borrower_id_no', 'ID card number'],
  ['borrower_dob', 'Borrower date of birth'],
  ['borrower_phone', 'Borrower phone'],
  ['borrower_address', 'Borrower address'],
  ['borrower_name_latin', 'Borrower name in English letters'],
  ['amount', 'Loan amount with currency'],
  ['amount_words', 'Loan amount in words'],
  ['service_fee_percent', 'Service fee %'],
  ['service_fee', 'Service fee amount'],
  ['net_amount', 'Amount the borrower receives'],
  ['net_amount_words', 'Amount received, in words'],
  ['interest_rate', 'Interest rate, e.g. 2% per month'],
  ['total_interest', 'Total interest'],
  ['total_to_pay', 'Total to repay (loan + interest)'],
  ['total_to_pay_words', 'Total to repay, in words'],
  ['occurrences', 'Number of payments'],
  ['frequency', 'How often, e.g. Monthly'],
  ['installment', 'First payment amount'],
  ['repayment_mode', 'Interest and principal, or interest only'],
  ['release_date', 'Release date'],
  ['end_date', 'Date of the last payment'],
  ['late_fee_per_day', 'Late fee per day late'],
  ['pay_method', 'How the borrower pays'],
  ['collateral', 'Collateral items'],
  ['supervisor', 'Loan supervisor'],
  ['schedule', 'Payment schedule table'],
]

/** Starting text for a new template: paste it into a blank Google Doc and edit freely. */
export const STARTER_KM = `កិច្ចសន្យាខ្ចីប្រាក់
លេខកិច្ចសន្យា {{contract_no}}    កាលបរិច្ឆេទ {{contract_date}}

១. ភាគី
ភាគីអ្នកឱ្យខ្ចី: ______________________________
ភាគីអ្នកខ្ចី: {{borrower_name}}
លេខអត្តសញ្ញាណប័ណ្ណ: {{borrower_id_no}}    ថ្ងៃខែឆ្នាំកំណើត: {{borrower_dob}}
ទូរស័ព្ទ: {{borrower_phone}}
អាសយដ្ឋាន: {{borrower_address}}

២. ការខ្ចីប្រាក់
អ្នកឱ្យខ្ចីបានឱ្យអ្នកខ្ចីខ្ចីប្រាក់ចំនួន {{amount}} ({{amount_words}}) នៅ{{release_date}}។ ថ្លៃសេវា {{service_fee_percent}} ({{service_fee}}) ត្រូវបានកាត់ទុកមុននៅពេលផ្តល់ប្រាក់ ដូច្នេះអ្នកខ្ចីទទួលបានប្រាក់ចំនួន {{net_amount}} ({{net_amount_words}})។

៣. ការប្រាក់ និងការសងប្រាក់
ការប្រាក់គឺ {{interest_rate}} (ការប្រាក់សរុប {{total_interest}})។ អ្នកខ្ចីត្រូវសងសរុប {{total_to_pay}} ({{total_to_pay_words}}) ចំនួន {{occurrences}} ដង {{frequency}} ដោយដងដំបូងចំនួន {{installment}}។ ទម្រង់នៃការសង: {{repayment_mode}}។ ការសងចុងក្រោយត្រូវធ្វើនៅ{{end_date}}។

{{schedule}}

៤. ការសងយឺត
រាល់ថ្ងៃដែលសងយឺត អ្នកខ្ចីត្រូវបង់ប្រាក់ពិន័យ {{late_fee_per_day}} ក្នុងមួយថ្ងៃ។

៥. ទ្រព្យធានា
{{collateral}}

៦. វិធីបង់ប្រាក់
អ្នកខ្ចីសងប្រាក់តាមរយៈ: {{pay_method}}។

ធ្វើនៅ{{contract_date}}

អ្នកឱ្យខ្ចី: ____________________        អ្នកខ្ចី: ____________________
                                          {{borrower_name}}
`

/** English starter text. */
export const STARTER_EN = `LOAN AGREEMENT
Contract no. {{contract_no}}    Date: {{contract_date}}

1. Parties
Lender: ______________________________
Borrower: {{borrower_name}} ({{borrower_name_km}})
ID card no.: {{borrower_id_no}}    Date of birth: {{borrower_dob}}
Phone: {{borrower_phone}}
Address: {{borrower_address}}

2. Loan
The Lender lends the Borrower {{amount}} on {{release_date}}. A service fee of {{service_fee_percent}} ({{service_fee}}) is deducted when the loan is released, so the Borrower receives {{net_amount}}.

3. Interest and repayment
Interest is {{interest_rate}} (total interest {{total_interest}}). The Borrower repays {{total_to_pay}} in {{occurrences}} payments, {{frequency}}, starting with {{installment}}. Repayment: {{repayment_mode}}. The last payment is due on {{end_date}}.

{{schedule}}

4. Late payment
For every day a payment is late the Borrower pays a late fee of {{late_fee_per_day}} per day.

5. Collateral
{{collateral}}

6. Payment
The Borrower pays by: {{pay_method}}.

Signed on {{contract_date}}

Lender: ____________________        Borrower: ____________________
                                    {{borrower_name}}
`

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')


export interface ContractInput {
  loanId: number
  terms: LoanTerms
  frequency: string
  payMethod: string
  bankText: string
  payRemarks: string
  borrower: { name: string; name_km: string; id_no: string; dob: string | null; phone: string; address: string }
  collaterals: string[]
  supervisor: string
}

type Values = Record<string, { text: string; html?: boolean }>

const KM = {
  basis: { month: 'ក្នុងមួយខែ', occurrence: 'ក្នុងមួយដង', contract: 'សម្រាប់រយៈពេលកិច្ចសន្យាទាំងមូល' } as Record<string, string>,
  freq: { daily: 'ប្រចាំថ្ងៃ', weekly: 'ប្រចាំសប្តាហ៍', monthly: 'ប្រចាំខែ' } as Record<string, string>,
  method: { cash: 'សាច់ប្រាក់', bank: 'ផ្ទេរតាមធនាគារ', other: 'ផ្សេងៗ' } as Record<string, string>,
  head: ['ល.រ', 'ថ្ងៃកំណត់សង', 'ប្រាក់ដើម', 'ការប្រាក់', 'សរុប'],
  total: 'សរុប',
  none: 'គ្មាន',
}
const EN = {
  basis: { month: 'per month', occurrence: 'per payment', contract: 'for the whole contract' } as Record<string, string>,
  freq: { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' } as Record<string, string>,
  method: { cash: 'Cash', bank: 'Bank transfer', other: 'Other' } as Record<string, string>,
  head: ['No.', 'Due date', 'Principal', 'Interest', 'Total'],
  total: 'Total',
  none: 'None',
}

/**
 * Every placeholder's value, written in the template's language. Khmer contracts get
 * Khmer digits, dates, currency names, wording and amounts in words.
 */
export function contractValues(c: ContractInput, lang: ContractLang = 'km'): Values {
  const km = lang === 'km'
  const W = km ? KM : EN
  const t = c.terms
  const tot = loanTotals(t)
  const cur = t.currency
  const money = (n: number) => (km ? khMoney(n, cur) : fmt(n, cur))
  const words = (n: number) => (km ? khMoneyWords(n, cur) : '')
  const date = (iso: string) => (km ? khDate(iso) : fmtD(iso))
  const num = (v: string | number) => (km ? khDigits(v) : String(v))
  const bankName = c.bankText
  const method = c.payMethod === 'bank' && bankName ? `${W.method.bank}, ${bankName}` : c.payMethod === 'other' && c.payRemarks ? c.payRemarks : W.method[c.payMethod] ?? c.payMethod
  const cell = 'border:1px solid #888;padding:4px 8px;'
  const schedule = `<table style="border-collapse:collapse;width:100%;font-size:10pt"><thead><tr>${W.head.map((h, i) => `<th style="${cell}text-align:${i < 2 ? 'left' : 'right'}">${h}</th>`).join('')}</tr></thead><tbody>${tot.rows.map((r) => `<tr><td style="${cell}">${num(r.i)}</td><td style="${cell}">${date(r.due)}</td><td style="${cell}text-align:right">${money(r.principal)}</td><td style="${cell}text-align:right">${money(r.interest)}</td><td style="${cell}text-align:right">${money(r.total)}</td></tr>`).join('')}<tr><td style="${cell}" colspan="2"><b>${W.total}</b></td><td style="${cell}text-align:right"><b>${money(tot.rows.reduce((s, r) => s + r.principal, 0))}</b></td><td style="${cell}text-align:right"><b>${money(tot.interest)}</b></td><td style="${cell}text-align:right"><b>${money(tot.total)}</b></td></tr></tbody></table>`
  const khName = c.borrower.name_km.trim()
  const v: Record<string, string> = {
    contract_no: loanCode(c.loanId),
    contract_date: date(todayIso()),
    borrower_name: km && khName ? khName : c.borrower.name, borrower_name_km: khName, borrower_name_latin: c.borrower.name,
    borrower_id_no: num(c.borrower.id_no), borrower_dob: c.borrower.dob ? date(c.borrower.dob) : '', borrower_phone: num(c.borrower.phone),
    borrower_address: c.borrower.address,
    amount: money(t.amount), amount_words: words(t.amount), service_fee_percent: `${num(t.feePct)}%`, service_fee: money(tot.fee),
    net_amount: money(tot.net), net_amount_words: words(tot.net),
    interest_rate: `${num(t.ratePct)}% ${W.basis[t.rateBasis]}`, total_interest: money(tot.interest),
    total_to_pay: money(tot.total), total_to_pay_words: words(tot.total),
    occurrences: num(t.occurrences),
    frequency: c.frequency === 'custom' ? (km ? `រៀងរាល់ ${khDigits(t.intervalDays)} ថ្ងៃម្តង` : `every ${t.intervalDays} days`) : W.freq[c.frequency] ?? c.frequency,
    installment: money(tot.rows[0].total),
    repayment_mode: km
      ? t.mode === 'equal' ? 'សងការប្រាក់ និងប្រាក់ដើមក្នុងគ្រប់ដង' : 'សងតែការប្រាក់ រីឯប្រាក់ដើមសងនៅដងចុងក្រោយ'
      : t.mode === 'equal' ? 'Interest and principal in every payment' : 'Interest only, principal at the end',
    release_date: date(t.releaseDate), end_date: date(tot.endDate), late_fee_per_day: money(t.lateFeePerDay),
    pay_method: method, collateral: c.collaterals.length ? c.collaterals.join('; ') : W.none, supervisor: c.supervisor,
  }
  const out: Values = {}
  for (const k of Object.keys(v)) out[k] = { text: v[k] }
  out.schedule = { text: schedule, html: true }
  return out
}

/**
 * Fills the {{placeholders}} in Google's HTML export. Google sometimes splits a
 * placeholder across formatting spans, so tags inside the braces are ignored.
 * Unknown placeholders are left visible so the template author can spot typos.
 */
export function fillTemplate(html: string, values: Record<string, { text: string; html?: boolean }>) {
  return html.replace(/\{\{((?:[^{}<]|<[^>]*>)*?)\}\}/g, (all, inner: string) => {
    const key = inner.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().toLowerCase()
    const v = values[key]
    return v ? (v.html ? v.text : esc(v.text)) : all
  })
}

/** Adds a Khmer font after the template's own fonts so Khmer text falls back to it. */
const withKhmerFallback = (list: string) => `${list.replace(/\s*!important\s*$/, '')},'Noto Sans Khmer'`

/**
 * A standalone, script-free document for the preview and the PDF. The template's own
 * styles are kept as they are so the contract looks like the Google Doc.
 */
export function cleanDocument(filled: string, lang: ContractLang = 'km') {
  const doc = new DOMParser().parseFromString(filled, 'text/html')
  doc.querySelectorAll('script, iframe, object, embed, link, meta[http-equiv]').forEach((n) => n.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      if (a.name.startsWith('on') || (a.name === 'href' && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name)
    }
  })
  if (lang === 'km') {
    // Khmer needs a Khmer font in this separate document; keep each template font first
    doc.querySelectorAll('style').forEach((st) => {
      st.textContent = (st.textContent ?? '').replace(/font-family\s*:\s*([^;}]+)/gi, (_m, list: string) => `font-family:${withKhmerFallback(list)}`)
    })
    doc.querySelectorAll<HTMLElement>('[style*="font-family"]').forEach((el) => {
      el.style.fontFamily = withKhmerFallback(el.style.fontFamily)
    })
  }
  const style = doc.createElement('style')
  style.textContent =
    "@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;700&display=swap');" +
    'html,body{background:#fff!important}' +
    // the PDF page margins come from the document's own padding, as in Google Docs
    '@page{size:A4;margin:0}'
  doc.head.append(style)
  return '<!doctype html>' + doc.documentElement.outerHTML
}
