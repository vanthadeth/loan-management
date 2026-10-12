import { useState } from 'react'
import { useAuth } from './auth'
import { useI18n } from './i18n'

const Card = ({ children }: { children: React.ReactNode }) => {
  const { t } = useI18n()
  return (
    <div className="auth"><div className="auth-card">
      <img className="logo-img" src="/icon.svg" width={40} height={40} alt="" />
      <h1>{t('appname')}</h1>
      {children}
    </div></div>
  )
}

export function SignIn() {
  const { signIn } = useAuth()
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!u.trim() || !p) return setErr('Enter your username and password.')
    setBusy(true)
    const m = await signIn(u, p)
    setBusy(false)
    if (m) setErr(m)
  }
  return (
    <Card>
      <h2>Sign in</h2>
      <p className="muted small">Use the username and password your admin gave you.</p>
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="au">Username</label>
          <input id="au" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={u} onChange={(e) => setU(e.target.value)} autoFocus /></div>
        <div className="field"><label htmlFor="ap">Password</label>
          <input id="ap" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} /></div>
        <p className="auth-err" role="alert">{err}</p>
        <button className={'btn primary blockbtn' + (busy ? ' busy' : '')} type="submit" disabled={busy} aria-busy={busy}>Sign in</button>
      </form>
      <p className="small muted">Forgot your password? Ask an admin to reset it.</p>
    </Card>
  )
}

export function NewPassword() {
  const { changePassword, signOut } = useAuth()
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (a.length < 8) return setErr('Use at least 8 characters.')
    if (a !== b) return setErr('The two passwords do not match.')
    setBusy(true)
    const m = await changePassword(a)
    setBusy(false)
    if (m) setErr(m)
  }
  return (
    <Card>
      <h2>Choose a new password</h2>
      <p className="muted small">Your temporary password worked. Choose your own password to continue.</p>
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="an1">New password</label>
          <input id="an1" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} autoFocus /></div>
        <div className="field"><label htmlFor="an2">Confirm new password</label>
          <input id="an2" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} /></div>
        <p className="auth-err" role="alert">{err}</p>
        <button className={'btn primary blockbtn' + (busy ? ' busy' : '')} type="submit" disabled={busy} aria-busy={busy}>Save and continue</button>
      </form>
      <button className="linkbtn" onClick={() => signOut()}>Sign out</button>
    </Card>
  )
}

export function Blocked() {
  const { me, signOut } = useAuth()
  return (
    <Card>
      <h2>{me ? 'Account unavailable' : 'No access'}</h2>
      <p className="muted">
        {me?.status === 'suspended' && 'This account is suspended. Ask an admin to reactivate it.'}
        {me?.status === 'discharged' && 'This account has been closed.'}
        {!me && 'Your account is not set up yet. Ask an admin.'}
      </p>
      <button className="btn blockbtn" onClick={() => signOut()}>Sign out</button>
    </Card>
  )
}
