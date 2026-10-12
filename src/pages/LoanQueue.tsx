import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Fab } from '../ui/Controls'
import { usePageTitle } from '../app/Layout'
import { useAuth } from '../app/auth'
import { useI18n } from '../app/i18n'
import { useLoans } from '../data/loans'
import type { LoanStatus } from '../lib/types'
import { LoanRow } from './loans/parts'

const QUEUES: Record<string, { title: string; status: LoanStatus; hint: string }> = {
  requested: { title: 'Requested loans', status: 'requested', hint: 'Waiting to be verified' },
  pending: { title: 'Pending approval', status: 'verified', hint: 'Verified, waiting for approval' },
}

export function LoanQueue() {
  const { kind = '' } = useParams()
  const { t } = useI18n()
  const { can } = useAuth()
  const nav = useNavigate()
  const { views, loading, error } = useLoans()
  const queue = QUEUES[kind]
  usePageTitle(queue?.title ?? null)
  if (!queue) return <Navigate to="/loans" replace />
  const rows = views.filter((v) => v.loan.status === queue.status)
  return (
    <>
      <p className="muted small" style={{ margin: 0 }}>{queue.hint}.</p>
      {error && <p className="muted">{error}</p>}
      <div className="lcard">
        {rows.map((v) => <LoanRow key={v.loan.id} v={v} />)}
        {!rows.length && <p className="muted">{loading ? 'Loading…' : 'Nothing here right now.'}</p>}
      </div>
      {can('loans.create') && <Fab label={t('newLoan')} onClick={() => nav('/loans/new')} />}
    </>
  )
}
