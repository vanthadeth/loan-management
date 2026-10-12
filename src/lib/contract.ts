import { fmt, fmtD, loanCode } from './format'
import { diffDays, loanTotals, todayIso, type LoanTerms } from './calc'
import { khAmountWords, khDate, khDateLatin, khDigits, khMoney, khMoneyWords, khWeekdayDate } from './khmer'

export type ContractLang = 'km' | 'en'

/** Placeholders a contract template can use, written {{name}} in the Google Doc. */
export const PLACEHOLDERS: [string, string][] = [
  ['contract_no', 'Loan code, e.g. L-021'],
  ['contract_date', 'Date the contract is printed'],
  ['borrower_name', 'Borrower name (Khmer in a Khmer template; Latin letters in an English one, with the other as fallback)'],
  ['borrower_name_km', 'Borrower name in Khmer (empty if not recorded)'],
  ['borrower_id_no', 'ID card number'],
  ['borrower_gender', 'Borrower gender (Male / Female, ប្រុស / ស្រី)'],
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
  ['installment_words', 'First payment amount, in words'],
  ['repayment_mode', 'Interest and principal, or interest only'],
  ['release_date', 'Release date'],
  ['released_date', 'Release date (same as release_date)'],
  ['first_payment_date', 'Date of the first payment'],
  ['end_date', 'Date of the last payment'],
  ['contract_duration', 'Length of the contract with its unit: weeks if paid weekly, months if paid monthly, otherwise days'],
  ['contract_duration_days', 'Length of the contract in days (number only)'],
  ['late_fee_percent', 'Late fee, % of the unpaid installment per late payment period'],
  ['pay_method', 'How the borrower pays'],
  ['bank_name', 'Bank the borrower pays into (empty if not by bank)'],
  ['bank_account_no', 'Bank account number'],
  ['bank_account_name', 'Bank account name'],
  ['collateral', 'Collateral items'],
  ['supervisor', 'Loan supervisor (the name they go by)'],
  ['supervisor_name', 'Loan supervisor full name (Khmer name; Latin name in an English template)'],
  ['schedule', 'Payment schedule as an ANNEX: starts a new page with a heading, then the table (put it at the end of the contract, in its own paragraph)'],
  ['schedule_table', 'Only the payment schedule table, without the annex page and heading'],
  ['schedule_no', 'Per payment row: number, Latin digits (put in a table row that repeats)'],
  ['schedule_date', 'Per payment row: due date, e.g. 12 តុលា 2026'],
  ['schedule_principal', 'Per payment row: principal, plain number like 25,000.00 (no currency name)'],
  ['schedule_interest', 'Per payment row: interest, plain number'],
  ['schedule_total', 'Per payment row: amount to pay, plain number'],
  ['schedule_total_words', 'Per payment row: amount to pay, in words (no currency name)'],
  ['schedule_balance', 'Per payment row: principal left after it, plain number'],
  ['schedule_balance_before', 'Per payment row: principal left before it, plain number'],
  ['schedule_weekday_date', 'Per payment row: due date with the weekday, e.g. ថ្ងៃសុក្រ 2 តុលា 2026'],
]

