import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '@shared/app/auth'
import { diffDays } from '@shared/lib/calc'
import { fmt, fmtD } from '@shared/lib/format'
import { CURRENCIES, net, useMoneyData, type EntryType, type LedgerEntry } from '@shared/data/money'
import { useI18n } from '../lib/i18n'
import { useColors } from '../lib/theme'
import { Btn, Card, Chip, Divider, Empty, Row, Tabs, Tic } from '../ui/core'
import { DateIconPicker, Fab, SearchBar } from '../ui/Controls'
import { Screen } from '../ui/Screen'
import { T } from '../ui/Text'
import { useBorrowerName } from './parts'

type Filter = 'all' | 'in' | 'out' | 'fund'
const FILTERS: [Filter, string, string][] = [['all', 'all', 'asterisk'], ['in', 'in', 'download'], ['out', 'out', 'upload'], ['fund', 'Funds', 'plus']]
const ICON: Record<EntryType, string> = { add: 'plus', wd: 'minus', in: 'download', out: 'upload' }
const PAGE = 40

export function Cashflow() {
  const { t } = useI18n()
  const c = useColors()
  const { can } = useAuth()
  const name = useBorrowerName()
  const { entries, today, isLoading } = useMoneyData()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [date, setDate] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const title = (e: LedgerEntry) => (e.borrower ? name(e.borrower) : e.title)
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return entries.filter((e) =>
      (filter === 'all' || (filter === 'fund' ? e.type === 'add' || e.type === 'wd' : e.type === filter))
      && (!needle || `${e.borrower?.name ?? ''} ${e.borrower?.name_km ?? ''} ${e.title} ${e.detail}`.toLowerCase().includes(needle))
      && (!date || e.date === date))
  }, [entries, q, filter, date])

  const label = (iso: string) => {
    const n = diffDays(iso, today)
    return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : fmtD(iso)
  }
  const groups: { g: string; r: LedgerEntry[] }[] = []
  rows.slice(0, limit).forEach((e) => {
    const g = label(e.date)
    const last = groups[groups.length - 1]
    if (last && last.g === g) last.r.push(e)
    else groups.push({ g, r: [e] })
  })
  const color = (e: LedgerEntry) => (e.type === 'in' ? c.paidText : e.type === 'out' ? c.late : e.type === 'add' ? c.accentText : c.warn)

  return (
    <Screen overlay={can('payments.record') ? <Fab label={t('record')} onPress={() => router.push('/cashflow/pay')} /> : null}>
      <SearchBar value={q} onChange={(v) => { setQ(v); setLimit(PAGE) }} right={<DateIconPicker value={date} onChange={(v) => { setDate(v); setLimit(PAGE) }} />} />
      <Tabs items={FILTERS.map(([k, n, ic]) => ({ key: k, label: k === 'fund' ? n : t(n), icon: ic }))} value={filter} onChange={(k) => { setFilter(k); setLimit(PAGE) }} />
      {!!date && (
        <Row>
          <Chip kind="approved" icon="cal" label={fmtD(date)} />
          <Btn sm icon="x" label="Show all dates" onPress={() => setDate('')} />
        </Row>
      )}
      {groups.length > 0 ? (
        <>
          {groups.map((G) => (
            <Card key={G.g} pad={0} style={{ gap: 0, overflow: 'hidden' }}>
              <View style={{ backgroundColor: c.surface2, paddingHorizontal: 14, paddingVertical: 7 }}><T b size={12} muted>{G.g}</T></View>
              {G.r.map((e, i) => (
                <View key={e.id}>
                  {i > 0 && <Divider style={{ marginLeft: 56 }} />}
                  <Row style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                    <Tic name={ICON[e.type]} kind={e.type} size={32} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T b size={14} ell>{title(e)}</T>
                      <T size={12} muted numberOfLines={2}>{e.detail}</T>
                    </View>
                    <T b num size={14} color={color(e)}>{e.direction === 'in' ? '+' : '−'}{fmt(e.amount, e.currency)}</T>
                  </Row>
                </View>
              ))}
              <Divider />
              <Row between style={{ paddingHorizontal: 14, paddingVertical: 9 }}>
                <T size={12.5} muted>Net change</T>
                <Row gap={12}>
                  {CURRENCIES.map((cur) => {
                    const part = G.r.filter((e) => e.currency === cur)
                    if (!part.length) return null
                    const v = net(part)
                    return <T key={cur} b={600} num size={12.5}>{v < 0 ? '−' : '+'}{fmt(Math.abs(v), cur)}</T>
                  })}
                </Row>
              </Row>
            </Card>
          ))}
          {rows.length > limit && <Btn label="Show more" onPress={() => setLimit(limit + PAGE)} style={{ alignSelf: 'center' }} />}
        </>
      ) : (
        <Empty>{isLoading ? 'Loading…' : date ? 'No entries on this date.' : 'No payments.'}</Empty>
      )}
    </Screen>
  )
}
