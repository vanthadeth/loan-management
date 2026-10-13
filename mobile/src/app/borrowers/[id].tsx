import { useLocalSearchParams } from 'expo-router'
import { BorrowerDetail } from '../../screens/Borrowers'

export default function Borrower() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <BorrowerDetail borrowerId={Number(id)} />
}
