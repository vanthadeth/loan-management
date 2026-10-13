import { useLocalSearchParams } from 'expo-router'
import { LoanQueue } from '../../../screens/Loans'

export default function Queue() {
  const { kind } = useLocalSearchParams<{ kind: string }>()
  return <LoanQueue kind={kind ?? ''} />
}
