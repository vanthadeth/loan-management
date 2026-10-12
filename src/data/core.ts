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
export async function uploadFile(folder: string, file: File) {
  const ext = file.name.split('.').pop() || 'bin'
  const path = `${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('files').upload(path, file, { contentType: file.type })
  if (error) throw new Error(error.message)
  return path
}

/**
 * Shrinks a photo to a square JPEG so uploads stay small and avatars load fast.
 * Falls back to the original file when the browser cannot decode it (e.g. HEIC).
 */
export async function squarePhoto(file: File, size = 512): Promise<File> {
  try {
    const bmp = await createImageBitmap(file)
    const side = Math.min(bmp.width, bmp.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = Math.min(size, side)
    canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.86))
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}
