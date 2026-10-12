import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '@shared/app/auth'
import { dueParts, net, openLoans, sum, useCurrency, useMoneyData } from '@shared/data/money'
import { fmt, fmtD } from '@shared/lib/format'
import { PRESETS, useReportRange, type Per } from '@shared/pages/reports/range'
import { buildReport, cellText, isReport, REPORTS, type ReportName, type Table } from '@shared/pages/reports/builders'
import { csvText, reportFileName } from '@shared/pages/reports/export'
import { useI18n } from '../lib/i18n'
import { sharePdf, shareText } from '../lib/share'
import { useColors } from '../lib/theme'
import { Btn, Item, LCard, Row, Tic } from '../ui/core'
import { DateField, Dropdown } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { Screen } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'
import { T } from '../ui/Text'
import { useToast } from '../ui/Toast'
import { CurrencySeg, Tile } from './parts'

/** From / To pickers plus the Period dropdown that drive every report. */
function RangeControls({ range }: { range: ReturnType<typeof useReportRange> }) {
  return (
    <View style={{ gap: 10 }}>
      <Row>
        <DateField label="From" value={range.from} onChange={range.setFrom} style={{ flex: 1 }} />
        <DateField label="To" value={range.to} onChange={range.setTo} style={{ flex: 1 }} />
      </Row>
      <Dropdown label="Period" value={range.per}
        options={[...PRESETS.map(([value, label]) => ({ value, label })), { value: 'range', label: 'Custom dates' }]}
        onChange={(v) => range.setPer(v as Per)} />
    </View>
  )
}

const Divider = ({ label }: { label: string }) => {
  const c = useColors()
  return (
    <Row style={{ paddingTop: 12 }}>
      <T v="eyebrow">{label}</T>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.hair }} />
    </Row>
  )
}

export function Reports() {
  const { can } = useAuth()
  return <Screen>{can('reports.view') ? <ReportsHome /> : <T muted>You do not have access to reports.</T>}</Screen>
}

