import { useMemo, useState } from 'react'
import { router } from 'expo-router'
import { useAuth } from '@shared/app/auth'
import { nextUsername, suggestUsername, useRun, useSaveProfile, useUserAdmin, USERNAME_RE } from '@shared/data/admin'
import { useRoles, useTeam } from '@shared/data/core'
import type { Profile } from '@shared/lib/types'
import { DateField, Dropdown, Field, Seg } from '../../ui/Controls'
import { Sheet } from '../../ui/Sheet'
import { T } from '../../ui/Text'
import { useToast } from '../../ui/Toast'
import { createdLogin } from './login'

/** Add user (no `user`) or edit a user's personal info and role. Managers only. */
export function UserSheet({ user, onClose }: { user?: Profile; onClose: () => void }) {
  const { me } = useAuth()
  const toast = useToast()
  const run = useRun()
  const admin = useUserAdmin()
  const saveProfile = useSaveProfile()
  const roles = useRoles().data?.roles ?? []
  const team = useTeam().data
  const taken = useMemo(() => new Set((team ?? []).map((p) => p.username)), [team])
  const isSelf = !!user && user.id === me?.id

  const [name, setName] = useState(user?.full_name ?? '')
  const [latin, setLatin] = useState(user?.name_latin ?? '')
  const [display, setDisplay] = useState(user?.display_name ?? '')
  const [gender, setGender] = useState(user?.gender === 'M' ? 'Male' : 'Female')
  const [dob, setDob] = useState(user?.dob ?? '')
  const [addr, setAddr] = useState(user?.address ?? '')
  const [username, setUsername] = useState(user?.username ?? nextUsername(taken))
  const [manual, setManual] = useState(!!user)
  const [roleId, setRoleId] = useState(user?.role_id ?? (roles.find((r) => !r.locked) ?? roles[0])?.id ?? '')

  // usernames are Latin letters, so the suggestion comes from the Latin name (or the next free number)
  const onLatin = (v: string) => {
    setLatin(v)
    if (!manual) setUsername(v.trim() ? suggestUsername(v, taken) : nextUsername(taken))
  }

  const save = async () => {
    const full = name.trim()
    if (!full) { toast('Enter the name in Khmer'); return }
    if (!user) {
      const un = username.trim().toLowerCase()
      if (!USERNAME_RE.test(un)) { toast('Username: 3 to 32 letters, numbers, . _ or -'); return }
      if (taken.has(un)) { toast('That username is already taken'); return }
      if (!roleId) { toast('Choose a role'); return }
      const r = await run(() => admin.create({
        username: un, full_name: full, name_latin: latin.trim(), display_name: display.trim(), gender: gender === 'Male' ? 'M' : 'F',
        dob: dob || null, address: addr.trim(), role_id: roleId,
      }))
      if (r) {
        createdLogin.set(r.value.user_id, { username: r.value.username, temp_password: r.value.temp_password })
        onClose()
        router.push(`/users/${r.value.user_id}/login`)
      }
      return
    }
    const done = await run(() => saveProfile(user.id, {
      full_name: full, name_latin: latin.trim(), display_name: display.trim(), gender: gender === 'Male' ? 'M' : 'F',
      dob: dob || null, address: addr.trim(), ...(isSelf ? {} : { role_id: roleId }),
    }), 'User saved')
    if (done) onClose()
  }

  return (
    <Sheet title={user ? 'Edit user' : 'Add user'} onClose={onClose} action={{ label: user ? 'Save' : 'Create user', onClick: save }}>
      <Field label="Name in Khmer" value={name} onChange={setName} />
      <Field label="Name in Latin letters (optional)" value={latin} onChange={onLatin} autoCapitalize="words" />
      <Field label="Display name (optional)" value={display} onChange={setDisplay} />
      <Seg label="Gender" options={['Female', 'Male']} value={gender} onChange={setGender} />
      <DateField label="Date of birth (optional)" value={dob} onChange={setDob} allowClear />
      <Field label="Address (optional)" value={addr} onChange={setAddr} />
      <Field label="Username" value={username} onChange={(v) => { setManual(true); setUsername(v) }} disabled={!!user} autoCapitalize="none">
        <T v="small" muted>{user ? 'They sign in with this. It cannot be changed.' : 'Made from the full name, or a number like u001 if that is not possible. You can change it. They sign in with this.'}</T>
      </Field>
      {isSelf
        ? <>
          <Field label="Role" value={roles.find((r) => r.id === roleId)?.name ?? ''} disabled />
          <T v="small" muted>You cannot change your own role.</T>
        </>
        : <Dropdown label="Role" options={roles.map((r) => ({ value: r.id, label: r.name }))} value={roleId} onChange={setRoleId} />}
      {!user && <T v="small" muted>A temporary password is created when you save. You will see it once, to give to them. They must change it when they first sign in, and they add their own profile picture.</T>}
    </Sheet>
  )
}
