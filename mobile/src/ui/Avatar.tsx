import { useEffect, useState } from 'react'
import { Image, View, type ViewStyle } from 'react-native'
import { fileUrl } from '@shared/data/core'
import { initials } from '@shared/lib/format'
import type { Profile } from '@shared/lib/types'
import { useColors } from '../lib/theme'
import { T } from './Text'

/** Signed URL of a private file, refreshed when the path changes. */
export function useSignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let on = true
    fileUrl(path).then((u) => on && setUrl(u))
    return () => { on = false }
  }, [path])
  return url
}

const SIZES = { sm: 40, md: 42, lg: 72, xl: 96 }

export function Avatar({ p, size = 'md', square, style }: {
  p?: Pick<Profile, 'full_name' | 'display_name' | 'photo_path'> | null; size?: keyof typeof SIZES | number; square?: boolean; style?: ViewStyle
}) {
  const c = useColors()
  const url = useSignedUrl(p?.photo_path)
  const px = typeof size === 'number' ? size : SIZES[size]
  const radius = square ? 6 : px / 2
  const name = p ? p.display_name || p.full_name : ''
  return (
    <View style={[{ width: px, height: px, borderRadius: radius, backgroundColor: c.track, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      {url
        ? <Image source={{ uri: url }} style={{ width: px, height: px }} />
        : <T b size={Math.round(px * 0.34)}>{initials(name)}</T>}
    </View>
  )
}

/** Initials avatar for someone without a profile (e.g. a borrower), optionally with a photo path. */
export function Initials({ name, photo, size = 42 }: { name: string; photo?: string | null; size?: number }) {
  return <Avatar p={{ full_name: name, display_name: '', photo_path: photo ?? null }} size={size} />
}
