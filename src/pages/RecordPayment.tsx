import { useAuth } from '../app/auth'
import { usePageTitle } from '../app/Layout'
import { PayWizard } from './money/PayWizard'

export function RecordPayment() {
  const { can } = useAuth()
  usePageTitle('Record payment')
  if (!can('payments.record')) return <p className="muted">You do not have permission to record payments.</p>
  return <PayWizard />
}
