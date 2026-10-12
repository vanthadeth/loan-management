import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, usernameToEmail } from '../lib/supabase'
import { ALL_PERMS } from '../lib/perms'
import type { Profile, Role } from '../lib/types'

interface Auth {
  loading: boolean
  session: Session | null
  me: Profile | null
  role: Role | null
  perms: Set<string>
  /** True when the signed-in user only sees loans they supervise. */
  scoped: boolean
  can: (perm: string) => boolean
  signIn: (username: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  changePassword: (password: string) => Promise<string | null>
  reload: () => Promise<void>
}

const Ctx = createContext<Auth>(null as unknown as Auth)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Profile | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [perms, setPerms] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (uid: string | null) => {
    if (!uid) { setMe(null); setRole(null); setPerms(new Set()); return }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    if (!p) { setMe(null); return }
    const [{ data: r }, { data: rp }] = await Promise.all([
      supabase.from('roles').select('*').eq('id', p.role_id).maybeSingle(),
      supabase.from('role_permissions').select('permission').eq('role_id', p.role_id),
    ])
    setMe(p as Profile)
    setRole((r as Role) ?? null)
    setPerms(new Set(r?.locked ? ALL_PERMS : (rp ?? []).map((x) => x.permission as string)))
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await load(data.session?.user.id ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      // never await supabase calls inside this callback
      setTimeout(() => { void load(s?.user.id ?? null) }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const value = useMemo<Auth>(() => {
    const active = me?.status === 'active'
    return {
      loading, session, me, role, perms,
      scoped: !!role?.scoped && !role.locked,
      can: (k) => active && perms.has(k),
      signIn: async (username, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password })
        return error ? 'Wrong username or password.' : null
      },
      signOut: async () => { await supabase.auth.signOut() },
      changePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) return error.message
        const { error: e2 } = await supabase.from('profiles').update({ must_change_password: false }).eq('id', session!.user.id)
        if (e2) return e2.message
        await load(session!.user.id)
        return null
      },
      reload: () => load(session?.user.id ?? null),
    }
  }, [loading, session, me, role, perms, load])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
