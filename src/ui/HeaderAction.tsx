import { createPortal } from 'react-dom'
import { useActionSlot } from '../app/Layout'
import { Icon } from './Icon'

/** The page's main "add" action, placed in the top bar so it never covers the list. */
export function HeaderAction({ label, onClick, icon = 'plus' }: { label: string; onClick: () => void; icon?: string }) {
  const slot = useActionSlot()
  if (!slot) return null
  return createPortal(
    <button type="button" className="icon-btn hdr-add" aria-label={label} title={label} onClick={onClick}><Icon name={icon} size={20} /></button>,
    slot,
  )
}