/** Starting text for a new template: paste it into a blank Google Doc and edit freely. */
export const STARTER_KM = `កិច្ចសន្យាខ្ចីប្រាក់
លេខកិច្ចសន្យា {{contract_no}}    កាលបរិច្ឆេទ {{contract_date}}

១. ភាគី
ភាគីអ្នកឱ្យខ្ចី: ______________________________
ភាគីអ្នកខ្ចី: {{borrower_name}}
ភេទ: {{borrower_gender}}    ថ្ងៃខែឆ្នាំកំណើត: {{borrower_dob}}
លេខអត្តសញ្ញាណប័ណ្ណ: {{borrower_id_no}}
ទូរស័ព្ទ: {{borrower_phone}}
អាសយដ្ឋាន: {{borrower_address}}

២. ការខ្ចីប្រាក់
អ្នកឱ្យខ្ចីបានឱ្យអ្នកខ្ចីខ្ចីប្រាក់ចំនួន {{amount}} ({{amount_words}}) នៅ{{release_date}}។ ថ្លៃសេវា {{service_fee_percent}} ({{service_fee}}) ត្រូវបានកាត់ទុកមុននៅពេលផ្តល់ប្រាក់ ដូច្នេះអ្នកខ្ចីទទួលបានប្រាក់ចំនួន {{net_amount}} ({{net_amount_words}})។

៣. ការប្រាក់ និងការសងប្រាក់
ការប្រាក់គឺ {{interest_rate}} (ការប្រាក់សរុប {{total_interest}})។ អ្នកខ្ចីត្រូវសងសរុប {{total_to_pay}} ({{total_to_pay_words}}) ចំនួន {{occurrences}} ដង {{frequency}} ដោយដងនីមួយៗចំនួន {{installment}} ({{installment_words}})។ រយៈពេលនៃកិច្ចសន្យាគឺ {{contract_duration}} ({{contract_duration_days}} ថ្ងៃ)។ ទម្រង់នៃការសង: {{repayment_mode}}។ ការសងចុងក្រោយត្រូវធ្វើនៅ{{end_date}}។ តារាងសងប្រាក់លម្អិតមានក្នុងឧបសម្ព័ន្ធនៃកិច្ចសន្យានេះ។

៤. ការសងយឺត
រាល់ការសងយឺតមួយគ្រា (តាមរយៈពេលនៃការសងនីមួយៗ) អ្នកខ្ចីត្រូវបង់ប្រាក់ពិន័យ {{late_fee_percent}} នៃទឹកប្រាក់ដែលមិនទាន់បង់។

៥. ទ្រព្យធានា
{{collateral}}

៦. វិធីបង់ប្រាក់
អ្នកខ្ចីសងប្រាក់តាមរយៈ: {{pay_method}}។
ធនាគារ: {{bank_name}}    លេខគណនី: {{bank_account_no}}    ឈ្មោះគណនី: {{bank_account_name}}

ធ្វើនៅ{{contract_date}}

អ្នកឱ្យខ្ចី: ____________________        អ្នកខ្ចី: ____________________
                                          {{borrower_name}}

{{schedule}}
`

/** Starter for a separate payment schedule template (the annex, its own Google Doc). */
export const STARTER_SCHEDULE_KM = `ឧបសម្ព័ន្ធ
តារាងសងប្រាក់
ភ្ជាប់ជាមួយកិច្ចសន្យាខ្ចីប្រាក់លេខ {{contract_no}} ចុះ{{contract_date}}

អ្នកខ្ចី: {{borrower_name}}
ទឹកប្រាក់កម្ចី: {{amount}}    ការប្រាក់: {{interest_rate}}

{{schedule_table}}
`

export const STARTER_SCHEDULE_EN = `ANNEX
Repayment schedule
Attached to loan agreement no. {{contract_no}} dated {{contract_date}}

Borrower: {{borrower_name}}
Loan amount: {{amount}}    Interest: {{interest_rate}}

{{schedule_table}}
`

/** English starter text. */
export const STARTER_EN = `LOAN AGREEMENT
Contract no. {{contract_no}}    Date: {{contract_date}}

1. Parties
Lender: ______________________________
Borrower: {{borrower_name}} ({{borrower_name_km}})
Gender: {{borrower_gender}}    Date of birth: {{borrower_dob}}
ID card no.: {{borrower_id_no}}
Phone: {{borrower_phone}}
Address: {{borrower_address}}

2. Loan
The Lender lends the Borrower {{amount}} on {{release_date}}. A service fee of {{service_fee_percent}} ({{service_fee}}) is deducted when the loan is released, so the Borrower receives {{net_amount}}.

3. Interest and repayment
Interest is {{interest_rate}} (total interest {{total_interest}}). The Borrower repays {{total_to_pay}} in {{occurrences}} payments, {{frequency}}, starting with {{installment}}. The contract lasts {{contract_duration}} ({{contract_duration_days}} days). Repayment: {{repayment_mode}}. The last payment is due on {{end_date}}. The full payment schedule is in the annex.

4. Late payment
For every payment period an installment is late the Borrower pays a late fee of {{late_fee_percent}} of the unpaid installment.

5. Collateral
{{collateral}}

6. Payment
The Borrower pays by: {{pay_method}}.
Bank: {{bank_name}}    Account no.: {{bank_account_no}}    Account name: {{bank_account_name}}

Signed on {{contract_date}}

Lender: ____________________        Borrower: ____________________
                                    {{borrower_name}}

{{schedule}}
`

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')


