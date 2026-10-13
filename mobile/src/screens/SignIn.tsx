import { useState, type ReactNode } from 'react'
import { Image, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@shared/app/auth'
import { useI18n } from '../lib/i18n'
import { useColors } from '../lib/theme'
import { Btn, Tap } from '../ui/core'
import { Field } from '../ui/Controls'
import { T } from '../ui/Text'

const LOGO = require('../../assets/icon.png')

function Card({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const c = useColors()
  const insets = useSafeAreaInsets()
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 24 + insets.top, paddingBottom: 24 + insets.bottom }}>
        <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', backgroundColor: c.surface, borderRadius: 10, paddingVertical: 28, paddingHorizontal: 24, gap: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hair }}>
          <Image source={LOGO} style={{ width: 40, height: 40, borderRadius: 9 }} />
          <T v="h1" size={20}>{t('appname')}</T>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const Err = ({ children }: { children: string }) => {
  const c = useColors()
  return <T size={13.5} color={c.late} accessibilityRole="alert" style={{ minHeight: 18 }}>{children}</T>
}

export function SignIn() {
  const { signIn } = useAuth()
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  const submit = async () => {
    if (!u.trim() || !p) return setErr('Enter your username and password.')
    const m = await signIn(u, p)
    if (m) setErr(m)
  }
  return (
    <Card>
      <T v="h1">Sign in</T>
      <T v="small" muted>Use the username and password your admin gave you.</T>
      <Field label="Username" value={u} onChange={setU} autoCapitalize="none" />
      <Field label="Password" value={p} onChange={setP} secure onSubmit={submit} />
      <Err>{err}</Err>
      <Btn kind="primary" block label="Sign in" onPress={submit} style={{ marginTop: 0 }} />
      <T v="small" muted>Forgot your password? Ask an admin to reset it.</T>
    </Card>
  )
}

export function NewPassword() {
  const { changePassword, signOut } = useAuth()
  const c = useColors()
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [err, setErr] = useState('')
  const submit = async () => {
    if (a.length < 8) return setErr('Use at least 8 characters.')
    if (a !== b) return setErr('The two passwords do not match.')
    const m = await changePassword(a)
    if (m) setErr(m)
  }
  return (
    <Card>
      <T v="h1">Choose a new password</T>
      <T v="small" muted>Your temporary password worked. Choose your own password to continue.</T>
      <Field label="New password" value={a} onChange={setA} secure />
      <Field label="Confirm new password" value={b} onChange={setB} secure onSubmit={submit} />
      <Err>{err}</Err>
      <Btn kind="primary" block label="Save and continue" onPress={submit} style={{ marginTop: 0 }} />
      <Tap onPress={() => signOut()}><T b={600} size={13} color={c.accentText}>Sign out</T></Tap>
    </Card>
  )
}

export function Blocked() {
  const { me, signOut } = useAuth()
  return (
    <Card>
      <T v="h1">{me ? 'Account unavailable' : 'No access'}</T>
      <T muted>
        {me?.status === 'suspended' && 'This account is suspended. Ask an admin to reactivate it.'}
        {me?.status === 'discharged' && 'This account has been closed.'}
        {!me && 'Your account is not set up yet. Ask an admin.'}
      </T>
      <Btn block label="Sign out" onPress={() => signOut()} />
    </Card>
  )
}
