import { Text, type TextProps, type TextStyle } from 'react-native'
import { font, useColors } from '../lib/theme'

type Variant = 'body' | 'h1' | 'h2' | 'h3' | 'small' | 'eyebrow' | 'big' | 'big2'
const SIZE: Record<Variant, TextStyle> = {
  body: { fontSize: 15, lineHeight: 21 },
  h1: { fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  h2: { fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  h3: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 12.5, lineHeight: 17 },
  eyebrow: { fontSize: 11, lineHeight: 15, letterSpacing: 1, textTransform: 'uppercase' },
  big: { fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  big2: { fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
}
const WEIGHT = { 400: font.regular, 500: font.medium, 600: font.semi, 700: font.bold }
const DEFAULT_WEIGHT: Record<Variant, 400 | 500 | 600 | 700> = { body: 400, h1: 700, h2: 700, h3: 700, small: 400, eyebrow: 700, big: 700, big2: 700 }

export interface TProps extends TextProps {
  v?: Variant
  /** font weight: true = 700 */
  b?: boolean | 400 | 500 | 600 | 700
  muted?: boolean
  color?: string
  num?: boolean
  center?: boolean
  right?: boolean
  /** one line with an ellipsis */
  ell?: boolean
  size?: number
}

/** Text in the app font; variants follow the web design system. */
export function T({ v = 'body', b, muted, color, num, center, right, ell, size, style, ...rest }: TProps) {
  const c = useColors()
  const weight = b === true ? 700 : b || DEFAULT_WEIGHT[v]
  return (
    <Text
      numberOfLines={ell ? 1 : rest.numberOfLines}
      {...rest}
      style={[
        SIZE[v],
        { fontFamily: WEIGHT[weight], color: color ?? (muted || v === 'eyebrow' ? c.muted : c.ink) },
        size ? { fontSize: size, lineHeight: Math.round(size * 1.35) } : null,
        num ? { fontVariant: ['tabular-nums'] } : null,
        center ? { textAlign: 'center' } : right ? { textAlign: 'right' } : null,
        style,
      ]}
    />
  )
}