export interface ContractInput {
  loanId: number
  terms: LoanTerms
  frequency: string
  payMethod: string
  bank: { bank: string; account_no: string; account_name: string } | null
  payRemarks: string
  borrower: { name: string; name_km: string; gender: 'F' | 'M' | null; id_no: string; dob: string | null; phone: string; address: string }
  collaterals: string[]
  supervisor: string
  /** the supervisor's full names: Khmer, and Latin letters if recorded */
  supervisorName: { km: string; latin: string }
}

type Values = Record<string, { text: string; html?: boolean }>

const KM = {
  basis: { month: 'ក្នុងមួយខែ', occurrence: 'ក្នុងមួយដង', contract: 'សម្រាប់រយៈពេលកិច្ចសន្យាទាំងមូល' } as Record<string, string>,
  freq: { daily: 'ប្រចាំថ្ងៃ', weekly: 'ប្រចាំសប្តាហ៍', monthly: 'ប្រចាំខែ' } as Record<string, string>,
  method: { cash: 'សាច់ប្រាក់', bank: 'ផ្ទេរតាមធនាគារ', other: 'ផ្សេងៗ' } as Record<string, string>,
  head: ['ល.រ', 'ថ្ងៃត្រូវសងប្រាក់', 'ប្រាក់ជំពាក់ដើមគ្រា', 'ប្រាក់ដើមត្រូវសង', 'ការប្រាក់ត្រូវសង', 'ប្រាក់សរុបត្រូវសង', 'ប្រាក់ជំពាក់ចុងគ្រា', 'កំណត់សំគាល់'],
  none: 'គ្មាន',
}
const EN = {
  basis: { month: 'per month', occurrence: 'per payment', contract: 'for the whole contract' } as Record<string, string>,
  freq: { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' } as Record<string, string>,
  method: { cash: 'Cash', bank: 'Bank transfer', other: 'Other' } as Record<string, string>,
  head: ['No.', 'Due date', 'Balance at start', 'Principal due', 'Interest due', 'Total due', 'Balance at end', 'Notes'],
  none: 'None',
}

/** Attributes of the template's own text (its class and inline style), copied onto the table cells. */
interface TextStyle { cls: string; style: string; size?: number }

/**
 * The ready-made payment schedule table: blue header, hairline grey borders, plain numbers with two
 * decimals. Cell text is wrapped in a span carrying the template's text style, so the table takes
 * the document's own font and size.
 */
function scheduleTable(c: ContractInput, lang: ContractLang, text?: TextStyle): string {
  const km = lang === 'km'
  const W = km ? KM : EN
  const t = c.terms
  const rows = loanTotals(t).rows
  const plain = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const day = (iso: string) => (km ? khWeekdayDate(iso) : new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(',', ''))
  const attr = (extra = '') => {
    const style = [text?.style, extra].filter(Boolean).join(';')
    return `${text?.cls ? ` class="${text.cls}"` : ''}${style ? ` style="${style}"` : ''}`
  }
  // the template's font family and style are kept; the size is capped so seven-digit amounts fit the columns
  const size = `font-size:${Math.min(text?.size ?? 9.5, 9.5)}pt`
  const cell = (tag: 'td' | 'th', inner: string, css: string, extra = '') => `<${tag} style="${BOX}${css}"><span${attr(`${size};${extra}`.replace(/;$/, ''))}>${inner}</span></${tag}>`
  let left = t.amount
  const body = rows.map((r) => {
    const before = left
    left = Math.max(left - r.principal, 0)
    return `<tr>${cell('td', String(r.i), 'text-align:center')}${cell('td', day(r.due), 'text-align:center')}${[before, r.principal, r.interest, r.total, left].map((n) => cell('td', plain(n), 'text-align:right;white-space:nowrap')).join('')}${cell('td', '&nbsp;', '')}</tr>`
  }).join('')
  const widths = ['5%', '17%', '14%', '12%', '12%', '13%', '14%', '13%']
  const head = W.head.map((h) => cell('th', h, 'background:#1ea1e2;text-align:center;vertical-align:middle', 'color:#fff;font-weight:700')).join('')
  return `<table style="border-collapse:collapse;width:100%"><colgroup>${widths.map((w) => `<col style="width:${w}">`).join('')}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}
const BOX = 'border:0.5pt solid #9a9a9a;padding:4pt 5pt;'

/** Font size in pt from the text's inline style or its class rule in the template's CSS, if it has one. */
function fontSizePt(doc: Document, t: TextStyle) {
  const read = (css: string) => /font-size\s*:\s*([\d.]+)pt/i.exec(css)?.[1]
  let size = read(t.style)
  if (!size) {
    const css = [...doc.querySelectorAll('style')].map((st) => st.textContent ?? '').join('\n')
    for (const cls of t.cls.split(/\s+/).filter(Boolean)) {
      const rule = new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`).exec(css)
      size = size ?? (rule ? read(rule[1]) : undefined)
    }
  }
  return size ? Number(size) : undefined
}

