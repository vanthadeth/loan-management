import { useAuth } from '@shared/app/auth'
import { Screen } from '../../ui/Screen'
import { T } from '../../ui/Text'
import { PayWizard } from '../../screens/money/PayWizard'

export default function RecordPayment() {
  const { can } = useAuth()
  return (
    <Screen title="Record payment" scroll={!can('payments.record')}>
      {can('payments.record') ? <PayWizard /> : <T muted>You do not have permission to record payments.</T>}
    </Screen>
  )
}
