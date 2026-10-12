import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import * as SystemUI from 'expo-system-ui'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { AppState } from 'react-native'
import { useFonts, GoogleSans_400Regular, GoogleSans_500Medium, GoogleSans_600SemiBold, GoogleSans_700Bold } from '@expo-google-fonts/google-sans'
import { AuthProvider, useAuth } from '@shared/app/auth'
import { loadPrefs } from '../lib/device'
import { I18nProvider } from '../lib/i18n'
import { ThemeProvider, useTheme } from '../lib/theme'
import { Blocked, NewPassword, SignIn } from '../screens/SignIn'

SplashScreen.preventAutoHideAsync().catch(() => {})

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } })
// refetch when the app comes back to the foreground, like refetchOnWindowFocus on the web
AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'))

function Gate() {
  const { loading, session, me } = useAuth()
  const { c, dark } = useTheme()
  useEffect(() => { SystemUI.setBackgroundColorAsync(c.bg).catch(() => {}) }, [c.bg])
  useEffect(() => { if (!loading) SplashScreen.hideAsync().catch(() => {}) }, [loading])
  const status = <StatusBar style={dark ? 'light' : 'dark'} />
  if (loading) return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.accent} /></View>
  if (!session) return <>{status}<SignIn /></>
  if (!me || me.status !== 'active') return <>{status}<Blocked /></>
  if (me.must_change_password) return <>{status}<NewPassword /></>
  return (
    <>
      {status}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }} />
    </>
  )
}

export default function RootLayout() {
  const [prefsReady, setPrefsReady] = useState(false)
  const [fonts] = useFonts({ GoogleSans_400Regular, GoogleSans_500Medium, GoogleSans_600SemiBold, GoogleSans_700Bold })
  useEffect(() => { loadPrefs().finally(() => setPrefsReady(true)) }, [])
  if (!prefsReady || !fonts) return null
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              <Gate />
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
