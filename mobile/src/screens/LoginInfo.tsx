import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '@shared/app/auth'
import { loginMessage, useCopy, useRun, useUserAdmin } from '@shared/data/admin'
import { dn, useRoles, useTeam } from '@shared/data/core'
import { Avatar } from '../ui/Avatar'
import { Btn, Card, Chip, Row } from '../ui/core'
import { Screen } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'
import { T } from '../ui/Text'
import { PasswordBox } from './admin/parts'
import { createdLogin } from './admin/login'
import { PwField, TileHead } from './UserDetail'

/** First-login information for a new user. The password only exists in memory, never in storage. */
export function LoginInfo({ id }: { id: string }) {
  const { can } = useAuth()
  const team = useTeam()
  const roles = useRoles().data?.roles ?? []
  const admin = useUserAdmin()
  const run = useRun()
  const copy = useCopy()
  const [resetting, setResetting] = useState(false)
  const [info, setInfo] = useState(() => createdLogin.get(id))
  const title = 'First login information'
  if (!can('users.manage')) return <Screen title={title}><T muted>You do not have access to users.</T></Screen>
  const u = (team.data ?? []).find((p) => p.id === id)
  if (!u) return <Screen title={title}><T muted>{team.isLoading ? 'Loading…' : 'User not found.'}</T></Screen>
  const role = roles.find((r) => r.id === u.role_id)

  const reset = async () => {
    const r = await run(() => admin.resetPassword(u.id))
    if (!r) return
    setResetting(false)
    const next = { username: u.username, temp_password: r.value }
    createdLogin.set(u.id, next)
    setInfo(next)
  }

  return (
    <Screen title={title}>
      <Card>
        <Row gap={16}>
          <Avatar p={u} size={96} />
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            {info && <Chip kind="approved" icon="check" label="User created" />}
            <T v="h1" size={24}>{dn(u)}</T>
            <T v="small" muted>{role?.name}</T>
          </View>
        </Row>
      </Card>

      <Card>
        <TileHead icon="lock" label="First login information" />
        {info ? (
          <>
            <T v="small" muted>Give these to {dn(u)} privately. They sign in with the username and this temporary password, then choose their own password.</T>
            <View style={{ gap: 6 }}>
              <T v="eyebrow">Username</T>
              <PwField label="Copy username" onCopy={() => copy(info.username, 'Username')}><T b size={24} center style={{ flex: 1 }}>{info.username}</T></PwField>
            </View>
            <View style={{ gap: 6 }}>
              <T v="eyebrow">Temporary password</T>
              <PwField label="Copy password" onCopy={() => copy(info.temp_password, 'Password')}><PasswordBox key={info.temp_password} text={info.temp_password} /></PwField>
            </View>
            <Btn block icon="copy" label="Copy login information" onPress={() => copy(loginMessage(u.full_name, info.username, info.temp_password), 'Login information')} />
            <T v="small" muted>The temporary password is shown only now. If it is lost, generate a new one from the user's page.</T>
          </>
        ) : (
          <>
            <T v="small" muted>The temporary password can no longer be shown. Reset the password to get a new one to give to {dn(u)}.</T>
            {u.status === 'active' && <Btn block icon="refresh" label="Reset password" onPress={() => setResetting(true)} />}
          </>
        )}
      </Card>

      <Btn block kind="primary" label="Done" onPress={() => router.replace('/users')} style={{ marginTop: 0 }} />

      {resetting && (
        <Sheet title="Reset password?" onClose={() => setResetting(false)} action={{ label: 'Generate password', onClick: reset }}>
          <T>This replaces <T b>{dn(u)}</T>'s password with a temporary one. You will see it once, so copy it and send it to them.</T>
        </Sheet>
      )}
    </Screen>
  )
}
