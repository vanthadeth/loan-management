import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../app/i18n'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  /** Footer action; omit for a sheet without a footer. */
  action?: { label?: string; onClick: () => void | Promise<void>; cls?: string; disabled?: boolean }
}

/** Bottom sheet / dialog that animates out before it unmounts. */
export function Sheet({ title, onClose, children, action }: Props) {
  const { t } = useI18n()
  const [closing, setClosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const close = () => {
    setClosing(true)
    setTimeout(onClose, 170)
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  })
  const run = async () => {
    if (!action || busy) return
    setBusy(true)
    try { await action.onClick() } finally { setBusy(false) }
  }
  return createPortal(
    <div className={'sheet-bg' + (closing ? ' closing' : '')} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={'sheet' + (closing ? ' closing' : '')} role="dialog" aria-label={title}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">✕</button>
        </div>
        {children}
        {action && (
          <div className="row sheetbar">
            <button className="btn" onClick={close}>{t('cancel')}</button>
            <button className={'btn ' + (action.cls ?? 'primary')} disabled={busy || action.disabled} onClick={run}>
              {action.label ?? t('save')}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Small confirm dialog: "Are you sure?" with a custom confirm label. */
export function Confirm({ title, children, label, cls, onConfirm, onClose }: {
  title: string; children: ReactNode; label: string; cls?: string; onConfirm: () => void | Promise<void>; onClose: () => void
}) {
  return (
    <Sheet title={title} onClose={onClose} action={{ label, cls, onClick: async () => { await onConfirm(); onClose() } }}>
      {children}
    </Sheet>
  )
}
