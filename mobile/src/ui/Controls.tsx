import { useState, type ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View, type KeyboardTypeOptions, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fmtD } from '@shared/lib/format'
import { todayIso } from '@shared/lib/calc'
import { useI18n } from '../lib/i18n'
import { font, useColors } from '../lib/theme'
import { Btn, IconBtn, Row, Tap } from './core'
import { Icon } from './Icon'
import { T } from './Text'
import { ToastLayer, useOverlayDepth } from './Toast'

type Style = StyleProp<ViewStyle>
const MODES: Record<string, KeyboardTypeOptions> = { numeric: 'number-pad', decimal: 'decimal-pad', tel: 'phone-pad', text: 'default', email: 'email-address' }

export const Label = ({ children }: { children: ReactNode }) => <T b={600} size={12} muted>{children}</T>

export function Field({ label, value, onChange, placeholder, inputMode, disabled, secure, autoFocus, style, children, onSubmit, autoCapitalize }: {
  label?: string; value: string; onChange?: (v: string) => void; placeholder?: string; inputMode?: 'numeric' | 'decimal' | 'text' | 'tel' | 'email'
  disabled?: boolean; secure?: boolean; autoFocus?: boolean; style?: Style; children?: ReactNode; onSubmit?: () => void
  autoCapitalize?: 'none' | 'sentences' | 'words'
}) {
  const c = useColors()
  const [focus, setFocus] = useState(false)
  return (
    <View style={[{ gap: 4, minWidth: 0 }, style]}>
      {label && <Label>{label}</Label>}
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.muted} editable={!disabled}
        keyboardType={MODES[inputMode ?? 'text']} secureTextEntry={secure} autoFocus={autoFocus} autoCorrect={false}
        autoCapitalize={autoCapitalize ?? (secure ? 'none' : 'sentences')} accessibilityLabel={label}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onSubmitEditing={onSubmit}
        style={{
          minHeight: 46, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: focus ? c.accent : 'transparent',
          backgroundColor: focus ? c.surface : c.surface2, color: c.ink, fontFamily: font.regular, fontSize: 15, opacity: disabled ? 0.6 : 1,
        }}
      />
      {children}
    </View>
  )
}

export function TextArea({ label, value, onChange, placeholder, style }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string; style?: Style }) {
  const c = useColors()
  const [focus, setFocus] = useState(false)
  return (
    <View style={[{ gap: 4 }, style]}>
      {label && <Label>{label}</Label>}
      <TextInput
        multiline value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.muted} accessibilityLabel={label}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} textAlignVertical="top"
        style={{
          minHeight: 88, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: focus ? c.accent : 'transparent',
          backgroundColor: focus ? c.surface : c.surface2, color: c.ink, fontFamily: font.regular, fontSize: 15,
        }}
      />
    </View>
  )
}

export type Opt = string | { value: string; label: string }
export const optVal = (o: Opt) => (typeof o === 'string' ? o : o.value)
export const optLab = (o: Opt) => (typeof o === 'string' ? o : o.label)

/** Segmented control (".seg"); `onHero` draws it on the dark hero card. */
export function Seg({ label, options, value, onChange, style, big, onHero, compact }: {
  label?: string; options: Opt[]; value: string; onChange: (v: string) => void; style?: Style; big?: boolean; onHero?: boolean; compact?: boolean
}) {
  const c = useColors()
  return (
    <View style={[{ gap: 4 }, style]}>
      {label && <Label>{label}</Label>}
      <View style={{
        flexDirection: 'row', flexWrap: 'wrap', padding: 3, borderRadius: 99, alignSelf: compact ? 'flex-start' : 'stretch',
        backgroundColor: onHero ? 'rgba(255,255,255,0.2)' : c.surface2, borderWidth: onHero ? 0 : 1, borderColor: c.line,
        minHeight: compact ? undefined : big ? 54 : 46,
      }}>
        {options.map((o) => {
          const on = optVal(o) === value
          const bg = on ? (onHero ? '#F5F7FA' : c.accent) : 'transparent'
          const fg = on ? (onHero ? '#434A54' : c.accentInk) : (onHero ? '#F5F7FA' : c.muted)
          return (
            <Tap key={optVal(o)} onPress={() => onChange(optVal(o))} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ flexGrow: compact ? 0 : 1, flexBasis: compact ? undefined : 0, minWidth: compact ? undefined : 70, borderRadius: 99, backgroundColor: bg, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' }}>
              <T b={600} size={big ? 15 : 13} color={fg} numberOfLines={1}>{optLab(o)}</T>
            </Tap>
          )
        })}
      </View>
    </View>
  )
}

