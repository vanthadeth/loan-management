import { useCallback } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { PDEP } from '../lib/perms'
import { fmtD } from '../lib/format'
import { useAuth } from '../app/auth'
import { useToast } from '../ui/Toast'
import { squarePhoto, uploadFile, useInvalidate } from './core'
import type { AppSettings, BankAccount, Profile, Role } from '../lib/types'

/* ---------------------------------------------------------------- errors */

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.')

type Result = { error: { message: string } | null; data?: unknown[] | null }

/** Throws the Supabase error; a write that touched no rows means row level security refused it. */
function check(r: Result, requireRows = false) {
  if (r.error) throw new Error(r.error.message)
  if (requireRows && (r.data ?? []).length === 0) throw new Error('You are not allowed to do this.')
}

/**
 * Runs a write, shows a success toast, or the error message when it fails.
 * Resolves to { value } on success and null on failure.
 */
export function useRun() {
  const toast = useToast()
  return useCallback(async <T,>(fn: () => Promise<T>, ok?: string): Promise<{ value: T } | null> => {
    try {
      const value = await fn()
      if (ok) toast(ok)
      return { value }
    } catch (e) {
      toast(errMsg(e))
      return null
    }
  }, [toast])
}

/* ---------------------------------------------------- user administration */

async function invokeAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    let message = error.message
    if (error instanceof FunctionsHttpError) {
      const j = (await error.context.json().catch(() => null)) as { error?: string } | null
      if (j?.error) message = j.error
    }
    throw new Error(message)
  }
  return data as T
}

export interface NewUser {
  username: string; full_name: string; display_name: string; gender: 'F' | 'M'
  dob: string | null; address: string; role_id: string
}

export function useUserAdmin() {
  const inv = useInvalidate()
  return {
    async create(u: NewUser) {
      const r = await invokeAdmin<{ user_id: string; username: string; temp_password: string }>({ action: 'create', ...u })
      await inv('profiles')
      return r
    },
    async resetPassword(userId: string) {
      const r = await invokeAdmin<{ temp_password: string }>({ action: 'reset_password', user_id: userId })
      await inv('profiles')
      return r.temp_password
    },
    async setStatus(userId: string, status: Profile['status']) {
      await invokeAdmin<{ ok: true }>({ action: 'set_status', user_id: userId, status })
      await inv('profiles')
    },
  }
}

export type ProfilePatch = Partial<Pick<Profile, 'full_name' | 'display_name' | 'gender' | 'dob' | 'address' | 'photo_path' | 'role_id'>>

/** Updates a profile row (own details, or anyone's for user managers) and refreshes the caches. */
export function useSaveProfile() {
  const inv = useInvalidate()
  const { me, reload } = useAuth()
  return async (id: string, patch: ProfilePatch) => {
    check(await supabase.from('profiles').update(patch).eq('id', id).select('id'), true)
    await inv('profiles')
    if (id === me?.id) await reload()
  }
}

/** Uploads a picture and stores it as the signed-in user's profile photo, replacing the old one. */
export function useUploadPhoto() {
  const save = useSaveProfile()
  const { me } = useAuth()
  return async (file: File) => {
    if (!me) return
    const old = me.photo_path
    const path = await uploadFile('avatars', await squarePhoto(file))
    await save(me.id, { photo_path: path })
    if (old) await supabase.storage.from('files').remove([old])
  }
}

/* ---------------------------------------------------------------- settings */

export type SettingsPatch = Pick<AppSettings, 'service_fee_pct' | 'late_fee_khr' | 'late_fee_usd'>

export function useSaveSettings() {
  const inv = useInvalidate()
  return async (patch: SettingsPatch) => {
    check(await supabase.from('app_settings').update(patch).eq('id', 1).select('id'), true)
    await inv('settings')
  }
}

/* ------------------------------------------------------------------- banks */

export const BANK_NAMES = ['ABA Bank', 'ACLEDA Bank', 'Wing Bank', 'Canadia Bank', 'Sathapana Bank', 'Other']

export function useBankActions() {
  const inv = useInvalidate()
  return {
    async save(id: number | null, b: Omit<BankAccount, 'id'>) {
      if (id) check(await supabase.from('bank_accounts').update(b).eq('id', id).select('id'), true)
      else check(await supabase.from('bank_accounts').insert(b).select('id'), true)
      await inv('banks')
    },
    async remove(id: number) {
      const r = await supabase.from('bank_accounts').delete().eq('id', id).select('id')
      if (r.error?.code === '23503') throw new Error('This account is used by loans or payments, so it cannot be deleted.')
      check(r, true)
      await inv('banks')
    },
  }
}

