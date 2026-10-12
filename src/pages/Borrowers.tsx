import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Fab } from '../ui/Controls'
import { useAuth } from '../app/auth'
import { useI18n } from '../app/i18n'
import { useBook } from '../data/book'
import { bname } from '../data/borrowers'
import { errMsg } from '../data/loans'
import { initials } from '../lib/format'
import { BorrowerSheet } from './borrowers/BorrowerSheet'
import { BorrowerChip, TierIcon } from './borrowers/parts'
import { SearchBar } from './loans/parts'

const FILTERS = ['all', 'gold', 'silver', 'normal', 'banned']

export function Borrowers() {
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const nav = useNavigate()
  const { data, isLoading, error } = useBook()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [adding, setAdding] = useState(false)
  const needle = q.trim().toLowerCase()
  const rows = (data?.borrowers ?? []).filter((b) =>
    (filter === 'all' || b.tier === filter || b.status === filter) &&
    (b.name + b.name_km + b.phone + b.id_no).toLowerCase().includes(needle))

  return (
    <>
      <SearchBar value={q} onChange={setQ} />
      <div className="tabs">
        {FILTERS.map((f) => (
          <button key={f} type="button" className="tab" aria-pressed={filter === f} onClick={() => setFilter(f)}><TierIcon kind={f} size={16} />{t(f)}</button>
        ))}
      </div>
      {error && <p className="muted">{errMsg(error)}</p>}
      <div className="eyebrow">{rows.length} {t('borrowers')}</div>
      <div className="lcard">
        {rows.map((b) => (
          <button key={b.id} type="button" className={'item' + (b.status === 'banned' ? ' is-banned' : '')} onClick={() => nav(`/borrowers/${b.id}`)}>
            <span className="avatar">{initials(bname(b))}</span>
            <span className="grow">
              <b className="ell" style={{ display: 'block' }}>{bname(b, lang)}</b>
              <span className="small muted">{[b.phone, b.address.split(',').pop()?.trim()].filter(Boolean).join(' · ')}</span>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}><BorrowerChip b={b} /></span>
          </button>
        ))}
        {!rows.length && <p className="muted">{isLoading ? 'Loading…' : 'No match.'}</p>}
      </div>
      {can('borrowers.edit') && <Fab label={t('newBorrower')} onClick={() => setAdding(true)} />}
      {adding && <BorrowerSheet onClose={() => setAdding(false)} />}
    </>
  )
}
