import { useLocalSearchParams } from 'expo-router'
import { ReportPage } from '../../screens/Reports'

export default function Report() {
  const { name } = useLocalSearchParams<{ name: string }>()
  return <ReportPage name={name ?? ''} />
}
