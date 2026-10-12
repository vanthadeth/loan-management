import { useEffect, useState } from 'react'
import { fileUrl } from '../data/core'
import { initials } from '../lib/format'
import type { Profile } from '../lib/types'

export function Avatar({ p, size = '' }: { p?: Pick<Profile, 'full_name' | 'display_name' | 'photo_path'> | null; size?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let on = true; fileUrl(p?.photo_path).then((u) => on && setUrl(u)); return () => { on = false } }, [p?.photo_path])
  const name = p ? p.display_name || p.full_name : ''
  if (size === 'bare') return <>{url ? <img src={url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : initials(name)}</>
  return url
    ? <span className={'avatar ' + size} style={{ backgroundImage: `url('${url}')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', color: 'transparent' }}>{initials(name)}</span>
    : <span className={'avatar ' + size}>{initials(name)}</span>
}