function ReportsHome() {
  const c = useColors()
  const data = useMoneyData()
  const range = useReportRange()
  const [cur, setCur] = useCurrency()
  const { from, to } = range

  const f = useMemo(() => {
    const E = data.entries.filter((e) => e.currency === cur && e.date >= from && e.date <= to)
    const pays = E.filter((e) => e.kind === 'payment')
    const open = openLoans(data, cur)
    return {
      pays: pays.length,
      collected: sum(pays),
      interest: sum(pays, (e) => e.interest),
      principal: sum(pays, (e) => e.principal),
      misc: [
        ['Service fees', fmt(sum(E.filter((e) => e.kind === 'fee')), cur)],
        ['Late fees', fmt(sum(pays, (e) => e.lateFee), cur)],
        ['Loans released', fmt(sum(E.filter((e) => e.kind === 'release')), cur)],
        ['Fund added', fmt(sum(E.filter((e) => e.kind === 'add')), cur)],
        ['Fund withdrawn', fmt(sum(E.filter((e) => e.kind === 'withdraw')), cur)],
        ['Net cash change', (net(E) < 0 ? '−' : '+') + fmt(Math.abs(net(E)), cur)],
        ['Overdue now', fmt(open.reduce((s, v) => s + v.status.rows.filter((r) => r.state === 'overdue').reduce((a, r) => a + dueParts(r).remaining, 0), 0), cur)],
        ['Active loans', String(open.length)],
      ],
    }
  }, [data, cur, from, to])

  return (
    <>
      <RangeControls range={range} />
      <Row between>
        <T v="small" muted style={{ flex: 1 }}>{range.label}</T>
        <CurrencySeg value={cur} onChange={setCur} />
      </Row>
      <View style={{ backgroundColor: c.accent, borderRadius: 11, padding: 18, gap: 8 }}>
        <Row gap={10}>
          <View style={{ padding: 7, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.2)' }}><Icon name="download" size={18} color={c.accentInk} /></View>
          <T b size={12.5} color={c.accentInk} style={{ opacity: 0.9 }}>Collected</T>
        </Row>
        <T b num size={36} color={c.accentInk} adjustsFontSizeToFit numberOfLines={1} style={{ letterSpacing: -0.6, lineHeight: 44 }}>{fmt(f.collected, cur)}</T>
        <T v="small" color={c.accentInk} style={{ opacity: 0.85 }}>{f.pays} {f.pays === 1 ? 'payment' : 'payments'} received</T>
      </View>
      <Row gap={12} style={{ alignItems: 'stretch' }}>
        <Tile style={{ flex: 1 }} icon="pie" label="Interest earned" sub="Income from interest">
          <T b num size={22} adjustsFontSizeToFit numberOfLines={1}>{fmt(f.interest, cur)}</T>
        </Tile>
        <Tile style={{ flex: 1 }} icon="coin" label="Principal collected" sub="Loan amount paid back">
          <T b num size={22} adjustsFontSizeToFit numberOfLines={1}>{fmt(f.principal, cur)}</T>
        </Tile>
      </Row>
      <Divider label="Other figures" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {f.misc.map(([k, v]) => (
          <View key={k} style={{ width: '47%', flexGrow: 1, gap: 2, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hair }}>
            <T v="small" muted>{k}</T><T b={600} num size={16}>{v}</T>
          </View>
        ))}
      </View>
      <Divider label="Reports" />
      <LCard>
        {REPORTS.map((r) => (
          <Item key={r.name} onPress={() => router.push(`/reports/${encodeURIComponent(r.name)}`)}>
            <Tic name={r.icon} kind="accent" size={32} />
            <View style={{ flex: 1, minWidth: 0 }}><T b ell>{r.name}</T><T v="small" muted ell>{r.desc}</T></View>
            <Icon name="chev" size={16} color={c.muted} />
          </Item>
        ))}
      </LCard>
    </>
  )
}

export function ReportPage({ name }: { name: string }) {
  const { can } = useAuth()
  if (!can('reports.view')) return <Screen title={name}><T muted>You do not have access to reports.</T></Screen>
  if (!isReport(name)) return <Screen title={name}><T muted>This report does not exist.</T></Screen>
  return <Report name={name} />
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A printable page with the report table, for the PDF. */
function reportHtml(name: string, sub: string, table: Table, cur: 'KHR' | 'USD') {
  const al = (i: number) => (table.right.includes(i) ? ' style="text-align:right"' : '')
  const row = (cells: Table['foot'], tag: 'td' | 'th') => '<tr>' + cells.map((x, i) => `<${tag}${al(i)}>${esc(typeof x === 'string' ? x : cellText(x, cur))}</${tag}>`).join('') + '</tr>'
  return '<!doctype html><html><head><meta charset="utf-8"><style>' +
    "@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;700&display=swap');" +
    "body{font-family:'Noto Sans Khmer',system-ui,sans-serif;color:#222;margin:24px}h2{margin:0 0 4px}p{margin:0 0 14px;color:#666}" +
    'table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}' +
    'th{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#666;background:#f3f5f9}tfoot td{font-weight:700;background:#f3f5f9}' +
    `</style></head><body><h2>${esc(name)}</h2><p>${esc(sub)}</p><table><thead>${row(table.cols, 'th')}</thead>` +
    `<tbody>${table.rows.map((r) => row(r, 'td')).join('')}</tbody>${table.rows.length ? `<tfoot>${row(table.foot, 'td')}</tfoot>` : ''}</table></body></html>`
}

function Report({ name }: { name: ReportName }) {
  const { lang } = useI18n()
  const c = useColors()
  const toast = useToast()
  const data = useMoneyData()
  const range = useReportRange()
  const [cur, setCur] = useCurrency()
  const [exporting, setExporting] = useState(false)

  const table = buildReport(name, { data, cur, lang, inRange: range.inRange })
  const filter = REPORTS.find((r) => r.name === name)?.filter
  const right = (i: number) => table.right.includes(i)
  // column widths from the longest text in each column, so the table can scroll sideways
  const widths = table.cols.map((col, i) => Math.min(260, Math.max(64, col.length * 9 + 28, ...[...table.rows.map((r) => cellText(r[i], cur)), cellText(table.foot[i], cur)].map((s) => s.length * 7.6 + 26))))
  const cell = (text: string, i: number, style: object) => (
    <View key={i} style={[{ width: widths[i], paddingVertical: 10, paddingHorizontal: 12 }, i === 0 ? { position: 'relative' } : null]}>
      <T num size={13.5} right={right(i)} numberOfLines={1} {...style}>{text}</T>
    </View>
  )

  const exportPdf = async () => {
    setExporting(false)
    try { await sharePdf(`${name} ${cur} ${range.from} to ${range.to}.pdf`, reportHtml(name, `${range.label} · ${cur}`, table, cur)) } catch (e) { toast((e as Error).message) }
  }
  const exportCsv = async () => {
    setExporting(false)
    try {
      await shareText(reportFileName(name, cur, range.from, range.to), csvText(table), 'text/csv', 'public.comma-separated-values-text')
      toast(`${name} downloaded`)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Screen title={name}>
      <RangeControls range={range} />
      <Row between>
        <T v="small" muted style={{ flex: 1 }}>{range.label}</T>
        <CurrencySeg value={cur} onChange={setCur} />
        <Btn sm icon="download" label="Export" onPress={() => setExporting(true)} />
      </Row>
      {filter && <T v="small" muted>Balances are as of today. The dates filter by {filter}.</T>}
      <View style={{ borderRadius: 10, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hair, overflow: 'hidden' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={{ flexDirection: 'row', backgroundColor: c.surface2 }}>
              {table.cols.map((col, i) => cell(col.toUpperCase(), i, { b: 600, size: 11, muted: true }))}
            </View>
            {table.rows.map((r, n) => (
              <View key={n} style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hair }}>
                {r.map((x, i) => cell(cellText(x, cur), i, {}))}
              </View>
            ))}
            {table.rows.length > 0 && (
              <View style={{ flexDirection: 'row', backgroundColor: c.surface2, borderTopWidth: 1.5, borderTopColor: c.line }}>
                {table.foot.map((x, i) => cell(cellText(x, cur), i, { b: 700 }))}
              </View>
            )}
          </View>
        </ScrollView>
        {table.rows.length === 0 && <T muted style={{ padding: 14 }}>{data.isLoading ? 'Loading…' : 'No data for this period.'}</T>}
      </View>
      {exporting && (
        <Sheet title="Download report" onClose={() => setExporting(false)}>
          <T v="small" muted>{name} · {fmtD(range.from)} – {fmtD(range.to)}</T>
          <Btn block icon="pdf" label="Download as PDF" onPress={exportPdf} />
          <Btn block icon="xls" label="Download as Excel (CSV)" onPress={exportCsv} style={{ marginTop: 0 }} />
        </Sheet>
      )}
    </Screen>
  )
}
