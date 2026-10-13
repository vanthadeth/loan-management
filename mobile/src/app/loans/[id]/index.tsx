import { useLocalSearchParams } from 'expo-router'
import { LoanDetail } from '../../../screens/LoanDetail'

export default function Loan() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <LoanDetail loanId={Number(id)} />
}