/** Centred popup on a dimmed page; taps outside close it. */
export function Popup({ onClose, children, title }: { onClose: () => void; children: ReactNode; title?: string }) {
  const c = useColors()
  const level = useOverlayDepth()
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.backdrop }]} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 10, maxHeight: '80%', alignSelf: 'center', width: '100%', maxWidth: 380 }}>
          {title && <T v="h3" style={{ padding: 8, paddingBottom: 6 }}>{title}</T>}
          {children}
        </View>
        <ToastLayer level={level} />
      </View>
    </Modal>
  )
}

function SelectButton({ text, placeholder, onPress, icon = 'chev-down', open }: { text?: string; placeholder: string; onPress: () => void; icon?: string; open?: boolean }) {
  const c = useColors()
  return (
    <Tap onPress={onPress} accessibilityRole="button"
      style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 6, backgroundColor: c.surface2, borderWidth: 1, borderColor: open ? c.accent : 'transparent' }}>
      <T style={{ flex: 1 }} ell muted={!text}>{text || placeholder}</T>
      {icon === 'chev-down' ? <View style={{ transform: [{ rotate: '90deg' }] }}><Icon name="chev" size={16} color={c.muted} /></View> : <Icon name={icon} size={16} color={c.muted} />}
    </Tap>
  )
}

export function OptionList({ options, value, onPick }: { options: Opt[]; value: string; onPick: (v: string) => void }) {
  const c = useColors()
  return (
    <ScrollView style={{ flexGrow: 0 }}>
      {options.map((o, i) => {
        const on = optVal(o) === value
        return (
          <Tap key={optVal(o)} onPress={() => onPick(optVal(o))} accessibilityRole="menuitem" accessibilityState={{ selected: on }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 6, backgroundColor: on ? c.accentSoft : 'transparent', borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.hair }}>
            <T style={{ flex: 1 }} b={on ? 600 : 400}>{optLab(o)}</T>
            {on && <Icon name="check" size={18} color={c.accent} />}
          </Tap>
        )
      })}
    </ScrollView>
  )
}

