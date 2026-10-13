import { useEffect, useState, type ReactNode } from 'react'
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useI18n } from '../lib/i18n'
import { useColors } from '../lib/theme'
import { Btn, IconBtn, Row } from './core'
import { T } from './Text'
import { ToastLayer, useOverlayDepth } from './Toast'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  /** Footer action; omit for a sheet without a footer. */
  action?: { label?: string; onClick: () => void | Promise<void>; kind?: 'primary' | 'danger'; disabled?: boolean }
}

/** Bottom sheet that slides up over a dimmed page and animates out before it unmounts. */
export function Sheet({ title, onClose, children, action }: Props) {
  const { t } = useI18n()
  const c = useColors()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const level = useOverlayDepth()
  const a = useState(() => new Animated.Value(0))[0]
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [a])
  const close = () => {
    Animated.timing(a, { toValue: 0, duration: 170, useNativeDriver: true }).start(() => onClose())
  }
  const run = async () => {
    if (!action || busy) return
    setBusy(true)
    try { await action.onClick() } finally { setBusy(false) }
  }
  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.backdrop, opacity: a }]}>
          <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={{
            backgroundColor: c.surface, borderTopLeftRadius: 13, borderTopRightRadius: 13, maxHeight: height * 0.92,
            transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }], opacity: a,
          }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 99, backgroundColor: c.line, alignSelf: 'center', marginTop: 8 }} />
          <Row between style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 }}>
            <T v="h2" style={{ flex: 1 }}>{title}</T>
            <IconBtn name="x" label="Close" size={36} onPress={close} />
          </Row>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingTop: 6, gap: 12, paddingBottom: action ? 16 : 16 + insets.bottom }}>
            {children}
          </ScrollView>
          {action && (
            <Row style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 + insets.bottom, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hair }}>
              <Btn label={t('cancel')} onPress={close} disabled={busy} style={{ flex: 1 }} />
              <Btn label={action.label ?? t('save')} kind={action.kind ?? 'primary'} onPress={run} busy={busy} disabled={action.disabled} style={{ flex: 1 }} />
            </Row>
          )}
        </Animated.View>
        <ToastLayer level={level} bottom={Platform.OS === 'ios' ? 120 : 110} />
      </KeyboardAvoidingView>
    </Modal>
  )
}
