import type { Cell, Table } from './builders'
import type { Currency } from '../../lib/calc'

const csvValue = (c: Cell) => {
  if (typeof c === 'string') return c
  if ('date' in c) return c.date
  return String(Math.round(c.amount * 100) / 100)
}
const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** Opens as a spreadsheet in Excel: UTF-8 with a byte order mark so Khmer names and the riel sign survive. */
export function downloadCsv(name: string, table: Table, cur: Currency, from: string, to: string) {
  const lines = [table.cols, ...table.rows, ...(table.rows.length ? [table.foot] : [])]
  const text = '﻿' + lines.map((r) => r.map((c) => quote(csvValue(c))).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${name} ${cur} ${from} to ${to}.csv`
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Prints only the report table: the print stylesheet in styles.css is scoped to html.print-report. */
export function printReport() {
  const root = document.documentElement
  root.classList.add('print-report')
  const done = () => { root.classList.remove('print-report'); window.removeEventListener('afterprint', done) }
  window.addEventListener('afterprint', done)
  window.print()
}