export function Dropdown({ label, options, value, onChange, style, placeholder }: {
  label?: string; options: Opt[]; value: string; onChange: (v: string) => void; style?: Style; placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const cur = options.find((o) => optVal(o) === value)
  return (
    <View style={[{ gap: 4, minWidth: 0 }, style]}>
      {label && <Label>{label}</Label>}
      <SelectButton text={cur ? optLab(cur) : ''} placeholder={placeholder ?? 'Select'} onPress={() => setOpen(true)} open={open} />
      {open && (
        <Popup onClose={() => setOpen(false)} title={label}>
          <OptionList options={options} value={value} onPick={(v) => { onChange(v); setOpen(false) }} />
        </Popup>
      )}
    </View>
  )
}

/** Segmented control for short lists, dropdown for longer ones. */
export function Choice(p: { label?: string; options: Opt[]; value: string; onChange: (v: string) => void; style?: Style }) {
  const short = p.options.length <= 4 && Math.max(...p.options.map((o) => optLab(o).length)) <= 13
  return short ? <Seg {...p} /> : <Dropdown {...p} />
}

const pad = (n: number) => String(n).padStart(2, '0')
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function Calendar({ value, onPick }: { value: string; onPick: (iso: string) => void }) {
  const c = useColors()
  const base = value || todayIso()
  const [ym, setYm] = useState<[number, number]>([+base.slice(0, 4), +base.slice(5, 7) - 1])
  const [y, m] = ym
  const off = (new Date(y, m, 1).getDay() + 6) % 7
  const n = new Date(y, m + 1, 0).getDate()
  const today = todayIso()
  const go = (d: number) => { const x = new Date(y, m + d, 1); setYm([x.getFullYear(), x.getMonth()]) }
  const navBtn = (d: number, l: string, a: string) => (
    <Tap onPress={() => go(d)} accessibilityLabel={a} style={{ width: 34, height: 34, borderRadius: 4, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <T b size={16}>{l}</T>
    </Tap>
  )
  const cells: (number | null)[] = [...Array.from({ length: off }, () => null), ...Array.from({ length: n }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  return (
    <View style={{ padding: 4, gap: 6 }}>
      <Row gap={4}>
        {navBtn(-12, '«', 'Previous year')}{navBtn(-1, '‹', 'Previous month')}
        <T b center style={{ flex: 1 }}>{MONTHS[m]} {y}</T>
        {navBtn(1, '›', 'Next month')}{navBtn(12, '»', 'Next year')}
      </Row>
      <View style={{ flexDirection: 'row' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <T key={i} b={600} size={11.5} muted center style={{ flex: 1, paddingVertical: 4 }}>{d}</T>)}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, w) => (
        <View key={w} style={{ flexDirection: 'row', gap: 2 }}>
          {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
            if (!d) return <View key={i} style={{ flex: 1, height: 38 }} />
            const v = `${y}-${pad(m + 1)}-${pad(d)}`
            const sel = v === value
            return (
              <Tap key={i} onPress={() => onPick(v)} accessibilityLabel={fmtD(v)}
                style={{ flex: 1, height: 38, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? c.accent : 'transparent', borderWidth: v === today && !sel ? 1 : 0, borderColor: c.accent }}>
                <T num b={sel ? 700 : 400} color={sel ? c.accentInk : c.ink}>{d}</T>
              </Tap>
            )
          })}
        </View>
      ))}
    </View>
  )
}

export function DateField({ label, value, onChange, style, allowClear }: { label?: string; value: string; onChange: (iso: string) => void; style?: Style; allowClear?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <View style={[{ gap: 4, minWidth: 0 }, style]}>
      {label && <Label>{label}</Label>}
      <SelectButton text={value ? fmtD(value) : ''} placeholder="Select date" icon="cal" onPress={() => setOpen(true)} open={open} />
      {open && (
        <Popup onClose={() => setOpen(false)}>
          <Calendar value={value} onPick={(v) => { onChange(v); setOpen(false) }} />
          {allowClear && !!value && <Btn sm label="Clear" onPress={() => { onChange(''); setOpen(false) }} style={{ marginTop: 8, alignSelf: 'flex-start' }} />}
        </Popup>
      )}
    </View>
  )
}

/** Icon-only date picker used next to search bars. */
export function DateIconPicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <IconBtn name="cal" label="Pick a date" on={!!value} onPress={() => setOpen(true)} />
      {open && (
        <Popup onClose={() => setOpen(false)}>
          <Calendar value={value} onPick={(v) => { onChange(v); setOpen(false) }} />
        </Popup>
      )}
    </>
  )
}

/** Round search field with the blue search button (".search" + ".srch"). */
export function SearchBar({ value, onChange, right }: { value: string; onChange: (v: string) => void; right?: ReactNode }) {
  const c = useColors()
  const { t } = useI18n()
  return (
    <Row>
      <TextInput
        value={value} onChangeText={onChange} placeholder={t('search')} placeholderTextColor={c.muted} accessibilityLabel="Search"
        autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing"
        style={{ flex: 1, minWidth: 0, minHeight: 44, borderRadius: 99, paddingHorizontal: 18, backgroundColor: c.surface, color: c.ink, fontFamily: font.regular, fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hair }}
      />
      <IconBtn name="search" label="Search" bg={c.accent} color={c.accentInk} />
      {right}
    </Row>
  )
}

export function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={{ position: 'absolute', right: 16, bottom: 16 + (insets.bottom ? 0 : 0), width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#4A89DC', shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}>
      <Icon name="plus" size={26} color={c.accentInk} />
    </Tap>
  )
}