/* ------------------------------------------------------------------- roles */

export interface RoleForm { name: string; description: string; scoped: boolean }

const slug = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'role'

export function uniqueRoleId(name: string, taken: Set<string>) {
  const base = slug(name)
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

export function useRoleActions() {
  const inv = useInvalidate()
  return {
    /** Turns one permission on or off for a role; dependants follow their base permission. */
    async togglePerm(roleId: string, perm: string, held: Set<string>) {
      if (held.has(perm)) {
        const drop = [perm, ...Object.keys(PDEP).filter((d) => PDEP[d] === perm)]
        check(await supabase.from('role_permissions').delete().eq('role_id', roleId).in('permission', drop))
      } else {
        const base = PDEP[perm]
        const add = base && !held.has(base) ? [base, perm] : [perm]
        check(await supabase.from('role_permissions').upsert(add.map((permission) => ({ role_id: roleId, permission })), { onConflict: 'role_id,permission', ignoreDuplicates: true }))
      }
      await inv('roles')
    },
    async save(id: string, f: RoleForm) {
      const r = await supabase.from('roles').update({ name: f.name, description: f.description, scoped: f.scoped }).eq('id', id).select('id')
      if (r.error?.code === '23505') throw new Error('That role name is already used')
      check(r, true)
      await inv('roles')
    },
    async create(f: RoleForm, taken: Set<string>, copy: string[]) {
      const id = uniqueRoleId(f.name, taken)
      const r = await supabase.from('roles').insert({ id, name: f.name, description: f.description, scoped: f.scoped }).select('id')
      if (r.error?.code === '23505') throw new Error('That role name is already used')
      check(r, true)
      if (copy.length) check(await supabase.from('role_permissions').insert(copy.map((permission) => ({ role_id: id, permission }))))
      await inv('roles')
    },
    async remove(id: string) {
      check(await supabase.from('roles').delete().eq('id', id).select('id'), true)
      await inv('roles', 'profiles')
    },
  }
}

/** Permissions a role holds (the locked Admin role holds all of them). */
export function permsOf(role: Role, rows: { role_id: string; permission: string }[], all: string[]) {
  return role.locked ? new Set(all) : new Set(rows.filter((p) => p.role_id === role.id).map((p) => p.permission))
}

/* ------------------------------------------------------------- user helpers */

const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Next free u001-style username. */
export function nextUsername(taken: Set<string>) {
  let n = 1
  while (taken.has('u' + String(n).padStart(3, '0'))) n++
  return 'u' + String(n).padStart(3, '0')
}

/** first.last from a full name, made unique; falls back to u001 when the name gives too little. */
export function suggestUsername(fullName: string, taken: Set<string>) {
  const parts = plain(fullName).split(/\s+/).map((x) => x.replace(/[^a-z0-9]/g, '')).filter(Boolean)
  const base = (parts.length > 1 ? parts[0] + '.' + parts[parts.length - 1] : parts[0] ?? '').slice(0, 18)
  if (base.length < 3) return nextUsername(taken)
  let name = base
  for (let k = 2; taken.has(name); k++) name = base.slice(0, 18 - String(k).length) + k
  return name
}

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/

export const STATUS_LABEL: Record<Profile['status'], string> = { active: 'Active', suspended: 'Suspended', discharged: 'Discharged' }

/** 'Never signed in', 'Active now', 'Today', '3 days ago'... never a raw timestamp. */
export function lastSeenLabel(ts: string | null) {
  if (!ts) return 'Never signed in'
  const d = new Date(ts)
  const mins = (Date.now() - d.getTime()) / 60_000
  if (mins < 5) return 'Active now'
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 864e5)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return fmtD(localIso(d))
}

/** Message the admin sends to a new user (copied from the first-login page). */
export const loginMessage = (fullName: string, username: string, password: string) =>
  `Hello ${fullName},\n\nWelcome to the team.\n\nClick on the following URL to download the app.\n${window.location.origin}\n\n----\n\nYour login information:\nUsername: ${username}\nPassword: ${password}\n\nPlease set your own password on your first login.`

/** Copies text and tells the user, with a fallback hint when the browser refuses. */
export function useCopy() {
  const toast = useToast()
  return async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast(label + ' copied')
    } catch {
      toast('Press and hold the text to copy it')
    }
  }
}

/** Time label for the message list: the clock today, the date otherwise. */
export function messageStamp(ts: string) {
  const d = new Date(ts)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? time : `${fmtD(localIso(d))} · ${time}`
}