/** The annex: a new page with a heading, a line tying it to the contract, and the schedule table. */
function annexBlock(c: ContractInput, lang: ContractLang, text: TextStyle) {
  const km = lang === 'km'
  const base = text.size ?? 12
  const para = (inner: string, size: number, bold: boolean, after: string) =>
    `<p style="text-align:center;margin:0 0 ${after}"><span${text.cls ? ` class="${text.cls}"` : ''} style="${[text.style, `font-size:${size}pt`, bold ? 'font-weight:700' : ''].filter(Boolean).join(';')}">${inner}</span></p>`
  const no = loanCode(c.loanId)
  const date = km ? khDate(todayIso()) : fmtD(todayIso())
  const [title, sub, ref] = km
    ? ['ឧបសម្ព័ន្ធ', 'តារាងសងប្រាក់', `ភ្ជាប់ជាមួយកិច្ចសន្យាខ្ចីប្រាក់លេខ ${no} ចុះ${date}`]
    : ['ANNEX', 'Repayment schedule', `Attached to loan agreement no. ${no} dated ${date}`]
  return `<div class="komjei-annex" style="break-before:page;page-break-before:always">${para(title, base + 4, true, '4pt')}${para(sub, base + 2, true, '6pt')}${para(ref, base, false, '14pt')}${scheduleTable(c, lang, text)}</div>`
}

/**
 * Replaces a paragraph that holds only {{schedule}} (annex page) or {{schedule_table}} (table only)
 * with the schedule, styled like the placeholder's own text so it matches the document's font.
 */
export function fillScheduleTable(html: string, c: ContractInput, lang: ContractLang, annexPage = true) {
  if (!/sch/i.test(html)) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const key = (el: Element) => (el.textContent ?? '').replace(/\s+/g, '').toLowerCase()
  const SCHEDULE = /^\{\{(schedule|schedule_table)(?:_(km|en))?\}\}$/
  const only = (el: Element) => SCHEDULE.test(key(el))
  const blocks = [...doc.querySelectorAll('p, div, li')].filter((el) => only(el) && !el.querySelector('p, div, li'))
  if (!blocks.length) return html
  for (const block of blocks) {
    // in a template that is itself the schedule annex, {{schedule}} is just the table
    const [, name, forced] = SCHEDULE.exec(key(block))!
    const blockLang = (forced as ContractLang | undefined) ?? lang // {{schedule_en}} is English whatever the template's language
    const annex = annexPage && name === 'schedule'
    // the innermost span or element that carries the text's class / style
    let src: Element = block
    while (src.firstElementChild && only(src.firstElementChild)) src = src.firstElementChild
    const text: TextStyle = { cls: src.getAttribute('class') ?? '', style: (src.getAttribute('style') ?? '').replace(/;\s*$/, '') }
    text.size = fontSizePt(doc, text)
    const holder = doc.createElement('div')
    holder.innerHTML = annex ? annexBlock(c, blockLang, text) : scheduleTable(c, blockLang, text)
    block.replaceWith(holder.firstElementChild!)
  }
  return '<!doctype html>' + doc.documentElement.outerHTML
}

