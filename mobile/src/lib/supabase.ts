// The phone's version of src/lib/supabase.ts (metro.config.js swaps it in for the shared code).
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, Platform } from 'react-native'
import { createClient } from '@supabase/supabase-js'

// The publishable key is safe to ship in the app; row level security guards the data.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://jkmnewnnzicyqlgtrosq.supabase.co'
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_tB3bssteHP88D4yXQI_cPA_RRIwl2jk'

export const supabase = createClient(url, key, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

// Refresh the session only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh()
    else supabase.auth.stopAutoRefresh()
  })
}

/** People sign in with a username; Supabase Auth stores it as an internal address. */
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@loans.local`
