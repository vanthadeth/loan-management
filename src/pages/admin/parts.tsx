import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../ui/Icon'
import { fileUrl } from '../../data/core'
import { STATUS_LABEL } from '../../data/admin'
import type { Profile, Role } from '../../lib/types'

export function RoleChip({ role }: { role?: Role | null }) {
  if (!role) return <span className="chip requested">No role</span>
  return (
    <span className={'chip ' + (role.locked ? 'approved' : 'verified')}>
      {role.locked && <Icon name="lock" size={13} />}{role.name}
    </span>
  )
}

export function StatusChip({ status }: { status: Profile['status'] }) {
  if (status === 'suspended') return <span className="chip requested">{STATUS_LABEL[status]}</span>
  if (status === 'discharged') return <span className="chip banned"><Icon name="ban" size={12} />{STATUS_LABEL[status]}</span>
  return <span className="chip active">{STATUS_LABEL[status]}</span>
}

const WHEEL = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const randomChar = () => WHEEL[crypto.getRandomValues(new Uint32Array(1))[0] % WHEEL.length]

/**
 * Shows a temporary password. Every character rolls like an odometer wheel and settles
 * on its final value. The box cannot be selected or dragged; use the copy button.
 * Mount with key={text} so a new password rolls again.
 */
export function PasswordBox({ text }: { text: string }) {
  const calm = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const wheels = useMemo(() => [...text].map((ch, i) => {
    if (ch === '-') return { ch, spin: [ch], n: 0, i }
    const n = calm ? 0 : 9 + ((i * 3) % 5)
    return { ch, spin: [...Array.from({ length: n }, randomChar), ch], n, i }
  }), [text, calm])
  const [rolled, setRolled] = useState(false)
  useEffect(() => {
    let b = 0
    const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setRolled(true)) })
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b) }
  }, [])
  return (
    <span className="pwbox" role="img" aria-label={text} onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
      {wheels.map((w) => (
        <span className="pw-w" aria-hidden="true" key={w.i}>
          <span className="pw-c" style={w.n && rolled
            ? { transition: `transform ${700 + w.i * 80}ms cubic-bezier(.2,.8,.2,1)`, transform: `translateY(-${w.n * 1.3}em)` }
            : undefined}>
            {w.spin.map((c, k) => <span className="pw-h" key={k}>{c}</span>)}
          </span>
        </span>
      ))}
    </span>
  )
}

/** Square profile photo tile (initials until a picture is set). */
export function PhotoTile({ p, initials }: { p: Pick<Profile, 'photo_path'>; initials: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let on = true; fileUrl(p.photo_path).then((u) => on && setUrl(u)); return () => { on = false } }, [p.photo_path])
  return url
    ? <span className="uph" style={{ backgroundImage: `url('${url}')`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' }}>{initials}</span>
    : <span className="uph">{initials}</span>
}
