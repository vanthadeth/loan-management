import { useState, type ChangeEvent } from 'react'
import { useAuth } from '../app/auth'
import { usePageTitle } from '../app/Layout'
import { useI18n } from '../app/i18n'
import { dn, useRoles, useTeam } from '../data/core'
import { useRun, useSaveProfile, useUploadPhoto } from '../data/admin'
import { fmtD, initials } from '../lib/format'
import { Avatar } from '../ui/Avatar'
import { DateField, Field, Seg } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { PhotoTile, RoleChip } from './admin/parts'
import type { Profile as ProfileRow } from '../lib/types'

function usePhotoInput() {
  const run = useRun()
  const upload = useUploadPhoto()
  return (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void run(() => upload(file), 'Profile picture updated')
  }
}

function EditProfile({ me, canEditName, onClose }: { me: ProfileRow; canEditName: boolean; onClose: () => void }) {
  const toast = useToast()
  const run = useRun()
  const save = useSaveProfile()
  const onPhoto = usePhotoInput()
  const [name, setName] = useState(me.full_name)
  const [display, setDisplay] = useState(me.display_name)
  const [gender, setGender] = useState(me.gender === 'M' ? 'Male' : 'Female')
  const [dob, setDob] = useState(me.dob ?? '')
  const [addr, setAddr] = useState(me.address)
  const submit = async () => {
    if (!name.trim()) { toast('Enter your full name'); return }
    const done = await run(() => save(me.id, {
      ...(canEditName ? { full_name: name.trim() } : {}),
      display_name: display.trim(), gender: gender === 'Male' ? 'M' : 'F', dob: dob || null, address: addr.trim(),
    }), 'Profile updated')
    if (done) onClose()
  }
  return (
    <Sheet title="Edit profile" onClose={onClose} action={{ onClick: submit }}>
      <div className="form wz-1col">
        <div className="field">
          <label>Profile picture (optional)</label>
          <div className="row" style={{ gap: 12 }}>
            <Avatar p={me} size="lg" />
            <label className="btn sm" style={{ cursor: 'pointer' }}>Take / choose photo<input type="file" accept="image/*" capture="user" hidden onChange={onPhoto} /></label>
          </div>
        </div>
        <Field id="bn" label="Full name" value={name} onChange={setName} disabled={!canEditName} />
        <Field id="bx" label="Display name (optional)" value={display} onChange={setDisplay} />
        <Seg id="bg" label="Gender" options={['Female', 'Male']} value={gender} onChange={setGender} />
        <DateField id="bd" label="Date of birth (optional)" value={dob} onChange={setDob} allowClear />
        <Field id="ba" label="Address (optional)" value={addr} onChange={setAddr} />
        <p className="small muted" style={{ margin: 0 }}>Your username and role are set by an admin.</p>
      </div>
    </Sheet>
  )
}

export function Profile() {
  const { t } = useI18n()
  const { me, role, can, signOut } = useAuth()
  const team = useTeam().data ?? []
  const roles = useRoles().data?.roles ?? []
  const onPhoto = usePhotoInput()
  const [editing, setEditing] = useState(false)
  usePageTitle(t('profile'))
  if (!me) return null

  return (
    <div className="bento">
      <section className="bt b-id">
        <div className="row" style={{ gap: 16 }}>
          <label className="avwrap" title="Change profile picture" aria-label="Change profile picture">
            <Avatar p={me} size="xl" />
            <span className="camfab"><Icon name="camera" size={16} /></span>
            <input type="file" accept="image/*" hidden onChange={onPhoto} />
          </label>
          <div className="grow">
            <h2 style={{ fontSize: 24, lineHeight: 1.1 }}>{dn(me)}</h2>
            <p className="muted small" style={{ margin: '4px 0 8px' }}>@{me.username}</p>
            <RoleChip role={role} />
          </div>
        </div>
        <button className="editfab" aria-label="Edit profile" title="Edit profile" onClick={() => setEditing(true)}><Icon name="edit" size={18} /></button>
        <details className="binfo">
          <summary><span>Information</span><Icon name="chev" size={16} /></summary>
          <div className="kv mob1" style={{ marginTop: 6 }}>
            <div style={{ gridColumn: '1/-1' }}><span className="eyebrow">Full name</span>{me.full_name}</div>
            <div>
              <span className="eyebrow">Gender</span>
              {me.gender ? <span className="gend"><Icon name={me.gender === 'F' ? 'venus' : 'mars'} size={17} />{me.gender === 'F' ? 'Female' : 'Male'}</span> : '—'}
            </div>
            <div><span className="eyebrow">Date of birth</span>{fmtD(me.dob)}</div>
            <div style={{ gridColumn: '1/-1' }}><span className="eyebrow">Address</span>{me.address || '—'}</div>
          </div>
        </details>
        <button className="btn danger blockbtn" onClick={() => signOut()}><Icon name="out" size={18} />Sign out</button>
      </section>

      <div className="bsec team">
        <div className="bh">Team</div>
        <div className="b-users">
          <div className="ucards">
            {team.filter((u) => u.status === 'active').map((u) => (
              <div className="ucard" key={u.id}>
                <PhotoTile p={u} initials={initials(dn(u))} />
                <b className="ell">{dn(u)}</b>
                <RoleChip role={roles.find((r) => r.id === u.role_id)} />
              </div>
            ))}
          </div>
        </div>
      </div>
      {editing && <EditProfile me={me} canEditName={can('users.manage')} onClose={() => setEditing(false)} />}
    </div>
  )
}
