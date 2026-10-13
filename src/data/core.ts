import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { AppSettings, BankAccount, Profile, Role, RolePermission } from '../lib/types'

const must = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}
export { must }

/** Everyone on the team, keyed by id (names are shown on loans and messages). */
export function useTeam() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => must(await supabase.from('profiles').select('*').order('created_at')) as Profile[],
  })
}
export const useRoles = () =>
  useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const [roles, perms] = await Promise.all([
        supabase.from('roles').select('*').order('created_at'),
        supabase.from('role_permissions').select('*'),
      ])
      return { roles: must(roles) as Role[], perms: must(perms) as RolePermission[] }
    },
  })
export const useSettings = () =>
  useQuery({
    queryKey: ['settings'],
    queryFn: async () => must(await supabase.from('app_settings').select('*').eq('id', 1).single()) as AppSettings,
  })
export const useBanks = () =>
  useQuery({
    queryKey: ['banks'],
    queryFn: async () => must(await supabase.from('bank_accounts').select('*').order('id')) as BankAccount[],
  })

export const useInvalidate = () => {
  const qc = useQueryClient()
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })))
}

/** Display name helper: nickname if set, otherwise the full name. */
export const dn = (p?: Pick<Profile, 'display_name' | 'full_name'> | null) => (p ? p.display_name || p.full_name : '—')

/** Short-lived signed URL for a private file in the 'files' bucket. */
export async function fileUrl(path: string | null | undefined) {
  if (!path) return null
  const { data } = await supabase.storage.from('files').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

export { squarePhoto, uploadFile } from '../lib/device'
