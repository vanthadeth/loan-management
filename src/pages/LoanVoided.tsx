import { usePageTitle } from '../app/Layout'
import { useLoans } from '../data/loans'
import { LoanRow } from './loans/parts'

/** Voided loans, newest first: visible only to people who may void loans. */
export function LoanVoided() {
  usePageTitle('Voided loans')
  const { voidedViews, loading } = useLoans()
  return (
    <>
      <p className="muted small" style={{ margin: 0 }}>These loans are hidden from everyone else and left out of every total. Open one to see why it was voided or to restore it.</p>
      <div className="lcard">
        {voidedViews.map((v) => (
          <div key={v.loan.id}>
            <LoanRow v={v} />
            {v.loan.void_reason && <p className="small muted" style={{ margin: '0 14px 10px' }}>Reason: {v.loan.void_reason}</p>}
          </div>
        ))}
        {!voidedViews.length && <p className="muted">{loading ? 'Loading…' : 'No voided loans.'}</p>}
      </div>
    </>
  )
}
