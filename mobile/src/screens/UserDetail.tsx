import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '@shared/app/auth'
import { lastSeenLabel, loginMessage, STATUS_LABEL, useCopy, useRun, useUserAdmin } from '@shared/data/admin'
import { dn, useRoles, useTeam } from '@shared/data/core'
import { fmtD } from '@shared/lib/format'
import { ALL_PERMS } from '@shared/lib/perms'
import type { Profile, UserStatus } from '@shared/lib/types'
import { useColors } from '../lib/theme'
import { Avatar } from '../ui/Avatar'
import { Btn, Card, IconBtn, Row, Tap } from '../ui/core'
import { Seg } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { Screen } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'
import { T } from '../ui/Text'
import { PasswordBox } from './admin/parts'
import { UserSheet } from './admin/UserSheet'
import { createdLogin } from './admin/login'
import { RoleChip, StatusChip } from './parts'

const INFO: Record<UserStatus, string> = {
  active: 'Can sign in and work according to their role.',
  suspended: 'Cannot sign in until reactivated. Their records stay on file.',
  discharged: 'Has left the team and cannot sign in. Their records stay on file.',
}
const DONE: Record<UserStatus, string> = { active: 'User reactivated', suspended: 'User suspended', discharged: 'User discharged' }

type Dialog = null | { kind: 'edit' } | { kind: 'status'; to: UserStatus } | { kind: 'reset' } | { kind: 'pw'; pw: string }

/** The password in a grey field with a copy button (".pwfield"). */
export function PwField({ children, onCopy, label }: { children: ReactNode; onCopy: () => void; label: string }) {
  const c = useColors()
  return (
    <Row style={{ paddingVertical: 8, paddingLeft: 16, paddingRight: 8, borderRadius: 10, backgroundColor: c.surface2 }}>
      {children}
      <IconBtn name="copy" label={label} bg={c.accentSoft} color={c.accent} onPress={onCopy} />
    </Row>
  )
}

/** Title for a heading tile (".bt-h"). */
export const TileHead = ({ icon, label }: { icon: string; label: string }) => {
  const c = useColors()
  return (
    <Row gap={10}>
      <View style={{ padding: 7, borderRadius: 5, backgroundColor: c.surface2 }}><Icon name={icon} size={18} color={c.muted} /></View>
      <T b size={12.5} muted>{label}</T>
    </Row>
  )
}

