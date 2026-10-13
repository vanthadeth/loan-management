import { useMemo, useSyncExternalStore } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { uploadFile } from './core'
import { useLoanViews, type LoanView } from './book'
import { addDays, isPayoff, roundMoney, splitPayments, todayIso, toIso, type Currency } from '../lib/calc'
import { fmt } from '../lib/format'
import type { Borrower } from '../lib/types'

/* ------------------------------------------------------------------ helpers */

const cents = (n: number) => Math.round(n * 100) / 100

export const CURRENCIES: Currency[] = ['KHR', 'USD']
export const symbol = (c: Currency) => (c === 'USD' ? '$' : '៛')

/** Amount text that hides the digits when the eye toggle is off. */
export const maskMoney = (n: number, c: Currency, hide: boolean) => (hide ? '•••••• ' + symbol(c) : fmt(n, c))

/** Borrower name in the current language, falling back to the English name. */
export const borrowerName = (b: Borrower | undefined, _lang?: string) =>
  b ? b.name_km || b.name || '—' : '—'

/** '1,500,000' or '12.5' -> number. */
export const parseAmount = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0

/** Formats what the user types: whole riel with thousands separators, dollars with cents. */
export function amountText(s: string, c: Currency) {
  if (c === 'USD') return s.replace(/[^\d.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1')
  const d = s.replace(/\D/g, '')
  return d ? Number(d).toLocaleString('en-US') : ''
}
export const amountToText = (n: number, c: Currency) => (c === 'USD' ? String(cents(n)) : Math.round(n).toLocaleString('en-US'))

/* -------------------------------------------------- small shared preferences */

export function createStore<T>(initial: T, key?: string, valid?: (v: unknown) => v is T) {
  let value = initial
  if (key) {
    try {
      const raw = localStorage.getItem(key)
      const v: unknown = raw === null ? undefined : JSON.parse(raw)
      if (valid?.(v)) value = v
    } catch { /* storage can be unavailable */ }
  }
  const subs = new Set<() => void>()
  return {
    get: () => value,
    subscribe: (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb) } },
    set: (v: T) => {
      value = v
      if (key) { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* ignore */ } }
      subs.forEach((cb) => cb())
    },
  }
}

const curStore = createStore<Currency>('KHR', 'money.currency', (v): v is Currency => v === 'KHR' || v === 'USD')
const hideStore = createStore<boolean>(false, 'money.hide', (v): v is boolean => typeof v === 'boolean')

/** KHR / USD switch shared by the dashboard and the reports. */
export function useCurrency() {
  return [useSyncExternalStore(curStore.subscribe, curStore.get), curStore.set] as const
}
/** The eye on the dashboard: hide or show all amounts. */
export function useHideAmounts() {
  const hide = useSyncExternalStore(hideStore.subscribe, hideStore.get)
  return [hide, () => hideStore.set(!hideStore.get())] as const
}

/* ------------------------------------------------------------------- ledger */

export type EntryType = 'in' | 'out' | 'add' | 'wd'
export type EntryKind = 'release' | 'fee' | 'payment' | 'add' | 'withdraw'

/** One line of the cashflow ledger. The ledger is derived from loans, payments and funds, never stored. */
export interface LedgerEntry {
  id: string
  date: string
  /** sort key inside one day, newest first */
  ord: string
  kind: EntryKind
  type: EntryType
  direction: 'in' | 'out'
  currency: Currency
  amount: number
  borrower?: Borrower
  loanId?: number
  /** heading for entries that do not belong to a borrower */
  title: string
  detail: string
  principal: number
  interest: number
  lateFee: number
}

export interface MoneyData {
  entries: LedgerEntry[]
  views: LoanView[]
  /** principal already repaid, per loan id */
  principalPaid: Map<number, number>
  today: string
  isLoading: boolean
}

