import { Children, isValidElement, useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import { haptic } from '../lib/haptics'
import { useColors, type Colors } from '../lib/theme'
import { Icon } from './Icon'
import { T } from './Text'

type Style = StyleProp<ViewStyle>

/** Pressable with a light tap vibration and a pressed state. */
export function Tap({ onPress, style, disabled, children, feedback = true, ...rest }: PressableProps & {
  style?: Style | ((p: { pressed: boolean }) => Style); feedback?: boolean
}) {
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPress={(e) => { if (feedback) haptic('light'); onPress?.(e) }}
      style={(s) => [typeof style === 'function' ? style(s) : style, s.pressed && !disabled ? { opacity: 0.72 } : null]}
    >
      {children}
    </Pressable>
  )
}

export const Row = ({ children, style, gap = 10, between, wrap }: { children?: ReactNode; style?: Style; gap?: number; between?: boolean; wrap?: boolean }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap, minWidth: 0 }, between && { justifyContent: 'space-between' }, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>
)

export const Grow = ({ children, style }: { children?: ReactNode; style?: Style }) => <View style={[{ flex: 1, minWidth: 0 }, style]}>{children}</View>

export function Card({ children, style, onPress, pad = 18 }: { children?: ReactNode; style?: Style; onPress?: () => void; pad?: number }) {
  const c = useColors()
  const s = [{ backgroundColor: c.surface, borderRadius: 9, padding: pad, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hair, gap: 10 }, style]
  return onPress ? <Tap onPress={onPress} style={s}>{children}</Tap> : <View style={s}>{children}</View>
}

/** A list inside a card: rows separated by hairlines. */
export function LCard({ children, style }: { children?: ReactNode; style?: Style }) {
  const c = useColors()
  const items = Children.toArray(children).filter(isValidElement)
  return (
    <View style={[{ backgroundColor: c.surface, borderRadius: 9, paddingHorizontal: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hair }, style]}>
      {items.map((el, i) => (
        <View key={el.key ?? i} style={i < items.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider } : null}>{el}</View>
      ))}
    </View>
  )
}

/** One tappable row of a list. */
export function Item({ children, onPress, style, dim }: { children?: ReactNode; onPress?: () => void; style?: Style; dim?: boolean }) {
  const inner = [{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 13, minWidth: 0 }, dim && { opacity: 0.6 }, style]
  return onPress ? <Tap onPress={onPress} style={inner}>{children}</Tap> : <View style={inner}>{children}</View>
}

/** Small uppercase heading above a group (".dh" on the web). */
export const Heading = ({ children, style }: { children: ReactNode; style?: Style }) => (
  <View style={[{ paddingTop: 14, paddingBottom: 4 }, style]}><T v="eyebrow">{children}</T></View>
)

export const Divider = ({ style }: { style?: Style }) => {
  const c = useColors()
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.divider }, style]} />
}

type BtnKind = 'default' | 'primary' | 'ghost' | 'danger'
const btnColors = (c: Colors, k: BtnKind) =>
  k === 'primary' ? { bg: c.accent, fg: c.accentInk, border: c.accent }
    : k === 'danger' ? { bg: c.lateSoft, fg: c.late, border: 'transparent' }
      : k === 'ghost' ? { bg: 'transparent', fg: c.ink, border: c.line }
        : { bg: c.surface, fg: c.ink, border: c.line }

export function Btn({ label, onPress, kind = 'default', sm, block, icon, disabled, busy, style, color }: {
  label: string; onPress?: () => void | Promise<unknown>; kind?: BtnKind; sm?: boolean; block?: boolean; icon?: string
  disabled?: boolean; busy?: boolean; style?: Style; color?: string
}) {
  const c = useColors()
  const [running, setRunning] = useState(false)
  const k = btnColors(c, kind)
  const wait = busy || running
  const press = async () => {
    const r = onPress?.()
    if (r instanceof Promise) {
      setRunning(true)
      try { await r } finally { setRunning(false) }
    }
  }
  return (
    <Tap
      onPress={press} disabled={disabled || wait} accessibilityRole="button" accessibilityLabel={label}
      style={[{
        minHeight: sm ? 34 : block ? 46 : 40, paddingHorizontal: sm ? 12 : 14, borderRadius: sm ? 4 : 6, borderWidth: 1,
        backgroundColor: k.bg, borderColor: k.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        opacity: disabled ? 0.5 : 1,
      }, block && { alignSelf: 'stretch', marginTop: 12 }, style]}
    >
      {wait ? <ActivityIndicator size="small" color={color ?? k.fg} /> : icon ? <Icon name={icon} size={sm ? 15 : 17} color={color ?? k.fg} /> : null}
      <T b={600} size={sm ? 13 : 14} color={color ?? k.fg}>{label}</T>
    </Tap>
  )
}

export function IconBtn({ name, onPress, label, size = 40, on, color, bg, style }: {
  name: string; onPress?: () => void; label: string; size?: number; on?: boolean; color?: string; bg?: string; style?: Style
}) {
  const c = useColors()
  return (
    <Tap
      onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={[{
        width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: bg ?? (on ? c.accentSoft : c.surface), borderWidth: StyleSheet.hairlineWidth, borderColor: c.hair,
      }, style]}
    >
      <Icon name={name} size={Math.round(size / 2)} color={color ?? (on ? c.accentText : c.ink)} />
    </Tap>
  )
}

