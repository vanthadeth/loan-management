import { useState } from 'react'
import { View } from 'react-native'
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg'
import { maskMoney, periodLabel, periodRange, type Period, type Unit } from '@shared/data/money'
import type { Currency } from '@shared/lib/calc'
import { font, onHero } from '../../lib/theme'
import { Row, Tap } from '../../ui/core'
import { Seg } from '../../ui/Controls'
import { Icon } from '../../ui/Icon'
import { T } from '../../ui/Text'

const UNITS = [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]
const BASE = 88
const H = 66
const STEP = 48
const BW = 28
const BAR = '#5D9CEC'

/** Collected and expected cash for 3 periods back to 3 ahead, with the selected period's figures below. */
export function HeroBars({ periods, unit, onUnit, sel, onSel, cur, hide }: {
  periods: Period[]; unit: Unit; onUnit: (u: Unit) => void; sel: number; onSel: (k: number) => void; cur: Currency; hide: boolean
}) {
  const [open, setOpen] = useState(false)
  const mx = Math.max(...periods.map((q) => q.c + q.x), 1)
  const compact = (v: number) => (cur === 'KHR' ? Math.round(v / 1e5) / 10 + 'M' : '$' + Math.round(v))
  const m = (n: number) => maskMoney(n, cur, hide)
  const sp = periods[sel]
  const sign = (n: number, s: string) => (n ? s + m(n) : '—')
  const rows: [string, string, string?, boolean?][] = [
    ['Fund available', m(sp.open)],
    ['Fund added', sign(sp.add, '+'), sp.add ? onHero.paid : undefined],
    ['Fund withdrawn', sign(sp.withdraw, '−'), sp.withdraw ? onHero.late : undefined],
    ['Loan given', sign(sp.loan, '−'), sp.loan ? onHero.late : undefined],
    ['Loan amount', sp.gross ? m(sp.gross) : '—', undefined, true],
    ['Service fee (deducted)', sp.gross ? '−' + m(sp.fee) : '—', undefined, true],
    ['Collect', '+' + m(sp.col), onHero.paid],
    ['Principal collected', m(sp.principal), undefined, true],
    ['Interest earned', m(sp.interest), undefined, true],
    ['Late fees', m(sp.lateFees), undefined, true],
  ]
  return (
    <>
      <Row between style={{ marginTop: 14, marginBottom: 10 }}>
        <T v="small" color={onHero.ink} style={{ opacity: 0.9 }}>Collected and expected</T>
        <Seg compact onHero options={UNITS} value={unit} onChange={(v) => onUnit(v as Unit)} />
      </Row>
      <Svg viewBox="0 0 342 118" width="100%" height={136} accessibilityLabel="Collected and expected cash, 3 periods back to 3 ahead">
        <Line x1="4" x2="338" y1={BASE + 0.5} y2={BASE + 0.5} stroke={onHero.ink} opacity={0.3} />
        {periods.map((q, k) => {
          const x = 3 + k * STEP + (STEP - BW) / 2
          const hc = (q.c / mx) * H
          const hx = (q.x / mx) * H
          const tot = q.c + q.x
          const now = k === 3
          return (
            <G key={k} onPress={() => onSel(k)} accessibilityLabel={periodRange(q, unit)}>
              <Rect x={3 + k * STEP + 1} y="2" width={STEP - 2} height="116" rx="10" fill={onHero.ink} fillOpacity={0.001} stroke={onHero.ink} strokeWidth="1"
                strokeDasharray="3 7" strokeLinecap="round" strokeOpacity={k === sel ? 0.38 : 0} />
              {hx > 0 && <Rect x={x} y={BASE - hc - hx} width={BW} height={hx + (hc ? 4 : 0)} rx="6" fill={BAR} opacity={0.42} />}
              {hc > 0 && <Rect x={x} y={BASE - hc} width={BW} height={hc} rx="6" fill={BAR} />}
              {!tot
                ? <Rect x={x} y={BASE - 3} width={BW} height="3" rx="1.5" fill={onHero.ink} opacity={0.35} />
                : <SvgText x={x + BW / 2} y={BASE - hc - hx - 4} textAnchor="middle" fontSize={10} fontFamily={font.semi} fill={onHero.ink}>{hide ? '' : compact(tot)}</SvgText>}
              <SvgText x={x + BW / 2} y="101" textAnchor="middle" fontSize={10} fontFamily={now ? font.bold : font.regular} fill={onHero.ink}>{periodLabel(q, unit)}</SvgText>
              {now && <SvgText x={x + BW / 2} y="112" textAnchor="middle" fontSize={9} fontFamily={font.bold} fill={onHero.ink}>now</SvgText>}
            </G>
          )
        })}
      </Svg>
      <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)', marginTop: 14, marginHorizontal: -20, paddingHorizontal: 20 }}>
        <Tap onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ paddingTop: 14, paddingBottom: 10, gap: 2 }}>
          <Row between>
            <T color={onHero.ink}>{periodRange(sp, unit)}</T>
            <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><Icon name="chev" size={16} color={onHero.muted} /></View>
          </Row>
          {!open && (
            <View style={{ marginTop: 6, gap: 2 }}>
              <T b size={10.5} color={onHero.muted} style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>Balance</T>
              <T b num size={22} color={onHero.ink}>{m(sp.balance)}</T>
            </View>
          )}
        </Tap>
        {open && (
          <View>
            {rows.map(([k, v, col, sub]) => (
              <Row key={k} between style={{ paddingVertical: sub ? 5 : 10, paddingLeft: sub ? 18 : 4, paddingRight: 4, borderTopWidth: !sub ? 1 : 0, borderTopColor: onHero.line }}>
                <T size={sub ? 14 : 15.5} color={sub ? onHero.muted : onHero.ink} style={{ flex: 1 }}>{k}</T>
                <T num size={sub ? 14 : 15.5} color={col ?? (sub ? onHero.muted : onHero.ink)}>{v}</T>
              </Row>
            ))}
            <Row between style={{ paddingVertical: 10, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: onHero.line }}>
              <T b={600} size={16} color={onHero.ink}>Balance</T>
              <T b={600} num size={16} color={onHero.ink}>{m(sp.balance)}</T>
            </Row>
            <View style={{ flexDirection: 'row', marginTop: 12, paddingTop: 4, paddingBottom: 6 }}>
              {([[sp.count, 'coin', 'Collection'], [sp.borrowers, 'users', 'Borrower'], [sp.newLoans, 'loan', 'New loan']] as const).map(([n, ic, l], i) => (
                <View key={l} style={{ flex: 1, alignItems: 'center', gap: 4, borderLeftWidth: i ? 1 : 0, borderLeftColor: onHero.line }}>
                  <T b num size={22} color={onHero.ink}>{n}</T>
                  <Row gap={5}><Icon name={ic} size={16} color={onHero.accent} /><T b={600} size={12} color={onHero.muted}>{l}</T></Row>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </>
  )
}
