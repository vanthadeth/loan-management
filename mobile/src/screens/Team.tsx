import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuth } from '@shared/app/auth'
import { lastSeenLabel, permsOf, STATUS_LABEL, useRoleActions, useRun } from '@shared/data/admin'
import { dn, useRoles, useTeam } from '@shared/data/core'
import { ALL_PERMS, PDEP, PGROUPS } from '@shared/lib/perms'
import type { Role } from '@shared/lib/types'
import { useColors } from '../lib/theme'
import { Avatar } from '../ui/Avatar'
import { Btn, Card, Empty, Item, LCard, Row, Switch, Tabs, Tap } from '../ui/core'
import { Fab } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { Screen } from '../ui/Screen'
import { T } from '../ui/Text'
import { RoleSheet } from './admin/RoleSheet'
import { UserSheet } from './admin/UserSheet'
import { RoleChip } from './parts'

export function Team() {
  const { can } = useAuth()
  const params = useLocalSearchParams<{ tab?: string }>()
  const [tab, setTab] = useState<'users' | 'roles'>(params.tab === 'roles' ? 'roles' : 'users')
  const [adding, setAdding] = useState<null | 'user' | 'role'>(null)
  if (!can('users.manage')) return <Screen title="Users and roles"><T muted>You do not have access to users and roles.</T></Screen>
  return (
    <Screen title="Users and roles" overlay={<Fab label={tab === 'users' ? 'Add user' : 'Add role'} onPress={() => setAdding(tab === 'users' ? 'user' : 'role')} />}>
      <Tabs items={[{ key: 'users', label: 'Users', icon: 'users' }, { key: 'roles', label: 'Roles and permissions', icon: 'lock' }]} value={tab} onChange={setTab} />
      {tab === 'users' ? <UsersTab /> : <RolesTab adding={adding === 'role'} onAdded={() => setAdding(null)} />}
      {adding === 'user' && <UserSheet onClose={() => setAdding(null)} />}
    </Screen>
  )
}

function UsersTab() {
  const { me } = useAuth()
  const team = useTeam()
  const roles = useRoles().data?.roles ?? []
  const users = team.data ?? []
  return (
    <>
      <T v="eyebrow">Team</T>
      <LCard>
        {users.map((u) => (
          <Item key={u.id} dim={u.status !== 'active'} onPress={() => router.push(`/users/${u.id}`)}>
            <Avatar p={u} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T b ell>{dn(u)}{u.id === me?.id ? ' (you)' : ''}</T>
              <T v="small" muted ell>@{u.username}</T>
              <T v="small" muted>{u.status === 'active' ? lastSeenLabel(u.last_seen) : STATUS_LABEL[u.status]}</T>
            </View>
            <RoleChip role={roles.find((r) => r.id === u.role_id)} />
          </Item>
        ))}
        {team.isLoading && <Empty>Loading…</Empty>}
        {team.isError && <Empty>Could not load the team.</Empty>}
      </LCard>
    </>
  )
}

/** One role at a time: pick it, then switch its permissions on or off (the web shows a roles × permissions grid). */
function RolesTab({ adding, onAdded }: { adding: boolean; onAdded: () => void }) {
  const c = useColors()
  const { me, reload } = useAuth()
  const q = useRoles()
  const team = useTeam().data ?? []
  const actions = useRoleActions()
  const run = useRun()
  const [pick, setPick] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const roles = q.data?.roles ?? []
  const perms = q.data?.perms ?? []
  const role = roles.find((r) => r.id === pick) ?? roles[0]
  const count = (r: Role) => team.filter((u) => u.role_id === r.id).length
  const scoped = roles.filter((r) => r.scoped && !r.locked).map((r) => r.name)

  if (q.isLoading) return <Empty>Loading…</Empty>
  if (q.isError || !role) return <Empty>Could not load roles.</Empty>
  const held = permsOf(role, perms, ALL_PERMS)
  const state = (k: string) => (role.locked ? 'allow' : PDEP[k] && !held.has(PDEP[k]) ? 'na' : held.has(k) ? 'allow' : 'deny')

  return (
    <>
      <T v="small" muted>
        {scoped.join(', ') || 'No role'} can only see and manage loans assigned to them as supervisor. Pick a role, then switch each permission on or off. Admin always has full access.
      </T>
      <Row gap={8} wrap>
        {roles.map((r) => {
          const on = r.id === role.id
          return (
            <Tap key={r.id} onPress={() => setPick(r.id)} accessibilityState={{ selected: on }}
              style={{ borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: on ? c.accent : c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: on ? c.accent : c.line }}>
              <Row gap={4}>{r.locked && <Icon name="lock" size={13} color={on ? c.accentInk : c.ink} />}<T b size={14} color={on ? c.accentInk : c.ink}>{r.name}</T></Row>
              <T size={12} color={on ? c.accentInk : c.muted}>{count(r)} {count(r) === 1 ? 'user' : 'users'}</T>
            </Tap>
          )
        })}
      </Row>
      <Card>
        <Row between>
          <View style={{ flex: 1 }}>
            <T v="h2">{role.name}</T>
            {!!role.description && <T v="small" muted>{role.description}</T>}
          </View>
          <Btn sm icon="edit" label="Edit role" onPress={() => setEditing(true)} />
        </Row>
        {PGROUPS.map(([group, ps]) => (
          <View key={group}>
            <View style={{ backgroundColor: c.surface2, marginHorizontal: -18, paddingHorizontal: 18, paddingVertical: 6, marginTop: 8 }}>
              <T b={600} size={12} muted style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>{group}</T>
            </View>
            {ps.map(([k, label]) => {
              const s = state(k)
              return (
                <Row key={k} style={{ paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hair, opacity: s === 'na' ? 0.5 : 1 }}>
                  <View style={{ flex: 1 }}>
                    <T size={14}>{label}</T>
                    {s === 'na' && <T v="small" muted>Turn on the matching View permission first</T>}
                  </View>
                  <Switch label={`${role.name}: ${label}`} value={s === 'allow'} disabled={role.locked || s === 'na'}
                    onChange={() => run(async () => {
                      await actions.togglePerm(role.id, k, held)
                      if (role.id === me?.role_id) await reload()
                    })} />
                </Row>
              )
            })}
          </View>
        ))}
      </Card>
      {(editing || adding) && (
        <RoleSheet role={adding ? undefined : role} roles={roles} perms={perms} users={adding ? 0 : count(role)}
          onClose={() => { setEditing(false); onAdded() }} />
      )}
    </>
  )
}