/** Loans, payments and funds turned into the cashflow ledger plus per-loan principal repaid. */
export function useMoneyData(): MoneyData {
  const { views, isLoading, book } = useLoanViews()
  const funds = book?.funds
  return useMemo<MoneyData>(() => {
    const today = todayIso()
    const entries: LedgerEntry[] = []
    const principalPaid = new Map<number, number>()
    const blank = { principal: 0, interest: 0, lateFee: 0, title: '', detail: '' }
    for (const v of views) {
      const { loan, borrower } = v
      const code = 'L-' + String(loan.id).padStart(3, '0')
      // a refinanced loan was released and collected like any other until it was paid off, so it stays in the ledger
      if ((loan.status === 'approved' || loan.status === 'refinanced') && loan.release_date <= today) {
        const ts = loan.approved_at ?? loan.created_at
        const carried = Number(loan.carried_amount ?? 0)
        entries.push({
          ...blank, id: `r${loan.id}`, date: loan.release_date, ord: ts + '1', kind: 'release', type: 'out', direction: 'out',
          currency: loan.currency, amount: loan.amount, borrower, loanId: loan.id,
          detail: `Loan released · ${code}` + (carried > 0 && loan.refinance_of ? ` · ${fmt(carried, loan.currency)} carried over from L-${String(loan.refinance_of).padStart(3, '0')}, no cash` : ''),
        })
        // the service fee is charged on the new cash only, not on a balance carried over from a refinanced loan
        const fee = roundMoney(((loan.amount - carried) * loan.fee_pct) / 100, loan.currency)
        entries.push({
          ...blank, id: `f${loan.id}`, date: loan.release_date, ord: ts + '0', kind: 'fee', type: 'in', direction: 'in',
          currency: loan.currency, amount: fee, borrower, loanId: loan.id, detail: `Service fee · ${code}`,
        })
      }
      const split = splitPayments(v.terms, v.payments)
      let repaid = 0
      for (const p of v.payments) {
        const s = split.get(p.id) ?? { principal: 0, interest: 0 }
        repaid += s.principal
        // a refinancing payoff is dated on the new loan's release day: like the release, it counts from that day
        if (isPayoff(p) && p.paid_on > today) continue
        if (p.amount <= 0) continue // a late fee forgiven in full: no money moved
        entries.push({
          ...blank, id: `p${p.id}`, date: p.paid_on, ord: p.created_at + '0', kind: 'payment', type: 'in', direction: 'in',
          currency: loan.currency, amount: p.amount, borrower, loanId: loan.id, principal: s.principal, interest: s.interest,
          lateFee: p.late_fee,
          detail: isPayoff(p) ? `Paid off by refinancing · ${code} · ${p.note.replace('Refinanced into ', 'into ')}, no cash`
            : p.late_fee > 0 && p.late_fee === p.amount ? `Late fee · ${code}`
            : p.late_fee > 0 ? `Payment · ${code} · incl. late fee ${fmt(p.late_fee, loan.currency)}`
            : `Payment · ${code}`,
        })
      }
      principalPaid.set(loan.id, repaid)
    }
    for (const f of funds ?? []) {
      const add = f.kind === 'add'
      entries.push({
        ...blank, id: `m${f.id}`, date: f.txn_date, ord: f.created_at + '0', kind: add ? 'add' : 'withdraw', type: add ? 'add' : 'wd',
        direction: add ? 'in' : 'out', currency: f.currency, amount: f.amount, title: add ? 'Add fund' : 'Withdraw fund', detail: f.note,
      })
    }
    entries.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.ord < b.ord ? 1 : a.ord > b.ord ? -1 : 0))
    return { entries, views, principalPaid, today, isLoading }
  }, [views, funds, isLoading])
}

export const net = (entries: LedgerEntry[]) => entries.reduce((s, e) => s + (e.direction === 'in' ? e.amount : -e.amount), 0)
export const sum = (entries: LedgerEntry[], f: (e: LedgerEntry) => number = (e) => e.amount) => entries.reduce((s, e) => s + f(e), 0)

/** Loans that are released and still collecting. */
export const openLoans = (d: MoneyData, cur?: Currency) =>
  d.views.filter((v) => v.active && v.loan.release_date <= d.today && (!cur || v.loan.currency === cur))

/** Figures for the dashboard hero in one currency. */
export function dashFigures(d: MoneyData, cur: Currency) {
  const funds = net(d.entries.filter((e) => e.currency === cur))
  const open = openLoans(d, cur)
  const onLoan = open.reduce((s, v) => s + Math.max(v.loan.amount - (d.principalPaid.get(v.loan.id) ?? 0), 0), 0)
  const toCollect = open.reduce((s, v) => s + v.status.remaining, 0)
  return { funds, onLoan, toCollect }
}

/** What an unpaid installment still owes, split into interest and principal (interest is paid first). */
export function dueParts(r: { interest: number; total: number; paidAmount: number }) {
  const remaining = Math.max(r.total - r.paidAmount, 0)
  const interest = Math.min(Math.max(r.interest - r.paidAmount, 0), remaining)
  return { remaining, interest, principal: remaining - interest }
}

/* ------------------------------------------------------------- hero periods */

export type Unit = 'day' | 'week' | 'month'

export interface Period {
  i: number
  st: string
  /** exclusive end */
  en: string
  /** cash collected inside the period */
  c: number
  /** cash still expected inside the period (overdue amounts count in the current one) */
  x: number
  gross: number
  fee: number
  loan: number
  newLoans: number
  add: number
  withdraw: number
  col: number
  principal: number
  interest: number
  lateFees: number
  borrowers: number
  count: number
  open: number
  balance: number
}

export const mondayOf = (iso: string) => addDays(iso, -((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7))
export const monthShift = (iso: string, n: number) => toIso(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1 + n, 1))

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayNum = (iso: string) => +iso.slice(8, 10)
const monthName = (iso: string) => MON[+iso.slice(5, 7) - 1]

