import { useEffect, useState } from 'react'
import { Animated, Easing, Image, Platform, Text, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import type { Profile } from '@shared/lib/types'
import { useColors } from '../../lib/theme'
import { useSignedUrl } from '../../ui/Avatar'
import { T } from '../../ui/Text'

const WHEEL = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const randomChar = () => WHEEL[Crypto.getRandomBytes(1)[0] % WHEEL.length]
const H = 44
const MONO = { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 30, fontWeight: '600' as const, lineHeight: H }

/** One character rolling like an odometer wheel and settling on its final value. */
function Wheel({ ch, i, color }: { ch: string; i: number; color: string }) {
  const n = ch === '-' ? 0 : 9 + ((i * 3) % 5)
  const [spin] = useState(() => [...Array.from({ length: n }, randomChar), ch])
  const y = useState(() => new Animated.Value(0))[0]
  useEffect(() => {
    if (!n) return
    Animated.timing(y, { toValue: -n * H, duration: 700 + i * 80, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start()
  }, [y, n, i])
  return (
    <View style={{ height: H, overflow: 'hidden', width: 21, alignItems: 'center' }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {spin.map((x, k) => <Text key={k} style={[MONO, { color, textAlign: 'center' }]}>{x}</Text>)}
      </Animated.View>
    </View>
  )
}

/**
 * Shows a temporary password. Every character rolls and settles on its final value. The text cannot be
 * selected; use the copy button. Mount with key={text} so a new password rolls again.
 */
export function PasswordBox({ text }: { text: string }) {
  const c = useColors()
  return (
    <View accessible accessibilityLabel={text} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center' }}>
      {[...text].map((ch, i) => <Wheel key={i} ch={ch} i={i} color={c.ink} />)}
    </View>
  )
}

/** Square profile photo tile (initials until a picture is set). */
export function PhotoTile({ p, initials }: { p: Pick<Profile, 'photo_path'>; initials: string }) {
  const c = useColors()
  const url = useSignedUrl(p.photo_path)
  return (
    <View style={{ width: '100%', aspectRatio: 1, borderRadius: 6, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} /> : <T b={600} size={28} muted>{initials}</T>}
    </View>
  )
}
