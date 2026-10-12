import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useColors } from '../lib/theme'
import { Btn, Row } from './core'
import { T } from './Text'

/** Step header, progress and the Back / Next bar of a multi-step form (".wz"). */
export function Wizard({ steps, at, children, back, next, backLabel, nextLabel, scrollRef }: {
  steps: string[]; at: number; children: ReactNode; back: () => void; next: () => void; backLabel: string; nextLabel: string
  scrollRef?: React.Ref<ScrollView>
}) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, gap: 8, paddingBottom: 6 }}>
        <Row between style={{ alignItems: 'baseline' }}>
          <T b size={13} muted style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>Step {at + 1} of {steps.length}</T>
          <T b={600}>{steps[at]}</T>
        </Row>
        <Row gap={6}>{steps.map((s, i) => <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= at ? c.accent : c.line }} />)}</Row>
      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        {children}
      </ScrollView>
      <Row style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 + insets.bottom, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hair, backgroundColor: c.surface }}>
        <Btn label={backLabel} onPress={back} style={{ flex: 1 }} />
        <Btn kind="primary" label={nextLabel} onPress={next} style={{ flex: 1 }} />
      </Row>
    </View>
  )
}

/** Title and hint at the top of a wizard step. */
export const StepHead = ({ title, hint }: { title: string; hint?: ReactNode }) => (
  <View style={{ gap: 4 }}>
    <T v="h2" size={20}>{title}</T>
    {hint ? (typeof hint === 'string' ? <T v="small" muted>{hint}</T> : hint) : null}
  </View>
)
