// Khmer formatting for contracts: digits, dates, money and amounts in words.

const DIGITS = '០១២៣៤៥៦៧៨៩'
/** '1,500.50' → '១,៥០០.៥០' */
export const khDigits = (s: string | number) => String(s).replace(/\d/g, (d) => DIGITS[+d])

const MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ']
/** '2026-10-12' → 'ថ្ងៃទី១២ ខែតុលា ឆ្នាំ២០២៦' */
export function khDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `ថ្ងៃទី${khDigits(d)} ខែ${MONTHS[m - 1]} ឆ្នាំ${khDigits(y)}`
}

const WEEKDAYS = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍']
/** '2026-10-02' → 'ថ្ងៃសុក្រ 2 តុលា 2026' (weekday, Khmer month, Latin digits: the style of the schedule table) */
export function khWeekdayDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `ថ្ងៃ${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`
}

/** '2026-10-12' → '12 តុលា 2026' (Khmer month, Latin digits) */
export function khDateLatin(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

const grouped = (n: number, dec: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })

/** 3000000 KHR → '៣,០០០,០០០ រៀល'; 500.5 USD → '៥០០.៥០ ដុល្លារ' */
export function khMoney(n: number, cur: 'KHR' | 'USD') {
  if (cur === 'USD') return `${khDigits(grouped(n, Number.isInteger(n) ? 0 : 2))} ដុល្លារ`
  return `${khDigits(grouped(Math.round(n), 0))} រៀល`
}

const UNIT = ['សូន្យ', 'មួយ', 'ពីរ', 'បី', 'បួន', 'ប្រាំ', 'ប្រាំមួយ', 'ប្រាំពីរ', 'ប្រាំបី', 'ប្រាំបួន']
const TENS = ['', 'ដប់', 'ម្ភៃ', 'សាមសិប', 'សែសិប', 'ហាសិប', 'ហុកសិប', 'ចិតសិប', 'ប៉ែតសិប', 'កៅសិប']

function below100(n: number) {
  if (n < 10) return UNIT[n]
  const t = Math.floor(n / 10)
  const u = n % 10
  return TENS[t] + (u ? UNIT[u] : '')
}

function below1e6(n: number) {
  const place = (v: number, word: string) => (v ? UNIT[v] + word : '')
  return (
    place(Math.floor(n / 1e5) % 10, 'សែន') + place(Math.floor(n / 1e4) % 10, 'ម៉ឺន') +
    place(Math.floor(n / 1e3) % 10, 'ពាន់') + place(Math.floor(n / 100) % 10, 'រយ') +
    (n % 100 ? below100(n % 100) : '')
  )
}

/** Whole number in Khmer words: 1500000 → 'មួយលានប្រាំសែន'. */
export function khWords(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return UNIT[0]
  if (n < 1e6) return below1e6(n)
  const rest = n % 1e6
  return khWords(Math.floor(n / 1e6)) + 'លាន' + (rest ? below1e6(rest) : '')
}

/** Amount in words with the currency: 3000000 KHR → 'បីលានរៀល'. */
export function khMoneyWords(n: number, cur: 'KHR' | 'USD') {
  if (cur === 'KHR') return khWords(Math.round(n)) + 'រៀល'
  const dollars = Math.floor(n)
  const cents = Math.round((n - dollars) * 100)
  return khWords(dollars) + 'ដុល្លារ' + (cents ? khWords(cents) + 'សេន' : '')
}

/** Amount in Khmer words without the currency name: 560000 → 'ប្រាំសែនប្រាំមួយម៉ឺន'; 12.5 → 'ដប់ពីរ ក្បៀស ហាសិប'. */
export function khAmountWords(n: number) {
  const whole = Math.floor(n)
  const cents = Math.round((n - whole) * 100)
  return khWords(whole) + (cents ? ` ក្បៀស ${khWords(cents)}` : '')
}
