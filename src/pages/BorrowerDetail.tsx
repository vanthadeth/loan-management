import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { usePageTitle } from '../app/Layout'
import { useAuth } from '../app/auth'
import { useI18n } from '../app/i18n'
import { useBook } from '../data/book'
import { bname, useBorrowerActions, useBorrowerDocs } from '../data/borrowers'
import { errMsg, useLoans } from '../data/loans'
import { fmtD } from '../lib/format'
import type { Tier } from '../lib/types'
import { BorrowerSheet } from './borrowers/BorrowerSheet'
import { DocumentSheet } from './borrowers/DocumentSheet'
import { BorrowerChip } from './borrowers/parts'
import { FileView } from './loans/FileView'
import { LoanRow } from './loans/parts'

const TIERS: Tier[] = ['normal', 'silver', 'gold']

function Contact({ href, icon, label }: { href: string; icon: string; label: string }) {
  return <a className="mcta" href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}><Icon name={icon} size={17} /></a>
}

type Dialog = null | 'edit' | 'doc' | 'status' | { tier: Tier }

export function BorrowerDetail() {
  const borrowerId = Number(useParams().id)
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const { data, isLoading, error } = useBook()
  const { views } = useLoans()
  const docs = useBorrowerDocs(borrowerId)
  const actions = useBorrowerActions()
  const [dialog, setDialog] = useState<Dialog>(null)
  const b = data?.borrowers.find((x) => x.id === borrowerId)
  usePageTitle(b ? bname(b, lang) : 'Borrower')
  if (!b) return <p className="muted">{isLoading ? 'Loading…' : error ? errMsg(error) : 'Borrower not found.'}</p>

  const banned = b.status === 'banned'
  const loans = views.filter((v) => v.loan.borrower_id === b.id)
  const phone = b.phone.split(/[,;/]/)[0].replace(/\s/g, '')
  const hasPlace = b.lat != null && b.lng != null
  const run = (job: () => Promise<void>, done: string) => async () => {
    try {
      await job()
      toast(done)
      setDialog(null)
    } catch (e) {
      toast(errMsg(e))
    }
  }

  return (
    <>
      <section className="card" style={{ position: 'relative' }}>
        {can('borrowers.edit') && <button type="button" className="editfab" aria-label="Edit borrower" title="Edit borrower" onClick={() => setDialog('edit')}><Icon name="edit" size={18} /></button>}
        <div className="row phead" style={{ paddingRight: 52 }}>
          <span className="avatar xl"><Avatar p={{ full_name: b.name_km || b.name, display_name: '', photo_path: b.photo_path }} size="bare" /></span>
          <div className="grow">
            <h1>{bname(b, lang)}</h1>
            {b.name_km && b.name && <p className="muted" style={{ margin: '2px 0 0' }}>{b.name}</p>}
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              <BorrowerChip b={b} />
              {!banned && <span className={'chip ' + b.status}>{t(b.status)}</span>}
            </div>
          </div>
        </div>
        <details className="binfo">
          <summary><span>Information</span><Icon name="chev" size={16} /></summary>
          <div className="kv mob1" style={{ marginTop: 6 }}>
            <div style={{ gridColumn: '1/-1' }}><span className="eyebrow">ID card no.</span>{b.id_no || '—'}</div>
            <div><span className="eyebrow">Date of birth</span>{fmtD(b.dob)}</div>
            <div><span className="eyebrow">Gender</span>{b.gender ? <span className="gend"><Icon name={b.gender === 'F' ? 'venus' : 'mars'} size={17} />{b.gender === 'F' ? 'Female' : 'Male'}</span> : '—'}</div>
            <div style={{ gridColumn: '1/-1' }}>
              <span className="eyebrow">Contact numbers</span>
              <span className="vrow"><span>{b.phone || '—'}</span>{phone && <Contact href={'tel:' + phone} icon="phone" label="Call" />}</span>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <span className="eyebrow">Telegram</span>
              <span className="vrow"><span>{b.telegram || '—'}</span>{b.telegram && <Contact href={'https://t.me/' + b.telegram.replace('@', '')} icon="tg" label="Open Telegram" />}</span>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <span className="eyebrow">Facebook</span>
              <span className="vrow"><span>{b.facebook || '—'}</span>{b.facebook && <Contact href={'https://www.facebook.com/' + b.facebook} icon="fb" label="Open Facebook" />}</span>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <span className="eyebrow">Address</span>
              <span className="vrow">
                <span>{b.address || '—'}{hasPlace && <><br /><span className="small muted num">{b.lat}, {b.lng}</span></>}</span>
                {hasPlace && <Contact href={`https://www.google.com/maps?q=${b.lat},${b.lng}`} icon="pin" label="Open map" />}
              </span>
            </div>
          </div>
        </details>
        {can('borrowers.ban') && (
          <button type="button" className={'btn blockbtn ' + (banned ? 'primary' : 'danger')} onClick={() => setDialog('status')}>{banned ? 'Reactivate borrower' : 'Ban borrower'}</button>
        )}
      </section>

      <div className="grid g2">
        <details className="card sec">
          <summary><h2>Documents</h2><span className="chev" aria-hidden="true">▾</span></summary>
          {can('borrowers.edit') && <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn sm" onClick={() => setDialog('doc')}>+ Add document</button></div>}
          <div className="list" style={{ marginTop: 6 }}>
            {(docs.data ?? []).map((d) => (
              <div className="item" style={{ cursor: 'default' }} key={d.id}>
                <span className="avatar" style={{ borderRadius: 4 }}>▤</span>
                <span className="grow"><b className="ell" style={{ display: 'block' }}>{d.title}</b><span className="small muted">{d.note || 'No note'}</span></span>
                <FileView path={d.file_path} />
              </div>
            ))}
            {!docs.data?.length && <p className="muted">{docs.isLoading ? 'Loading…' : 'No documents yet.'}</p>}
          </div>
        </details>
        <section className={'card' + (banned ? ' locked' : '')}>
          <h2 className="row" style={{ gap: 8 }}>{banned && <Icon name="lock" size={18} />}Trust rating</h2>
          <p className="muted small" style={{ margin: '4px 0 10px' }}>{banned ? 'Locked while the borrower is banned.' : 'Set by staff. Normal → Silver (good customer) → Gold (trusted).'}</p>
          <div className="seg big">
            {TIERS.map((x) => (
              <button key={x} type="button" aria-pressed={b.tier === x} disabled={banned || !can('borrowers.ban')} onClick={() => x !== b.tier && setDialog({ tier: x })}>{t(x)}</button>
            ))}
          </div>
          <p style={{ margin: '10px 0 0' }}>“{b.note || 'No notes yet'}”</p>
        </section>
      </div>

      <div className="row between">
        <h2 style={{ marginTop: 4 }}>{t('loans')}</h2>
        {can('loans.create') && !banned && <button type="button" className="btn primary sm" onClick={() => nav(`/loans/new?borrower=${b.id}`)}>+ {t('newLoan')}</button>}
      </div>
      <div className="lcard">
        {loans.map((v) => <LoanRow key={v.loan.id} v={v} />)}
        {!loans.length && <p className="muted">No loans yet.</p>}
      </div>

      {dialog === 'edit' && <BorrowerSheet borrower={b} onClose={() => setDialog(null)} />}
      {dialog === 'doc' && <DocumentSheet borrowerId={b.id} onClose={() => setDialog(null)} />}
      {dialog === 'status' && (
        <Sheet
          title={banned ? 'Reactivate borrower?' : 'Ban borrower?'}
          onClose={() => setDialog(null)}
          action={{
            label: banned ? 'Confirm reactivate' : 'Confirm ban',
            cls: banned ? 'primary' : 'danger',
            onClick: run(() => actions.setStatus(b.id, banned ? 'active' : 'banned'), banned ? 'Borrower reactivated' : 'Borrower banned'),
          }}
        >
          <p style={{ margin: '0 0 6px' }}>{banned ? 'Reactivate' : 'Ban'} <b>{bname(b, lang)}</b>? {banned ? 'Their trust rating and new loan requests become available again.' : 'New loans cannot be requested and the trust rating is locked.'}</p>
        </Sheet>
      )}
      {typeof dialog === 'object' && dialog && (
        <Sheet title="Change trust rating?" onClose={() => setDialog(null)} action={{ label: 'Confirm change', onClick: run(() => actions.setTier(b.id, dialog.tier), 'Trust rating changed') }}>
          <p style={{ margin: '0 0 6px' }}>Change <b>{bname(b, lang)}</b> from <b>{t(b.tier)}</b> to <b>{t(dialog.tier)}</b>?</p>
        </Sheet>
      )}
    </>
  )
}
