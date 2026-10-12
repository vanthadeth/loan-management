import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '@shared/app/auth'
import { addDays } from '@shared/lib/calc'
import { fmt, fmtD, loanCode } from '@shared/lib/format'
import { buildPeriods, dashFigures, dueParts, maskMoney, net, openLoans, useCurrency, useHideAmounts, useMoneyData, type Unit } from '@shared/data/money'
import { useI18n } from '../lib/i18n'
import { onHero, useColors } from '../lib/theme'
import { Empty, Heading, Item, LCard, Row, Tabs, Tap } from '../ui/core'
import { Screen } from '../ui/Screen'
import { T } from '../ui/Text'
import { CurrencySeg, Greeting, Hero, HeroHead, HeroStats, useBorrowerName } from './parts'
import { HeroBars } from './money/HeroBars'
import { FundSheet } from './money/FundSheet'
import { FieldHome } from './money/FieldHome'

type DueTab = 'all' | 'upcoming' | 'overdue'
const TAB_ICON: Record<DueTab, string> = { all: 'asterisk', upcoming: 'clock', overdue: 'alert' }

/** Admins and anyone who sees funds get the money dashboard; field roles get a round of their own loans. */
export function Dashboard() {
  const { can } = useAuth()
  return <Screen>{can('funds.view') || !can('loans.view') ? <MoneyDashboard /> : <FieldHome />}</Screen>
}

function MoneyDashboard() {
  const { t } = useI18n()
  const c = useColors()
  const { can } = useAuth()
  const name = useBorrowerName()
  const data = useMoneyData()
  const [cur, setCur] = useCurrency()
  const [hide, toggleHide] = useHideAmounts()
  const [unit, setUnit] = useState<Unit>('week')
  const [sel, setSel] = useState(3)
  const [dueTab, setDueTab] = useState<DueTab>('all')
  const [fundOpen, setFundOpen] = useState(false)

  const seeFunds = can('funds.view')
  const fig = useMemo(() => dashFigures(data, cur), [data, cur])
  const periods = useMemo(() => buildPeriods(unit, data, cur), [unit, data, cur])
  const available = useMemo(
    () => ({ KHR: net(data.entries.filter((e) => e.currency === 'KHR')), USD: net(data.entries.filter((e) => e.currency === 'USD')) }),
    [data.entries],
  )
  const due = useMemo(() => {
    const out = openLoans(data, cur).flatMap((v) =>
      v.status.rows.filter((r) => r.state !== 'paid').map((r) => ({ v, r, owed: dueParts(r).remaining, late: r.state === 'overdue' })))
    return out.sort((a, b) => (a.r.due < b.r.due ? -1 : a.r.due > b.r.due ? 1 : 0))
  }, [data, cur])

  const m = (n: number) => maskMoney(n, cur, hide)
  const shown = due.filter((x) => dueTab === 'all' || (dueTab === 'overdue') === x.late).slice(0, 8)
  const weekEnd = addDays(data.today, 7)
  const groups = [
    [t('overdue'), shown.filter((x) => x.late)],
    ['This week', shown.filter((x) => !x.late && x.r.due <= weekEnd)],
    ['Later', shown.filter((x) => !x.late && x.r.due > weekEnd)],
  ] as const

  return (
    <>
      <Greeting title={t('greet')} sub={t('greetSub')} right={<CurrencySeg value={cur} onChange={(x) => { setCur(x); setSel(3) }} />} />
      <Hero>
        <HeroHead label={t('available')} hide={hide} onToggle={toggleHide} cur={cur} />
        <Row between style={{ gap: 12 }}>
          <T v="big" num size={30} color={onHero.big} style={{ flex: 1, letterSpacing: -0.6 }} adjustsFontSizeToFit numberOfLines={1}>{seeFunds ? m(fig.funds) : '—'}</T>
          {can('funds.add') && (
            <Tap onPress={() => setFundOpen(true)} style={{ backgroundColor: '#F5F7FA', borderRadius: 99, paddingVertical: 9, paddingHorizontal: 16 }}>
              <T b color="#434A54">{t('addFund')}</T>
            </Tap>
          )}
        </Row>
        <HeroStats items={[[t('shOn'), m(fig.onLoan)], [t('shTbc'), m(fig.toCollect)], [t('shAfter'), seeFunds ? m(fig.funds + fig.toCollect) : '—']]} />
        <HeroBars periods={periods} unit={unit} onUnit={(u) => { setUnit(u); setSel(3) }} sel={sel} onSel={setSel} cur={cur} hide={hide} />
      </Hero>
      <View style={{ gap: 12 }}>
        <T v="h2">{t('due')}</T>
        <Tabs items={(['all', 'upcoming', 'overdue'] as DueTab[]).map((k) => ({ key: k, label: t(k), icon: TAB_ICON[k] }))} value={dueTab} onChange={setDueTab} />
        <LCard>
          {shown.length === 0 && <Empty>{data.isLoading ? 'Loading…' : 'Nothing due.'}</Empty>}
          {groups.filter(([, rows]) => rows.length > 0).flatMap(([h, rows]) => [
            <Heading key={h}>{h}</Heading>,
            ...rows.map(({ v, r, owed, late }) => (
              <Item key={`${v.loan.id}-${r.i}`} onPress={() => router.push(`/loans/${v.loan.id}`)} style={{ paddingVertical: 9 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T b ell>{name(v.borrower)}</T>
                  <T v="small" color={late ? c.late : c.muted} b={late ? 600 : 400}>
                    {loanCode(v.loan.id)} · #{r.i} · {fmtD(r.due)}{late ? ` · ${r.lateDays}d late` : ''}
                  </T>
                </View>
                <T b num color={late ? c.late : c.ink}>{fmt(owed, cur)}</T>
              </Item>
            )),
          ])}
        </LCard>
      </View>
      {fundOpen && <FundSheet currency={cur} available={available} onClose={() => setFundOpen(false)} />}
    </>
  )
}
