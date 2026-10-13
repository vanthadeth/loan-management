// The phone's version of src/ui/Toast.tsx (metro.config.js swaps it in for the shared code).
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Animated, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { haptic, isProblem } from '../lib/haptics'
import { font, useColors } from '../lib/theme'

interface Item { id: number; m: string }
let items: Item[] = []
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function toast(m: string) {
  haptic(isProblem(m) ? 'error' : 'success')
  const id = Date.now() + Math.random()
  items = [...items, { id, m }]
  emit()
  setTimeout(() => { items = items.filter((x) => x.id !== id); emit() }, 2700)
}

export const useToast = () => useCallback((m: string) => toast(m), [])

/** Kept for the shared code's imports; toasts need no provider on the phone. */
export const ToastProvider = ({ children }: { children: ReactNode }) => <>{children}</>

/*
 * Modals draw above the app, so every open sheet draws its own toast layer; only the top one shows toasts.
 */
let depth = 0
const depthSubs = new Set<() => void>()
export function useOverlayDepth() {
  const [mine, setMine] = useState(-1)
  useEffect(() => {
    setMine(++depth)
    depthSubs.forEach((f) => f())
    return () => { depth--; depthSubs.forEach((f) => f()) }
  }, [])
  return mine
}

function Bubble({ m }: { m: string }) {
  const c = useColors()
  const a = useState(() => new Animated.Value(0))[0]
  useEffect(() => {
    Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(a, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start()
  }, [a])
  return (
    <Animated.Text
      accessibilityRole="alert"
      style={{
        opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
        backgroundColor: c.ink, color: c.bg, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 99, overflow: 'hidden',
        fontFamily: font.semi, fontSize: 13, maxWidth: 340, textAlign: 'center',
      }}
    >{m}</Animated.Text>
  )
}

/** Where toasts appear; `level` 0 is the app itself, sheets pass their overlay depth. */
export function ToastLayer({ level = 0, bottom = 104 }: { level?: number; bottom?: number }) {
  const list = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => items)
  const top = useSyncExternalStore((f) => { depthSubs.add(f); return () => { depthSubs.delete(f) } }, () => depth)
  const insets = useSafeAreaInsets()
  if (top !== level || !list.length) return null
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: bottom + insets.bottom, alignItems: 'center', gap: 6 }}>
      {list.map((x) => <Bubble key={x.id} m={x.m} />)}
    </View>
  )
}