function formatters(lang: ContractLang, cur: 'KHR' | 'USD') {
  const km = lang === 'km'
  return {
    money: (n: number) => (km ? khMoney(n, cur) : fmt(n, cur)),
    words: (n: number) => (km ? khMoneyWords(n, cur) : ''),
    date: (iso: string) => (km ? khDate(iso) : fmtD(iso)),
    num: (v: string | number) => (km ? khDigits(v) : String(v)),
  }
}

/**
 * One set of values per installment, for a table row in the template that repeats for every payment.
 * The row uses {{schedule_no}}, {{schedule_date}}, {{schedule_principal}}, {{schedule_interest}},
 * {{schedule_total}}, {{schedule_total_words}} and {{schedule_balance}}.
 */
export function scheduleRowValues(c: ContractInput, lang: ContractLang = 'km'): Values[] {
  const km = lang === 'km'
  const rows = loanTotals(c.terms).rows
  // plain Latin numbers with two decimals and no currency name, like the ready-made table
  const plain = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const date = (iso: string) => (km ? khDateLatin(iso) : fmtD(iso))
  let left = c.terms.amount
  return rows.map((r) => {
    left -= r.principal
    const v: Record<string, string> = {
      schedule_no: String(r.i), schedule_date: date(r.due), schedule_principal: plain(r.principal),
      schedule_interest: plain(r.interest), schedule_total: plain(r.total), schedule_total_words: km ? khAmountWords(r.total) : '',
      schedule_balance: plain(Math.max(left, 0)), schedule_balance_before: plain(left + r.principal),
      schedule_weekday_date: km ? khWeekdayDate(r.due) : fmtD(r.due),
    }
    return Object.fromEntries(Object.entries(v).map(([k, text]) => [k, { text }]))
  })
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
  const { money, words, date, num } = formatters(lang, cur)
  const bank = c.payMethod === 'bank' ? c.bank : null
  const method = bank ? `${W.method.bank}, ${bank.bank} ${bank.account_no}` : c.payMethod === 'other' && c.payRemarks ? c.payRemarks : W.method[c.payMethod] ?? c.payMethod
  const schedule = scheduleTable(c, lang)
  // length of the contract: weeks if paid weekly, months if paid monthly, otherwise counted in days
  const days = diffDays(t.releaseDate, tot.endDate)
  const duration =
    c.frequency === 'weekly' ? `${num(t.occurrences)} ${km ? 'សប្តាហ៍' : t.occurrences === 1 ? 'week' : 'weeks'}`
    : c.frequency === 'monthly' ? `${num(t.occurrences)} ${km ? 'ខែ' : t.occurrences === 1 ? 'month' : 'months'}`
    : `${num(days)} ${km ? 'ថ្ងៃ' : days === 1 ? 'day' : 'days'}`
  const khName = c.borrower.name_km.trim()
  const v: Record<string, string> = {
    contract_no: loanCode(c.loanId),
    contract_date: date(todayIso()),
    borrower_name: km ? khName || c.borrower.name : c.borrower.name || khName, borrower_name_km: khName, borrower_name_latin: c.borrower.name,
    borrower_gender: c.borrower.gender === 'M' ? (km ? 'ប្រុស' : 'Male') : c.borrower.gender === 'F' ? (km ? 'ស្រី' : 'Female') : '',
    borrower_id_no: num(c.borrower.id_no), borrower_dob: c.borrower.dob ? date(c.borrower.dob) : '', borrower_phone: num(c.borrower.phone),
    borrower_address: c.borrower.address,
    amount: money(t.amount), amount_words: words(t.amount), service_fee_percent: `${num(t.feePct)}%`, service_fee: money(tot.fee),
    net_amount: money(tot.net), net_amount_words: words(tot.net),
    interest_rate: `${num(t.ratePct)}% ${W.basis[t.rateBasis]}`, total_interest: money(tot.interest),
    total_to_pay: money(tot.total), total_to_pay_words: words(tot.total),
    occurrences: num(t.occurrences),
    frequency: c.frequency === 'custom' ? (km ? `រៀងរាល់ ${khDigits(t.intervalDays)} ថ្ងៃម្តង` : `every ${t.intervalDays} days`) : W.freq[c.frequency] ?? c.frequency,
    installment: money(tot.rows[0].total), installment_words: words(tot.rows[0].total),
    repayment_mode: km
      ? t.mode === 'equal' ? 'សងការប្រាក់ និងប្រាក់ដើមក្នុងគ្រប់ដង' : 'សងតែការប្រាក់ រីឯប្រាក់ដើមសងនៅដងចុងក្រោយ'
      : t.mode === 'equal' ? 'Interest and principal in every payment' : 'Interest only, principal at the end',
    release_date: date(t.releaseDate), released_date: date(t.releaseDate), first_payment_date: date(tot.rows[0].due), end_date: date(tot.endDate), late_fee_percent: `${num(t.lateFeePct)}%`,
    pay_method: method, bank_name: bank?.bank ?? '', bank_account_no: bank ? num(bank.account_no) : '', bank_account_name: bank?.account_name ?? '',
    contract_duration: duration, contract_duration_days: num(days), collateral: c.collaterals.length ? c.collaterals.join('; ') : W.none, supervisor: c.supervisor,
    supervisor_name: km ? c.supervisorName.km || c.supervisorName.latin : c.supervisorName.latin || c.supervisorName.km,
  }
  const out: Values = {}
  for (const k of Object.keys(v)) out[k] = { text: v[k] }
  out.schedule = { text: schedule, html: true }
  out.schedule_table = { text: schedule, html: true }
  return out
}