export function periodLabel(p: Period, u: Unit) {
  return u === 'day' ? String(dayNum(p.st)) : u === 'week' ? `${dayNum(p.st)} ${monthName(p.st)}` : monthName(p.st)
}
export function periodRange(p: Period, u: Unit) {
  const f = (iso: string) => `${String(dayNum(iso)).padStart(2, '0')} ${monthName(iso)} ${iso.slice(0, 4)}`
  return u === 'day' ? f(p.st) : u === 'week' ? `${f(p.st)} – ${f(addDays(p.en, -1))}` : `${monthName(p.st)} ${p.st.slice(0, 4)}`
}

/** Three periods back, the current one and three ahead, for the hero bar chart. */
export function buildPeriods(unit: Unit, d: MoneyData, cur: Currency): Period[] {
  const { today } = d
  const base = unit === 'day' ? today : unit === 'week' ? mondayOf(today) : today.slice(0, 8) + '01'
  const E = d.entries.filter((e) => e.currency === cur)
  const funds = net(E)
  const P: Period[] = []
  for (let i = -3; i <= 3; i++) {
    const st = unit === 'month' ? monthShift(base, i) : addDays(base, i * (unit === 'week' ? 7 : 1))
    const en = unit === 'month' ? monthShift(base, i + 1) : addDays(st, unit === 'week' ? 7 : 1)
    P.push({ i, st, en, c: 0, x: 0, gross: 0, fee: 0, loan: 0, newLoans: 0, add: 0, withdraw: 0, col: 0, principal: 0, interest: 0, lateFees: 0, borrowers: 0, count: 0, open: 0, balance: 0 })
  }
  const exp = P.map(() => ({ principal: 0, interest: 0, count: 0, who: new Set<number>() }))
  for (const v of openLoans(d, cur)) {
    for (const r of v.status.rows) {
      if (r.state === 'paid') continue
      const k = r.due < P[3].st ? 3 : P.findIndex((q) => r.due >= q.st && r.due < q.en)
      if (k < 0) continue
      const parts = dueParts(r)
      P[k].x += parts.remaining
      exp[k].principal += parts.principal
      exp[k].interest += parts.interest
      exp[k].count++
      exp[k].who.add(v.loan.borrower_id)
    }
  }
  P.forEach((q, k) => {
    if (q.st <= today) {
      const R = E.filter((e) => e.date >= q.st && e.date < q.en)
      const pays = R.filter((e) => e.kind === 'payment')
      q.gross = sum(R.filter((e) => e.kind === 'release'))
      q.fee = sum(R.filter((e) => e.kind === 'fee'))
      q.loan = q.gross - q.fee
      q.newLoans = R.filter((e) => e.kind === 'release').length
      q.add = sum(R.filter((e) => e.kind === 'add'))
      q.withdraw = sum(R.filter((e) => e.kind === 'withdraw'))
      q.col = sum(pays)
      q.c = q.col
      q.principal = sum(pays, (e) => e.principal)
      q.interest = sum(pays, (e) => e.interest)
      q.lateFees = sum(pays, (e) => e.lateFee)
      q.count = pays.length
      q.borrowers = new Set(pays.map((e) => e.borrower?.id)).size
      q.open = funds - net(E.filter((e) => e.date >= q.st))
    } else {
      q.col = q.x
      q.principal = exp[k].principal
      q.interest = exp[k].interest
      q.count = exp[k].count
      q.borrowers = exp[k].who.size
    }
  })
  const bal = (q: Period) => q.open + q.add - q.withdraw + q.col - q.loan
  P[3].balance = bal(P[3])
  for (let k = 4; k < P.length; k++) {
    const p = P[k - 1]
    P[k].open = p.open + p.add - p.withdraw + p.col + (k - 1 === 3 ? p.x : 0) - p.loan
    P[k].balance = bal(P[k])
  }
  for (let k = 0; k < 3; k++) P[k].balance = bal(P[k])
  return P
}

/* --------------------------------------------------------------- mutations */

export interface NewFund { kind: 'add' | 'withdraw'; currency: Currency; amount: number; txn_date: string; note: string }

export function useAddFund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (f: NewFund) => {
      const { error } = await supabase.from('fund_transactions').insert(f)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['book'] }),
  })
}

export interface NewPayment {
  loan_id: number
  bank_account_id: number | null
  amount: number
  late_fee: number
  late_fee_waived: number
  paid_on: string
  photo: File | null
}

/** Voids a received payment (needs a reason) or restores it; it is kept on record but counts nowhere. */
export function useVoidPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string | null }) => {
      const { data, error } = await supabase.from('payments')
        .update(reason === null ? { voided_at: null, void_reason: null } : { voided_at: new Date().toISOString(), void_reason: reason })
        .eq('id', id).select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('You are not allowed to void this payment.')
    },
    onSuccess: () => Promise.all(['book', 'messages'].map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  })
}

export function useRecordPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ photo, ...row }: NewPayment) => {
      const photo_path = photo ? await uploadFile('payments', photo) : null
      const { error } = await supabase.from('payments').insert({ ...row, photo_path })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => Promise.all(['book', 'messages'].map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  })
}
