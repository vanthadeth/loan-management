import type { ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Text as SvgText } from 'react-native-svg'
import { router } from 'expo-router'
import { bname } from '@shared/data/borrowers'
import { STATUS_LABEL } from '@shared/data/admin'
import { CURRENCIES } from '@shared/data/money'
import { fmt, loanCode } from '@shared/lib/format'
import type { Currency, InstallmentStatus } from '@shared/lib/calc'
import type { LoanView } from '@shared/data/book'
import type { Borrower, Profile, Role } from '@shared/lib/types'
import { useI18n } from '../lib/i18n'
import { font, onHero, useColors } from '../lib/theme'
import { Chip, Item, Row, Tap } from '../ui/core'
import { Seg } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { T } from '../ui/Text'

/** One segment per installment: paid, overdue or still to come. */
export function Bar({ rows, flagLate, mini }: { rows: InstallmentStatus[]; flagLate: boolean; mini?: boolean }) {
  const c = useColors()
  return (
    <View style={{ flexDirection: 'row', height: mini ? 6 : 8, borderRadius: 99, overflow: 'hidden', gap: 2, backgroundColor: c.remain }}>
      {rows.map((r) => <View key={r.i} style={{ flex: 1, backgroundColor: r.state === 'paid' ? c.paid : flagLate && r.state === 'overdue' ? c.late : c.remain }} />)}
    </View>
  )
}

