import { memo } from 'react'
import { SvgXml } from 'react-native-svg'
import { IC } from '@shared/ui/iconPaths'
import { useColors } from '../lib/theme'

/** Svg markup for 24×24 stroke icon paths from the web app, with CSS colours resolved. */
export function svgOf(paths: string, color: string, surface: string, strokeWidth = 1.8) {
  const body = paths.replace(/currentColor/g, color).replace(/var\(--surface\)/g, surface)
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
}

export const Icon = memo(function Icon({ name, size = 20, color }: { name: string; size?: number; color?: string }) {
  const c = useColors()
  const paths = IC[name]
  if (!paths) return null
  return <SvgXml xml={svgOf(paths, color ?? c.ink, c.surface)} width={size} height={size} />
})

/** Icon from raw path markup (the bottom navigation's outline / filled icons). */
export const PathIcon = memo(function PathIcon({ paths, size = 23, color }: { paths: string; size?: number; color: string }) {
  const c = useColors()
  return <SvgXml xml={svgOf(paths, color, c.surface)} width={size} height={size} />
})
