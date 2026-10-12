import { createClient } from '@supabase/supabase-js'

// The publishable key is safe to ship in the browser; row level security guards the data.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://jkmnewnnzicyqlgtrosq.supabase.co'
const key = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_tB3bssteHP88D4yXQI_cPA_RRIwl2jk'

export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })

/** People sign in with a username; Supabase Auth stores it as an internal address. */
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@loans.local`
