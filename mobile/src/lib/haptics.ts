// Touch feedback: the phone's version of src/lib/feel.ts.
import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'
import { prefs } from './device'

const KEY = 'komjei-haptics'
export type Haptic = 'light' | 'medium' | 'success' | 'error'

export const hapticsOn = () => prefs.get(KEY) !== 'off'
export function setHaptics(on: boolean) {
  prefs.set(KEY, on ? 'on' : 'off')
  if (on) haptic('success')
}

export function haptic(kind: Haptic = 'light') {
  if (!hapticsOn() || Platform.OS === 'web') return
  const run = kind === 'light' ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    : kind === 'medium' ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    : Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error)
  run.catch(() => {})
}

export { isProblem } from '@shared/lib/feel'