/**
 * Every placeholder in the template's own language, plus a copy of each ending in _km or _en that is
 * always in that language: {{amount}} follows the template, {{amount_en}} is always English.
 * A name that already ends in _km or _en keeps its own meaning (borrower_name_km).
 */
export function allValues(c: ContractInput, lang: ContractLang = 'km'): Values {
  const out = contractValues(c, lang)
  for (const l of ['km', 'en'] as const) {
    const v = contractValues(c, l)
    for (const k of Object.keys(v)) if (!(`${k}_${l}` in out)) out[`${k}_${l}`] = v[k]
  }
  return out
}

/** The per-payment row values, also with _km / _en copies. */
export function allScheduleRows(c: ContractInput, lang: ContractLang = 'km'): Values[] {
  const own = scheduleRowValues(c, lang)
  const km = scheduleRowValues(c, 'km')
  const en = scheduleRowValues(c, 'en')
  return own.map((row, i) => {
    const out: Values = { ...row }
    for (const k of Object.keys(km[i])) out[`${k}_km`] = km[i][k]
    for (const k of Object.keys(en[i])) out[`${k}_en`] = en[i][k]
    return out
  })
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

/**
 * A table row that contains {{schedule_…}} placeholders is the row template for the payment
 * schedule: it is repeated once per installment, each copy filled with that payment's values.
 */
export function fillScheduleRows(html: string, rows: Values[]) {
  if (!/\{\{[^}]*schedule_/i.test(html)) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const isTemplate = (tr: Element) => /\{\{\s*schedule_[a-z_]+\s*\}\}/i.test(tr.textContent ?? '')
  const trs = [...doc.querySelectorAll('tr')].filter(isTemplate)
  for (const tr of trs) {
    for (const values of rows) {
      const copy = tr.cloneNode(true) as Element
      copy.innerHTML = fillTemplate(copy.innerHTML, values)
      tr.before(copy)
    }
    tr.remove()
  }
  return '<!doctype html>' + doc.documentElement.outerHTML
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
    'html,body{background:#fff!important}'
  doc.head.append(style)
  return '<!doctype html>' + doc.documentElement.outerHTML
}
