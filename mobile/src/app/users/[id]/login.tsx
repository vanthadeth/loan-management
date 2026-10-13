import { useLocalSearchParams } from 'expo-router'
import { LoginInfo } from '../../../screens/LoginInfo'

export default function Login() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <LoginInfo id={id ?? ''} />
}