export function Ring({ p, size = 56, color, stroke = 7 }: { p: number; size?: number; color?: string; stroke?: number }) {
  const c = useColors()
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const h = size / 2
  return (
    <Svg width={size} height={size} accessibilityLabel={`${p}%`}>
      <Circle cx={h} cy={h} r={r} fill="none" stroke={c.track} strokeWidth={stroke} />
      <Circle cx={h} cy={h} r={r} fill="none" stroke={color ?? c.accent} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(circ * p) / 100} ${circ}`} transform={`rotate(-90 ${h} ${h})`} />
      <SvgText x={h} y={h + (size < 50 ? 4 : 5)} textAnchor="middle" fontSize={size < 50 ? 11 : 13} fontWeight="700" fontFamily={font.bold} fill={c.ink}>{`${p}%`}</SvgText>
    </Svg>
  )
}

/** Compact money for the list rows: 1.5M riel, $500. */
const compact = (n: number, c: Currency) => (c === 'USD' ? '$' + Math.round(n) : (Math.round(n / 1e4) / 100).toString() + 'M')

/** A loan in a list: borrower, amount, progress bar and status chips. */
export function LoanRow({ v, doneLabel }: { v: LoanView; doneLabel?: string }) {
  const { t, lang } = useI18n()
  const { loan, status, done, borrower } = v
  const approved = loan.status === 'approved'
  const late = approved && !done && status.rows.some((r) => r.state === 'overdue')
  const label = done ? (doneLabel ?? 'Completed') : loan.status === 'rejected' ? 'Denied' : t(loan.status)
  const kind = done ? 'approved' : loan.status === 'rejected' ? 'overdue' : loan.status
  return (
    <Item onPress={() => router.push(`/loans/${loan.id}`)}>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Row between><T b ell style={{ flex: 1 }}>{bname(borrower, lang)}</T><T b num>{fmt(loan.amount, loan.currency)}</T></Row>
        <Row between>
          <T v="small" muted ell style={{ flex: 1 }}>{loanCode(loan.id)} · {compact(status.collected, loan.currency)} / {compact(status.total, loan.currency)}</T>
          <Row gap={4}><Chip kind={kind} label={label} />{late && <Chip kind="overdue" label={t('overdue')} />}</Row>
        </Row>
        <Row gap={8}>
          <View style={{ flex: 1 }}><Bar rows={status.rows} flagLate={approved} mini /></View>
          <T v="small" b num>{Math.round((status.paidCount / loan.occurrences) * 100)}%</T>
        </Row>
      </View>
    </Item>
  )
}

/** KHR / USD switch. */
export function CurrencySeg({ value, onChange }: { value: Currency; onChange: (c: Currency) => void }) {
  return <Seg compact options={CURRENCIES} value={value} onChange={(v) => onChange(v as Currency)} />
}

/** Page greeting with the currency switch on the right. */
export function Greeting({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) {
  return (
    <Row between style={{ alignItems: 'flex-end' }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="h1" size={29} style={{ letterSpacing: -0.6, lineHeight: 36 }}>{title}</T>
        <T muted>{sub}</T>
      </View>
      {right}
    </Row>
  )
}

/** The dark card at the top of the dashboard (".hero"). */
export function Hero({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors()
  return <View style={[{ backgroundColor: c.hero, borderRadius: 11, paddingVertical: 22, paddingHorizontal: 20, gap: 10, overflow: 'hidden' }, style]}>{children}</View>
}

/** Eyebrow label, eye toggle and currency chip at the top of the hero. */
export function HeroHead({ label, hide, onToggle, cur }: { label: string; hide: boolean; onToggle: () => void; cur: Currency }) {
  return (
    <Row between>
      <Row gap={8}>
        <T v="eyebrow" color={onHero.ink} style={{ opacity: 0.85 }}>{label}</T>
        <Tap onPress={onToggle} accessibilityLabel="Show or hide amounts" accessibilityState={{ selected: hide }} style={{ opacity: 0.85 }}>
          <Icon name={hide ? 'eyeoff' : 'eye'} size={18} color={onHero.ink} />
        </Tap>
      </Row>
      <View style={{ backgroundColor: onHero.soft, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}><T b size={11.5} color={onHero.ink}>{cur}</T></View>
    </Row>
  )
}

/** Three small figures in a row under the hero amount (".hstats"). */
export function HeroStats({ items }: { items: [string, string][] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: onHero.line }}>
      {items.map(([k, v]) => (
        <View key={k} style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T size={11.5} color={onHero.ink} style={{ opacity: 0.85 }}>{k}</T>
          <T b num size={15} color={onHero.ink}>{v}</T>
        </View>
      ))}
    </View>
  )
}

const TIER_ICON: Record<string, string> = { all: 'asterisk', gold: 'medal', silver: 'medal', normal: 'userp', banned: 'ban' }
export const tierIcon = (kind: string) => TIER_ICON[kind]

/** Trust level chip, or the Banned chip for banned borrowers. */
export function BorrowerChip({ b }: { b: Pick<Borrower, 'tier' | 'status'> }) {
  const { t } = useI18n()
  const kind = b.status === 'banned' ? 'banned' : b.tier
  return <Chip kind={kind} label={t(kind)} icon={TIER_ICON[kind]} />
}

export function TierChip({ tier }: { tier: Borrower['tier'] }) {
  const { t } = useI18n()
  return <Chip kind={tier} label={t(tier)} icon={TIER_ICON[tier]} />
}

export function RoleChip({ role }: { role?: Role | null }) {
  if (!role) return <Chip kind="requested" label="No role" />
  return <Chip kind={role.locked ? 'approved' : 'verified'} label={role.name} icon={role.locked ? 'lock' : undefined} />
}

export function StatusChip({ status }: { status: Profile['status'] }) {
  if (status === 'suspended') return <Chip kind="requested" label={STATUS_LABEL[status]} />
  if (status === 'discharged') return <Chip kind="banned" label={STATUS_LABEL[status]} icon="ban" />
  return <Chip kind="active" label={STATUS_LABEL[status]} />
}

/** Borrower name as shown in lists. */
export const useBorrowerName = () => {
  const { lang } = useI18n()
  return (b: Pick<Borrower, 'name' | 'name_km'> | undefined) => bname(b, lang)
}

/** A bento tile (".bt"): icon and label, a big value, a detail line. */
export function Tile({ icon, label, value, sub, onPress, tint, dot, style, children }: {
  icon?: string; label: string; value?: string | number; sub?: string; onPress?: () => void
  tint?: 'sky' | 'lilac' | 'green' | 'orange'; dot?: boolean; style?: StyleProp<ViewStyle>; children?: ReactNode
}) {
  const c = useColors()
  const tints = { sky: [c.tSky, c.tSkyI], lilac: [c.tLilac, c.tLilacI], green: [c.tGreen, c.tGreenI], orange: [c.tOrange, c.tOrangeI] }
  const [bg, fg] = tint ? tints[tint] : [c.surface, c.muted]
  const body = (
    <>
      <Row gap={10}>
        {icon && <View style={{ padding: 7, borderRadius: 5, backgroundColor: c.surface2 }}><Icon name={icon} size={18} color={fg} /></View>}
        <T b size={12.5} color={fg} style={{ flexShrink: 1 }}>{label}</T>
        {dot && <View accessibilityLabel="Needs your attention" style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.late }} />}
      </Row>
      {value !== undefined && <T b num size={34} style={{ letterSpacing: -0.6, lineHeight: 40, marginTop: 4 }}>{value}</T>}
      {children}
      {sub && <T v="small" muted>{sub}</T>}
    </>
  )
  const s: StyleProp<ViewStyle> = [{ backgroundColor: bg, borderRadius: 11, padding: 18, gap: 10, minWidth: 0, borderWidth: 0.5, borderColor: c.hair }, style]
  return onPress ? <Tap onPress={onPress} style={s}>{body}</Tap> : <View style={s}>{body}</View>
}
