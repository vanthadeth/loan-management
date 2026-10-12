import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/auth'
import { useRoles, useTeam } from '../../data/core'
import { nextUsername, suggestUsername, useRun, useSaveProfile, useUserAdmin, USERNAME_RE } from '../../data/admin'
import { DateField, Dropdown, Field, Seg } from '../../ui/Controls'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import type { Profile } from '../../lib/types'

/** Add user (no `user`) or edit a user's personal info and role. Managers only. */
export function UserSheet({ user, onClose }: { user?: Profile; onClose: () => void }) {
  const { me } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const run = useRun()
  const admin = useUserAdmin()
  const saveProfile = useSaveProfile()
  const roles = useRoles().data?.roles ?? []
  const team = useTeam().data
  const taken = useMemo(() => new Set((team ?? []).map((p) => p.username)), [team])
  const isSelf = !!user && user.id === me?.id

  const [name, setName] = useState(user?.full_name ?? '')
  const [display, setDisplay] = useState(user?.display_name ?? '')
  const [gender, setGender] = useState(user?.gender === 'M' ? 'Male' : 'Female')
  const [dob, setDob] = useState(user?.dob ?? '')
  const [addr, setAddr] = useState(user?.address ?? '')
  const [username, setUsername] = useState(user?.username ?? nextUsername(taken))
  const [manual, setManual] = useState(!!user)
  const [roleId, setRoleId] = useState(user?.role_id ?? (roles.find((r) => !r.locked) ?? roles[0])?.id ?? '')

  const onName = (v: string) => {
    setName(v)
    if (!manual) setUsername(suggestUsername(v, taken))
  }

  const save = async () => {
    const full = name.trim()
    if (!full) { toast('Enter the full name'); return }
    if (!user) {
      const un = username.trim().toLowerCase()
      if (!USERNAME_RE.test(un)) { toast('Username: 3 to 32 letters, numbers, . _ or -'); return }
      if (taken.has(un)) { toast('That username is already taken'); return }
      if (!roleId) { toast('Choose a role'); return }
      const r = await run(() => admin.create({
        username: un, full_name: full, display_name: display.trim(), gender: gender === 'Male' ? 'M' : 'F',
        dob: dob || null, address: addr.trim(), role_id: roleId,
      }))
      if (r) nav(`/users/${r.value.user_id}/login`, { state: { username: r.value.username, temp_password: r.value.temp_password } })
      return
    }
    const done = await run(() => saveProfile(user.id, {
      full_name: full, display_name: display.trim(), gender: gender === 'Male' ? 'M' : 'F',
      dob: dob || null, address: addr.trim(), ...(isSelf ? {} : { role_id: roleId }),
    }), 'User saved')
    if (done) onClose()
  }

  return (
    <Sheet title={user ? 'Edit user' : 'Add user'} onClose={onClose} action={{ label: user ? 'Save' : 'Create user', onClick: save }}>
      <div className="form wz-1col">
        <Field id="un" label="Full name" value={name} onChange={onName} />
        <Field id="ux" label="Display name (optional)" value={display} onChange={setDisplay} />
        <Seg id="ug" label="Gender" options={['Female', 'Male']} value={gender} onChange={setGender} />
        <DateField id="ubd" label="Date of birth (optional)" value={dob} onChange={setDob} allowClear />
        <Field id="ua" label="Address (optional)" value={addr} onChange={setAddr} />
        <Field id="uu" label="Username" value={username} onChange={(v) => { setManual(true); setUsername(v) }} disabled={!!user}>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            {user ? 'They sign in with this. It cannot be changed.' : 'Made from the full name, or a number like u001 if that is not possible. You can change it. They sign in with this.'}
          </p>
        </Field>
        {isSelf
          ? <>
            <Field id="ur" label="Role" value={roles.find((r) => r.id === roleId)?.name ?? ''} disabled />
            <p className="small muted" style={{ margin: 0 }}>You cannot change your own role.</p>
          </>
          : <Dropdown id="ur" label="Role" options={roles.map((r) => ({ value: r.id, label: r.name }))} value={roleId} onChange={setRoleId} />}
        {!user && <p className="small muted" style={{ margin: 0 }}>A temporary password is created when you save. You will see it once, to give to them. They must change it when they first sign in, and they add their own profile picture.</p>}
      </div>
    </Sheet>
  )
}
