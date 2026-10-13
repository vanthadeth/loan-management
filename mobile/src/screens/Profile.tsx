import { useState } from 'react'
import { View } from 'react-native'
import { useAuth } from '@shared/app/auth'
import { useRun, useSaveProfile, useUploadPhoto } from '@shared/data/admin'
import { dn, useRoles, useTeam } from '@shared/data/core'
import { fmtD, initials } from '@shared/lib/format'
import type { Profile as ProfileRow } from '@shared/lib/types'
import { useI18n } from '../lib/i18n'
import { pickPhotos } from '../lib/pick'
import { useColors } from '../lib/theme'
import { Avatar } from '../ui/Avatar'
import { Btn, Card, Divider, IconBtn, KV, Row, Tap } from '../ui/core'
import { DateField, Field, Label, Seg } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { Screen } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'
import { T } from '../ui/Text'
import { useToast } from '../ui/Toast'
import { PhotoTile } from './admin/parts'
import { RoleChip } from './parts'

/** Picks a photo from the camera or the library and saves it as the profile picture. */
function usePhotoPicker() {
  const run = useRun()
  const upload = useUploadPhoto()
  return async (source: 'camera' | 'library') => {
    const [file] = await pickPhotos(source)
    if (file) void run(() => upload(file), 'Profile picture updated')
  }
}

function EditProfile({ me, canEditName, onClose }: { me: ProfileRow; canEditName: boolean; onClose: () => void }) {
  const toast = useToast()
  const run = useRun()
  const save = useSaveProfile()
  const pick = usePhotoPicker()
  const [name, setName] = useState(me.full_name)
  const [latin, setLatin] = useState(me.name_latin)
  const [display, setDisplay] = useState(me.display_name)
  const [gender, setGender] = useState(me.gender === 'M' ? 'Male' : 'Female')
  const [dob, setDob] = useState(me.dob ?? '')
  const [addr, setAddr] = useState(me.address)
  const submit = async () => {
    if (!name.trim()) { toast('Enter your full name'); return }
    const done = await run(() => save(me.id, {
      ...(canEditName ? { full_name: name.trim() } : {}),
      name_latin: latin.trim(), display_name: display.trim(), gender: gender === 'Male' ? 'M' : 'F', dob: dob || null, address: addr.trim(),
    }), 'Profile updated')
    if (done) onClose()
  }
  return (
    <Sheet title="Edit profile" onClose={onClose} action={{ onClick: submit }}>
      <View style={{ gap: 4 }}>
        <Label>Profile picture (optional)</Label>
        <Row gap={12}>
          <Avatar p={me} size="lg" />
          <View style={{ gap: 8 }}>
            <Btn sm icon="camera" label="Take photo" onPress={() => pick('camera')} />
            <Btn sm icon="upload" label="Choose photo" onPress={() => pick('library')} />
          </View>
        </Row>
      </View>
      <Field label="Name in Khmer" value={name} onChange={setName} disabled={!canEditName} />
      <Field label="Name in Latin letters (optional)" value={latin} onChange={setLatin} autoCapitalize="words" />
      <Field label="Display name (optional)" value={display} onChange={setDisplay} />
      <Seg label="Gender" options={['Female', 'Male']} value={gender} onChange={setGender} />
      <DateField label="Date of birth (optional)" value={dob} onChange={setDob} allowClear />
      <Field label="Address (optional)" value={addr} onChange={setAddr} />
      <T v="small" muted>Your username and role are set by an admin.</T>
    </Sheet>
  )
}

export function Profile() {
  const { t } = useI18n()
  const c = useColors()
  const { me, role, can, signOut } = useAuth()
  const team = useTeam().data ?? []
  const roles = useRoles().data?.roles ?? []
  const pick = usePhotoPicker()
  const [editing, setEditing] = useState(false)
  const [info, setInfo] = useState(false)
  const [photoMenu, setPhotoMenu] = useState(false)
  if (!me) return <Screen title={t('profile')} />

  return (
    <Screen title={t('profile')}>
      <Card style={{ paddingTop: 20 }}>
        <IconBtn name="edit" size={42} label="Edit profile" bg={c.accent} color={c.accentInk} onPress={() => setEditing(true)} style={{ position: 'absolute', top: 14, right: 14, zIndex: 2 }} />
        <Row gap={16} style={{ paddingRight: 46 }}>
          <Tap onPress={() => setPhotoMenu(true)} accessibilityLabel="Change profile picture">
            <Avatar p={me} size={84} />
            <View style={{ position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: c.surface }}>
              <Icon name="camera" size={14} color={c.accentInk} />
            </View>
          </Tap>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <T v="h1" size={24}>{dn(me)}</T>
            <T v="small" muted>@{me.username}</T>
            <RoleChip role={role} />
          </View>
        </Row>
        <Divider style={{ marginTop: 6 }} />
        <Tap onPress={() => setInfo(!info)} accessibilityState={{ expanded: info }} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
          <T b>Information</T>
          <View style={{ transform: [{ rotate: info ? '90deg' : '0deg' }] }}><Icon name="chev" size={16} color={c.muted} /></View>
        </Tap>
        {info && (
          <View style={{ gap: 10 }}>
            <KV label="Name in Khmer">{me.full_name}</KV>
            {!!me.name_latin && <KV label="Name in Latin letters">{me.name_latin}</KV>}
            <Row>
              <KV label="Gender" style={{ flex: 1 }}>
                {me.gender ? <Row gap={6}><Icon name={me.gender === 'F' ? 'venus' : 'mars'} size={17} color={c.accent} /><T>{me.gender === 'F' ? 'Female' : 'Male'}</T></Row> : '—'}
              </KV>
              <KV label="Date of birth" style={{ flex: 1 }}>{fmtD(me.dob)}</KV>
            </Row>
            <KV label="Address">{me.address || '—'}</KV>
          </View>
        )}
        <Btn block kind="danger" icon="out" label="Sign out" onPress={() => signOut()} />
      </Card>

      <T v="eyebrow" style={{ paddingTop: 8 }}>Team</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {team.filter((u) => u.status === 'active').map((u) => (
          <View key={u.id} style={{ width: '30%', flexGrow: 1, maxWidth: '33%', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderRadius: 9, paddingTop: 10, paddingBottom: 12, paddingHorizontal: 8, borderWidth: 0.5, borderColor: c.hair }}>
            <PhotoTile p={u} initials={initials(dn(u))} />
            <T b={600} size={14} ell>{dn(u)}</T>
            <RoleChip role={roles.find((r) => r.id === u.role_id)} />
          </View>
        ))}
      </View>
      {editing && <EditProfile me={me} canEditName={can('users.manage')} onClose={() => setEditing(false)} />}
      {photoMenu && (
        <Sheet title="Profile picture" onClose={() => setPhotoMenu(false)}>
          <Btn block icon="camera" label="Take photo" onPress={() => { setPhotoMenu(false); void pick('camera') }} style={{ marginTop: 0 }} />
          <Btn block icon="upload" label="Choose from photos" onPress={() => { setPhotoMenu(false); void pick('library') }} style={{ marginTop: 0 }} />
        </Sheet>
      )}
    </Screen>
  )
}
