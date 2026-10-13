import { useMemo } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '@shared/app/auth'
import { dn } from '@shared/data/core'
import { addDays } from '@shared/lib/calc'
import { fmt, fmtD, loanCode } from '@shared/lib/format'
import { dashFigures, dueParts, maskMoney, openLoans, useCurrency, useHideAmounts, useMoneyData } from '@shared/data/money'
import { onHero, useColors } from '../../lib/theme'
import { Card, Empty, IconBtn, Item, LCard, Tap } from '../../ui/core'
import { T } from '../../ui/Text'
import { CurrencySeg, Greeting, Hero, HeroHead, HeroStats, Ring, useBorrowerName } from '../parts'

/**
 * Home for supervisors and collectors: only the loans they can see, their own totals, how much of today's
 * round is collected, and the stops to visit with a one-tap Record payment.
 */
export function FieldHome() {
  const c = useColors()
  const { can, me } = useAuth()
  const name = useBorrowerName()
  const data = useMoneyData()
  const [cur, setCur] = useCurrency()
  const [hide, toggleHide] = useHideAmounts()
  const m = (n: number) => maskMoney(n, cur, hide)
  const collector = !can('loans.create')
  const fig = useMemo(() => dashFigures(data, cur), [data, cur])
  const open = useMemo(() => openLoans(data, cur), [data, cur])
  const weekEnd = addDays(data.today, 7)

  const stops = useMemo(() => {
    const out = open.flatMap((v) =>
      v.status.rows.filter((r) => r.state !== 'paid' && r.due <= weekEnd).map((r) => ({ v, r, owed: dueParts(r).remaining, late: r.state === 'overdue' || r.due < data.today })))
    return out.sort((a, b) => (a.late !== b.late ? (a.late ? -1 : 1) : a.r.due < b.r.due ? -1 : a.r.due > b.r.due ? 1 : 0))
  }, [open, weekEnd, data.today])

  const lateCount = stops.filter((x) => x.late).length
  const dueNow = stops.filter((x) => x.r.due <= data.today).reduce((s, x) => s + x.owed, 0)
  const paidToday = open.reduce((s, v) => s + v.payments.filter((p) => p.paid_on === data.today).reduce((t, p) => t + p.amount, 0), 0)
  const pct = paidToday + dueNow > 0 ? Math.round((paidToday / (paidToday + dueNow)) * 100) : 0
  const month = data.today.slice(0, 7)
  const thisMonth = open.reduce((s, v) => s + v.payments.filter((p) => p.paid_on.startsWith(month)).reduce((t, p) => t + p.amount, 0), 0)

  return (
    <>
      <Greeting title={collector ? 'Today' : 'My portfolio'} sub={`${dn(me)} · ${open.length} open ${open.length === 1 ? 'loan' : 'loans'}`} right={<CurrencySeg value={cur} onChange={setCur} />} />
      <Hero>
        <HeroHead label="Out on loan" hide={hide} onToggle={toggleHide} cur={cur} />
        <T v="big" num color={onHero.big} adjustsFontSizeToFit numberOfLines={1}>{m(fig.onLoan)}</T>
        <HeroStats items={[['To collect', m(fig.toCollect)], ['Collected this month', m(thisMonth)], ['Late', String(lateCount)]]} />
      </Hero>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Ring p={pct} size={64} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="eyebrow">Collected today</T>
          <T b num size={20}>{m(paidToday)}</T>
          <T v="small" muted>{dueNow > 0 ? `${m(dueNow)} still to collect` : 'Nothing left to collect today'}</T>
        </View>
      </Card>
      <View style={{ gap: 10 }}>
        <T v="h2">Next stops</T>
        <LCard>
          {!stops.length && <Empty>{data.isLoading ? 'Loading…' : 'Nothing due this week.'}</Empty>}
          {stops.slice(0, 12).map(({ v, r, owed, late }) => (
            <Item key={`${v.loan.id}-${r.i}`} style={{ paddingVertical: 9 }}>
              <Tap onPress={() => router.push(`/loans/${v.loan.id}`)} style={{ flex: 1, minWidth: 0 }}>
                <T b ell>{name(v.borrower)}</T>
                <T v="small" color={late ? c.late : c.muted} b={late ? 600 : 400}>
                  {loanCode(v.loan.id)} · #{r.i} · {fmtD(r.due)}{late && r.lateDays > 0 ? ` · ${r.lateDays}d late` : ''}
                </T>
              </Tap>
              <T b num color={late ? c.late : c.ink}>{fmt(owed, cur)}</T>
              {can('payments.record') && (
                <IconBtn name="plus" size={34} label={`Record payment for ${name(v.borrower)}`} bg={c.accentSoft} color={c.accent}
                  onPress={() => router.push(`/cashflow/pay?loan=${v.loan.id}`)} />
              )}
            </Item>
          ))}
        </LCard>
      </View>
    </>
  )
}
