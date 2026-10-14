import { useRef, useState } from 'react'
import { Floating } from './Controls'
import { Icon } from './Icon'

export interface MenuAction { key: string; label: string; icon: string; onClick: () => void; danger?: boolean }

/** A "⋯" button that opens a menu of actions under it (top right of a card). Danger actions are listed last, after a line. */
export function ActionMenu({ actions, label = 'Actions' }: { actions: MenuAction[]; label?: string }) {
  const btn = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  if (!actions.length) return null
  const normal = actions.filter((a) => !a.danger)
  const danger = actions.filter((a) => a.danger)
  const item = (a: MenuAction) => (
    <button type="button" key={a.key} role="menuitem" className={'mi' + (a.danger ? ' danger' : '')} onClick={() => { setOpen(false); a.onClick() }}>
      <span className="grow"><Icon name={a.icon} size={18} /><span>{a.label}</span></span>
    </button>
  )
  return (
    <>
      <button ref={btn} type="button" className="icon-btn" style={{ width: 40, height: 40 }} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" size={20} />
      </button>
      {open && (
        <Floating anchor={btn} onClose={() => setOpen(false)} align="right">
          <div role="menu" aria-label={label} className="dd-list amenu" style={{ padding: 6, marginTop: 0 }}>
            {normal.map(item)}
            {normal.length > 0 && danger.length > 0 && <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '4px 0', width: '100%' }} />}
            {danger.map(item)}
          </div>
        </Floating>
      )}
    </>
  )
}
