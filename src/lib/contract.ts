import { fmt, fmtD, loanCode } from './format'
import { loanTotals, todayIso, type LoanTerms } from './calc'

/** Placeholders a contract template can use, written {{name}} in the Google Doc. */
export const PLACEHOLDERS: [string, string][] = [
  ['contract_no', 'Loan code, e.g. L-021'],
  ['contract_date', 'Date the contract is printed'],
  ['borrower_name', 'Borrower name'],
  ['borrower_name_km', 'Borrower name in Khmer'],
  ['borrower_id_no', 'ID card number'],
  ['borrower_dob', 'Borrower date of birth'],
  ['borrower_phone', 'Borrower phone'],
  ['borrower_address', 'Borrower address'],
  ['amount', 'Loan amount with currency'],
  ['service_fee_percent', 'Service fee %'],
  ['service_fee', 'Service fee amount'],
  ['net_amount', 'Amount the borrower receives'],
  ['interest_rate', 'Interest rate, e.g. 2% per month'],
  ['total_interest', 'Total interest'],
  ['total_to_pay', 'Total to repay (loan + interest)'],
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
export const STARTER_TEMPLATE = `LOAN AGREEMENT
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

const BASIS: Record<string, string> = { month: 'per month', occurrence: 'per payment', contract: 'for the whole contract' }
const FREQ: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }
const METHOD: Record<string, string> = { cash: 'Cash', bank: 'Bank transfer', other: 'Other' }

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

/** Every placeholder's value as plain text; `schedule` is an HTML table. */
export function contractValues(c: ContractInput): Record<string, { text: string; html?: boolean }> {
  const t = c.terms
  const tot = loanTotals(t)
  const cur = t.currency
  const method = c.payMethod === 'bank' && c.bankText ? `${METHOD.bank}, ${c.bankText}` : c.payMethod === 'other' && c.payRemarks ? c.payRemarks : METHOD[c.payMethod] ?? c.payMethod
  const cell = 'border:1px solid #888;padding:4px 8px;'
  const schedule = `<table style="border-collapse:collapse;width:100%;font-size:10pt"><thead><tr>${['No.', 'Due date', 'Principal', 'Interest', 'Total'].map((h, i) => `<th style="${cell}text-align:${i < 2 ? 'left' : 'right'}">${h}</th>`).join('')}</tr></thead><tbody>${tot.rows.map((r) => `<tr><td style="${cell}">${r.i}</td><td style="${cell}">${fmtD(r.due)}</td><td style="${cell}text-align:right">${fmt(r.principal, cur)}</td><td style="${cell}text-align:right">${fmt(r.interest, cur)}</td><td style="${cell}text-align:right">${fmt(r.total, cur)}</td></tr>`).join('')}<tr><td style="${cell}" colspan="2"><b>Total</b></td><td style="${cell}text-align:right"><b>${fmt(tot.rows.reduce((s, r) => s + r.principal, 0), cur)}</b></td><td style="${cell}text-align:right"><b>${fmt(tot.interest, cur)}</b></td><td style="${cell}text-align:right"><b>${fmt(tot.total, cur)}</b></td></tr></tbody></table>`
  const v: Record<string, string> = {
    contract_no: loanCode(c.loanId), contract_date: fmtD(todayIso()),
    borrower_name: c.borrower.name, borrower_name_km: c.borrower.name_km, borrower_id_no: c.borrower.id_no,
    borrower_dob: c.borrower.dob ? fmtD(c.borrower.dob) : '', borrower_phone: c.borrower.phone, borrower_address: c.borrower.address,
    amount: fmt(t.amount, cur), service_fee_percent: `${t.feePct}%`, service_fee: fmt(tot.fee, cur), net_amount: fmt(tot.net, cur),
    interest_rate: `${t.ratePct}% ${BASIS[t.rateBasis]}`, total_interest: fmt(tot.interest, cur), total_to_pay: fmt(tot.total, cur),
    occurrences: String(t.occurrences),
    frequency: c.frequency === 'custom' ? `every ${t.intervalDays} days` : FREQ[c.frequency] ?? c.frequency,
    installment: fmt(tot.rows[0].total, cur),
    repayment_mode: t.mode === 'equal' ? 'Interest and principal in every payment' : 'Interest only, principal at the end',
    release_date: fmtD(t.releaseDate), end_date: fmtD(tot.endDate), late_fee_per_day: fmt(t.lateFeePerDay, cur),
    pay_method: method, collateral: c.collaterals.length ? c.collaterals.join('; ') : 'None', supervisor: c.supervisor,
  }
  const out: Record<string, { text: string; html?: boolean }> = {}
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

/** A standalone, script-free document for the preview and the PDF. */
export function cleanDocument(filled: string) {
  const doc = new DOMParser().parseFromString(filled, 'text/html')
  doc.querySelectorAll('script, iframe, object, embed, link, meta[http-equiv]').forEach((n) => n.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      if (a.name.startsWith('on') || (a.name === 'href' && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name)
    }
  })
  const style = doc.createElement('style')
  // Google's export pads the page like a Docs canvas; the PDF adds its own margins
  style.textContent = 'html,body{background:#fff!important}body{max-width:none!important;margin:0!important;padding:0!important;color:#000}'
  doc.head.append(style)
  return '<!doctype html>' + doc.documentElement.outerHTML
}