export function UserDetail({ id }: { id: string }) {
  const c = useColors()
  const { me, can } = useAuth()
  const team = useTeam()
  const rolesQ = useRoles()
  const admin = useUserAdmin()
  const run = useRun()
  const copy = useCopy()
  const [dlg, setDlg] = useState<Dialog>(null)
  const u = (team.data ?? []).find((p) => p.id === id)
  if (!can('users.manage')) return <Screen title="User"><T muted>You do not have access to users.</T></Screen>
  if (!u) return <Screen title="User"><T muted>{team.isLoading ? 'Loading…' : 'User not found.'}</T></Screen>

  const role = (rolesQ.data?.roles ?? []).find((r) => r.id === u.role_id)
  const isMe = u.id === me?.id
  const canAct = !isMe
  const nPerms = role ? (role.locked ? ALL_PERMS.length : (rolesQ.data?.perms ?? []).filter((p) => p.role_id === role.id).length) : 0

  const row = (k: string, v: string, action?: ReactNode, gap?: boolean) => (
    <Row key={k} style={{ paddingVertical: 12, paddingTop: gap ? 22 : 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hair }}>
      <T muted style={{ width: '36%' }}>{k}</T>
      <T b={600} right style={{ flex: 1 }}>{v}</T>
      <View style={{ width: 44, alignItems: 'flex-end' }}>{action}</View>
    </Row>
  )
  const cta = (label: string, icon: string, onPress: () => void) => <IconBtn name={icon} size={34} label={label} bg={c.accentSoft} color={c.accent} onPress={onPress} />

  const reset = async () => {
    const r = await run(() => admin.resetPassword(u.id))
    if (r) { createdLogin.set(u.id, { username: u.username, temp_password: r.value }); setDlg({ kind: 'pw', pw: r.value }) }
  }

  const statusCopy = (to: UserStatus): [string, string, string, 'primary' | 'danger'] => {
    if (to === 'suspended') return ['Suspend user?', `${u.full_name} cannot sign in until you reactivate them. Their loans, payments and history stay on file.`, 'Suspend', 'danger']
    if (to === 'discharged') return ['Discharge user?', `${u.full_name} has left the team and can no longer sign in. Their loans, payments and history stay on file. You can reinstate them later if needed.`, 'Discharge', 'danger']
    const back = u.status === 'discharged'
    return [back ? 'Reinstate user?' : 'Reactivate user?', `${u.full_name} can sign in again with the ${role?.name ?? 'assigned'} role.`, back ? 'Reinstate' : 'Reactivate', 'primary']
  }

  return (
    <Screen title={dn(u)}>
      <Card style={{ paddingTop: 20 }}>
        <IconBtn name="edit" size={42} label="Edit user" bg={c.accent} color={c.accentInk} onPress={() => setDlg({ kind: 'edit' })} style={{ position: 'absolute', top: 14, right: 14, zIndex: 2 }} />
        <Row gap={16} style={{ paddingRight: 52 }}>
          <Avatar p={u} size={96} />
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <T v="h1" size={24}>{dn(u)}{isMe ? ' (you)' : ''}</T>
            <Row gap={6} wrap><RoleChip role={role} /><StatusChip status={u.status} /></Row>
          </View>
        </Row>
      </Card>

      <Card>
        <TileHead icon="userp" label="Details" />
        <View>
          {row('Username', u.username, cta('Copy username', 'copy', () => copy(u.username, 'Username')))}
          {row('Name in Khmer', u.full_name)}
          {row('Name in Latin letters', u.name_latin || '—')}
          {row('Display name', u.display_name || '—')}
          {row('Gender', u.gender === 'F' ? 'Female' : u.gender === 'M' ? 'Male' : '—')}
          {row('Date of birth', fmtD(u.dob))}
          {row('Address', u.address || '—')}
          {row('Role', role?.name ?? 'None yet', cta('Change role', 'edit', () => setDlg({ kind: 'edit' })), true)}
          {row('Permissions', `${nPerms} of ${ALL_PERMS.length}`, role && cta('View role permissions', 'lock', () => router.push('/users?tab=roles')))}
          {row('Password', u.must_change_password ? 'Temporary, not changed yet' : 'Set by the user')}
          {row('Last active', lastSeenLabel(u.last_seen), undefined, true)}
        </View>
      </Card>

      <Card>
        <TileHead icon="users" label="Account status" />
        {canAct ? (
          <>
            <Seg big options={(['active', 'suspended', 'discharged'] as UserStatus[]).map((k) => ({ value: k, label: STATUS_LABEL[k] }))} value={u.status}
              onChange={(k) => k !== u.status && setDlg({ kind: 'status', to: k as UserStatus })} />
            <T v="small" muted>{INFO[u.status]}</T>
          </>
        ) : (
          <>
            <StatusChip status={u.status} />
            <T v="small" muted>This is you. You cannot suspend or discharge your own account.</T>
          </>
        )}
      </Card>

      {canAct && u.status === 'active' && (
        <Tap onPress={() => setDlg({ kind: 'reset' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 11, padding: 18, borderWidth: 0.5, borderColor: c.hair }}>
          <View style={{ flex: 1 }}><T b>Reset password</T><T v="small" muted>Generate a temporary password to give them</T></View>
          <Icon name="chev" size={16} color={c.muted} />
        </Tap>
      )}

      {dlg?.kind === 'edit' && <UserSheet user={u} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'status' && (() => {
        const [title, body, label, kind] = statusCopy(dlg.to)
        return (
          <Sheet title={title} onClose={() => setDlg(null)} action={{
            label, kind,
            onClick: async () => { if (await run(() => admin.setStatus(u.id, dlg.to), DONE[dlg.to])) setDlg(null) },
          }}>
            <T>{body}</T>
          </Sheet>
        )
      })()}
      {dlg?.kind === 'reset' && (
        <Sheet title="Reset password?" onClose={() => setDlg(null)} action={{ label: 'Generate password', onClick: reset }}>
          <T>This replaces <T b>{dn(u)}</T>'s password with a temporary one. You will see it once, so copy it and send it to them.</T>
        </Sheet>
      )}
      {dlg?.kind === 'pw' && <PasswordSheet u={u} pw={dlg.pw} onClose={() => setDlg(null)} onRegenerate={reset} />}
    </Screen>
  )
}

function PasswordSheet({ u, pw, onClose, onRegenerate }: { u: Profile; pw: string; onClose: () => void; onRegenerate: () => Promise<void> }) {
  const copy = useCopy()
  return (
    <Sheet title="Temporary password" onClose={onClose}>
      <T v="small" muted>For <T b>{dn(u)}</T> (@{u.username}). Send it to them privately. They must choose a new password the next time they sign in. It is shown only now.</T>
      <PwField label="Copy password" onCopy={() => copy(pw, 'Password')}><PasswordBox key={pw} text={pw} /></PwField>
      <Btn block icon="refresh" label="Regenerate password" onPress={onRegenerate} />
      <Btn block icon="copy" label="Copy login information" onPress={() => copy(loginMessage(u.full_name, u.username, pw), 'Login information')} style={{ marginTop: 0 }} />
    </Sheet>
  )
}