export type ChipKind = 'requested' | 'drafted' | 'verified' | 'approved' | 'overdue' | 'banned' | 'active' | 'gold' | 'silver' | 'normal' | 'rejected'
const chipColors = (c: Colors, k: string): { bg: string; fg: string; border?: string } => {
  switch (k) {
    case 'requested': return { bg: c.warnSoft, fg: c.warn }
    case 'drafted': return { bg: c.surface2, fg: c.muted }
    case 'verified': return { bg: c.accentSoft, fg: c.accentText }
    case 'approved': case 'active': return { bg: c.paidSoft, fg: c.paidText }
    case 'overdue': case 'banned': case 'rejected': return { bg: c.lateSoft, fg: c.late }
    case 'gold': return { bg: c.warnSoft, fg: c.gold }
    case 'silver': return { bg: c.silverChip, fg: c.silverChipInk }
    case 'normal': return { bg: 'transparent', fg: c.muted, border: c.divider }
    default: return { bg: c.surface2, fg: c.muted }
  }
}

export function Chip({ kind, label, icon, style }: { kind: ChipKind | string; label: string; icon?: string; style?: Style }) {
  const c = useColors()
  const k = chipColors(c, kind)
  return (
    <View style={[{
      flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99,
      backgroundColor: k.bg, alignSelf: 'flex-start', borderWidth: k.border ? 1 : 0, borderColor: k.border,
    }, style]}>
      {icon && <Icon name={icon} size={12} color={k.fg} />}
      <T b size={11.5} color={k.fg} numberOfLines={1}>{label}</T>
    </View>
  )
}

/** Round tinted icon (".tic"). */
export function Tic({ name, kind = 'in', size = 38 }: { name: string; kind?: 'in' | 'out' | 'add' | 'wd' | 'accent'; size?: number }) {
  const c = useColors()
  const k = kind === 'in' ? [c.paidSoft, c.paidText] : kind === 'out' ? [c.lateSoft, c.late] : kind === 'wd' ? [c.warnSoft, c.warn] : [c.accentSoft, c.accent]
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: k[0], alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={Math.round(size * 0.47)} color={k[1]} />
    </View>
  )
}

export function Switch({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const c = useColors()
  return (
    <Tap
      onPress={() => onChange(!value)} disabled={disabled} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label}
      style={{ width: 46, height: 28, borderRadius: 99, backgroundColor: value ? c.accent : c.remain, padding: 3, opacity: disabled ? 0.5 : 1 }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', transform: [{ translateX: value ? 18 : 0 }] }} />
    </Tap>
  )
}

/** Underlined tabs (".tabs"); scrolls sideways when they do not fit. */
export function Tabs<K extends string>({ items, value, onChange, style }: {
  items: { key: K; label: string; icon?: string; dot?: boolean }[]; value: K; onChange: (k: K) => void; style?: Style
}) {
  const c = useColors()
  return (
    <View style={[{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }, style]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 26 }}>
        {items.map((it) => {
          const on = it.key === value
          return (
            <Tap key={it.key} onPress={() => onChange(it.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ paddingTop: 12, paddingBottom: 9, borderBottomWidth: 3, borderBottomColor: on ? c.accent : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {it.icon && <Icon name={it.icon} size={15} color={on ? c.accentText : c.muted} />}
              <T b={on ? 700 : 500} size={15} color={on ? c.accentText : c.muted}>{it.label}</T>
              {it.dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.late }} />}
            </Tap>
          )
        })}
      </ScrollView>
    </View>
  )
}

/** Round filter pills (".pill"). */
export function Pills<K extends string>({ items, value, onChange }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  const c = useColors()
  return (
    <Row gap={6} wrap>
      {items.map((it) => {
        const on = it.key === value
        return (
          <Tap key={it.key} onPress={() => onChange(it.key)} accessibilityState={{ selected: on }}
            style={{ borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accent : c.surface }}>
            <T b={600} size={13} color={on ? c.accentInk : c.muted}>{it.label}</T>
          </Tap>
        )
      })}
    </Row>
  )
}

/** Progress bar (".pbar"). */
export function PBar({ p, color, height = 6 }: { p: number; color?: string; height?: number }) {
  const c = useColors()
  return (
    <View style={{ height, borderRadius: 99, backgroundColor: c.track, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, p))}%`, height: '100%', borderRadius: 99, backgroundColor: color ?? c.accent }} />
    </View>
  )
}

/** Dashed hint line (".note"). */
export const Note = ({ children }: { children: ReactNode }) => {
  const c = useColors()
  return (
    <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 14 }}>
      <T muted size={12} center>{children}</T>
    </View>
  )
}

/** Label above a value (".kv" grid cell). */
export function KV({ label, children, style }: { label: string; children: ReactNode; style?: Style }) {
  return (
    <View style={[{ gap: 3, minWidth: 0 }, style]}>
      <T v="eyebrow">{label}</T>
      {typeof children === 'string' || typeof children === 'number' ? <T>{children}</T> : children}
    </View>
  )
}

/** Two columns of key/value cells. */
export function KVGrid({ children, cols = 2 }: { children: ReactNode; cols?: number }) {
  const items = Children.toArray(children).filter(isValidElement)
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, columnGap: 16 }}>
      {items.map((el, i) => <View key={el.key ?? i} style={{ width: `${100 / cols - 4}%`, flexGrow: 1 }}>{el}</View>)}
    </View>
  )
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <View style={{ paddingVertical: 28, paddingHorizontal: 12 }}><T muted center>{children}</T></View>
)

export function Loading() {
  const c = useColors()
  return <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={c.accent} /></View>
}

/** A card with a heading that opens and closes (".card.sec" details on the web). */
export function Collapse({ title, children, open: initial = false, right }: { title: string; children: ReactNode; open?: boolean; right?: ReactNode }) {
  const c = useColors()
  const [open, setOpen] = useState(initial)
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 9, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hair, gap: 10 }}>
      <Tap onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T v="h2" size={17} style={{ flex: 1 }}>{title}</T>
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}><Icon name="chev" size={16} color={c.muted} /></View>
      </Tap>
      {open && right}
      {open && children}
    </View>
  )
}
