import { useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { usePageTitle } from '../app/Layout'
import { dn, useRoles, useTeam } from '../data/core'
import { loginMessage, useCopy, useRun, useUserAdmin } from '../data/admin'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { PasswordBox } from './admin/parts'

interface Created { username: string; temp_password: string }

/** First-login information for a new user. The password only exists in navigation state, never in storage. */
export function LoginInfo() {
  const { id } = useParams()
  const { can } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const team = useTeam()
  const roles = useRoles().data?.roles ?? []
  const admin = useUserAdmin()
  const run = useRun()
  const copy = useCopy()
  const [resetting, setResetting] = useState(false)
  usePageTitle('First login information')
  if (!can('users.manage')) return <Navigate to="/more" replace />
  const u = (team.data ?? []).find((p) => p.id === id)
  if (!u) return <p className="muted">{team.isLoading ? 'Loading…' : 'User not found.'}</p>

  const state = loc.state as Created | null
  const info = state?.username && state.temp_password ? state : null
  const role = roles.find((r) => r.id === u.role_id)

  const reset = async () => {
    const r = await run(() => admin.resetPassword(u.id))
    if (!r) return
    setResetting(false)
    nav(loc.pathname, { replace: true, state: { username: u.username, temp_password: r.value } satisfies Created })
  }

  return (
    <div className="bento ubento">
      <section className="bt u-id">
        <div className="row" style={{ gap: 16 }}>
          <Avatar p={u} size="xl" />
          <div className="grow" style={{ minWidth: 0 }}>
            {info && <span className="chip approved"><Icon name="check" size={13} />User created</span>}
            <h2 style={{ fontSize: 24, lineHeight: 1.1, marginTop: info ? 8 : 0 }}>{dn(u)}</h2>
            <p className="muted small" style={{ margin: '4px 0 0' }}>{role?.name}</p>
          </div>
        </div>
      </section>

      <section className="bt u-all">
        <span className="bt-h"><Icon name="lock" size={18} />First login information</span>
        {info ? (
          <>
            <p className="muted small" style={{ margin: 0 }}>
              Give these to {dn(u)} privately. They sign in with the username and this temporary password, then choose their own password.
            </p>
            <div className="lf">
              <span className="eyebrow">Username</span>
              <div className="pwfield">
                <span className="pwbox lfv">{info.username}</span>
                <button type="button" className="mcta" aria-label="Copy username" title="Copy username" onClick={() => copy(info.username, 'Username')}><Icon name="copy" size={17} /></button>
              </div>
            </div>
            <div className="lf">
              <span className="eyebrow">Temporary password</span>
              <div className="pwfield">
                <PasswordBox key={info.temp_password} text={info.temp_password} />
                <button type="button" className="mcta" aria-label="Copy password" title="Copy password" onClick={() => copy(info.temp_password, 'Password')}><Icon name="copy" size={17} /></button>
              </div>
            </div>
            <button type="button" className="btn blockbtn" onClick={() => copy(loginMessage(u.full_name, info.username, info.temp_password), 'Login information')}>
              <Icon name="copy" size={17} />Copy login information
            </button>
            <p className="small muted" style={{ margin: 0 }}>The temporary password is shown only now. If it is lost, generate a new one from the user's page.</p>
          </>
        ) : (
          <>
            <p className="muted small" style={{ margin: 0 }}>
              The temporary password can no longer be shown. Reset the password to get a new one to give to {dn(u)}.
            </p>
            {u.status === 'active' && (
              <button type="button" className="btn blockbtn" onClick={() => setResetting(true)}><Icon name="refresh" size={17} />Reset password</button>
            )}
          </>
        )}
      </section>

      <button type="button" className="btn primary blockbtn u-all" onClick={() => nav('/users')}>Done</button>

      {resetting && (
        <Sheet title="Reset password?" onClose={() => setResetting(false)} action={{ label: 'Generate password', onClick: reset }}>
          <p style={{ margin: '0 0 6px' }}>This replaces <b>{dn(u)}</b>'s password with a temporary one. You will see it once, so copy it and send it to them.</p>
        </Sheet>
      )}
    </div>
  )
}
