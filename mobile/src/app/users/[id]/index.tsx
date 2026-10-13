import { useLocalSearchParams } from 'expo-router'
import { UserDetail } from '../../../screens/UserDetail'

export default function User() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <UserDetail id={id ?? ''} />
}
