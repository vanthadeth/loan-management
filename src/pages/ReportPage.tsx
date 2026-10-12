import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { useI18n } from '../app/i18n'
import { usePageTitle } from '../app/Layout'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { CURRENCIES, useCurrency, useMoneyData } from '../data/money'
import { RangeControls } from './reports/RangeControls'
import { useReportRange } from './reports/range'
import { buildReport, cellText, isReport, REPORTS, type ReportName } from './reports/builders'
import { downloadCsv, printReport } from './reports/export'

export function ReportPage() {
  const { can } = useAuth()
  const { name = '' } = useParams()
  usePageTitle(name)
  if (!can('reports.view')) return <p className="muted">You do not have access to reports.</p>
  if (!isReport(name)) return <p className="muted">This report does not exist.</p>
  return <Report name={name} />
}

function Report({ name }: { name: ReportName }) {
  const { lang } = useI18n()
  const toast = useToast()
  const data = useMoneyData()
  const range = useReportRange()
  const [cur, setCur] = useCurrency()
  const [exporting, setExporting] = useState(false)

  const table = buildReport(name, { data, cur, lang, inRange: range.inRange })
  const filter = REPORTS.find((r) => r.name === name)?.filter
  const rt = (i: number) => (table.right.includes(i) ? 'r' : undefined)

  return (
    <>
      <RangeControls range={range} />
      <div className="row between no-print" style={{ alignItems: 'center', gap: 10 }}>
        <span className="small muted">{range.label}</span>
        <span className="row" style={{ gap: 10 }}>
          <div className="seg" role="group" aria-label="Currency">
            {CURRENCIES.map((c) => <button key={c} aria-pressed={cur === c} onClick={() => setCur(c)}>{c}</button>)}
          </div>
          <button className="icon-btn" onClick={() => setExporting(true)} aria-label={`Download ${name}`} title={`Download ${name}`}><Icon name="download" size={18} /></button>
        </span>
      </div>
      {filter && <p className="small muted no-print" style={{ margin: 0 }}>Balances are as of today. The dates filter by {filter}.</p>}
      <div className="print-only">
        <h2>{name}</h2>
        <p>{range.label} · {cur}</p>
      </div>
      <div className="rt-wrap">
        <table className="rt">
          <thead><tr>{table.cols.map((c, i) => <th key={c} className={rt(i)}>{c}</th>)}</tr></thead>
          <tbody>
            {table.rows.map((r, n) => <tr key={n}>{r.map((c, i) => <td key={i} className={rt(i)}>{cellText(c, cur)}</td>)}</tr>)}
            {table.rows.length === 0 && <tr><td colSpan={table.cols.length} className="muted">{data.isLoading ? 'Loading…' : 'No data for this period.'}</td></tr>}
          </tbody>
          {table.rows.length > 0 && <tfoot><tr>{table.foot.map((c, i) => <td key={i} className={rt(i)}>{cellText(c, cur)}</td>)}</tr></tfoot>}
        </table>
      </div>
      {exporting && (
        <Sheet title="Download report" onClose={() => setExporting(false)}>
          <p className="muted small" style={{ margin: '0 0 12px' }}>{name}</p>
          <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" className="btn blockbtn" onClick={() => { setExporting(false); setTimeout(printReport, 100) }}>
              <Icon name="pdf" size={18} />Download as PDF
            </button>
            <button type="button" className="btn blockbtn" onClick={() => { downloadCsv(name, table, cur, range.from, range.to); setExporting(false); toast(`${name} downloaded`) }}>
              <Icon name="xls" size={18} />Download as Excel (CSV)
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}
