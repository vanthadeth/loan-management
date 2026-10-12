import { useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { usePageTitle } from '../app/Layout'
import { dn, useRoles, useTeam } from '../data/core'
import { lastSeenLabel, loginMessage, STATUS_LABEL, useCopy, useRun, useUserAdmin } from '../data/admin'
import { ALL_PERMS } from '../lib/perms'
import { fmtD } from '../lib/format'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { PasswordBox, RoleChip, StatusChip } from './admin/parts'
import { UserSheet } from './admin/UserSheet'
import type { UserStatus } from '../lib/types'

const INFO: Record<UserStatus, string> = {
  active: 'Can sign in and work according to their role.',
  suspended: 'Cannot sign in until reactivated. Their records stay on file.',
  discharged: 'Has left the team and cannot sign in. Their records stay on file.',
}
const DONE: Record<UserStatus, string> = { active: 'User reactivated', suspended: 'User suspended', discharged: 'User discharged' }

type Dialog = null | { kind: 'edit' } | { kind: 'status'; to: UserStatus } | { kind: 'reset' } | { kind: 'pw'; pw: string }

export function UserDetail() {
  const { id } = useParams()
  const { me, can } = useAuth()
  const nav = useNavigate()
  const team = useTeam()
  const rolesQ = useRoles()
  const admin = useUserAdmin()
  const run = useRun()
  const copy = useCopy()
  const [dlg, setDlg] = useState<Dialog>(null)
  const [regen, setRegen] = useState(false)
  const u = (team.data ?? []).find((p) => p.id === id)
  usePageTitle(u ? dn(u) : 'User')
  if (!can('users.manage')) return <Navigate to="/more" replace />
  if (!u) return <p className="muted">{team.isLoading ? 'Loading…' : 'User not found.'}</p>

  const role = (rolesQ.data?.roles ?? []).find((r) => r.id === u.role_id)
  const isMe = u.id === me?.id
  const canAct = !isMe
  const nPerms = role ? (role.locked ? ALL_PERMS.length : (rolesQ.data?.perms ?? []).filter((p) => p.role_id === role.id).length) : 0

  const row = (k: string, v: ReactNode, action?: ReactNode, cls = '') => (
    <tr className={cls || undefined}>
      <th scope="row">{k}</th>
      <td className="ut-v"><b style={{ overflowWrap: 'anywhere' }}>{v}</b></td>
      <td className="ut-a">{action}</td>
    </tr>
  )
  const cta = (label: string, icon: string, onClick: () => void) => (
    <button className="mcta" aria-label={label} title={label} onClick={onClick}><Icon name={icon} size={17} /></button>
  )

  // The temporary password is shown only once, so a user who has not signed in yet needs a fresh one.
  const copyLogin = () => {
    if (u.must_change_password) setDlg({ kind: 'reset' })
    else copy(`Hello ${u.full_name},\n\nOpen the app:\n${window.location.origin}\n\nUsername: ${u.username}\nUse the password you set. If you forgot it, ask me to reset it.`, 'Login information')
  }

  const reset = async () => {
    const r = await run(() => admin.resetPassword(u.id))
    if (r) setDlg({ kind: 'pw', pw: r.value })
  }
  const regenerate = async () => {
    setRegen(true)
    const r = await run(() => admin.resetPassword(u.id))
    if (r) setDlg({ kind: 'pw', pw: r.value })
    setRegen(false)
  }

  const statusCopy = (to: UserStatus): [string, ReactNode, string, string] => {
    const name = <b>{u.full_name}</b>
    if (to === 'suspended') return ['Suspend user?', <>{name} cannot sign in until you reactivate them. Their loans, payments and history stay on file.</>, 'Suspend', 'danger']
    if (to === 'discharged') return ['Discharge user?', <>{name} has left the team and can no longer sign in. Their loans, payments and history stay on file. You can reinstate them later if needed.</>, 'Discharge', 'danger']
    const back = u.status === 'discharged'
    return [back ? 'Reinstate user?' : 'Reactivate user?', <>{name} can sign in again with the {role?.name ?? 'assigned'} role.</>, back ? 'Reinstate' : 'Reactivate', 'primary']
  }

  return (
    <div className="bento ubento">
      <section className="bt u-id">
        <button className="editfab" aria-label="Edit user" title="Edit user" onClick={() => setDlg({ kind: 'edit' })}><Icon name="edit" size={18} /></button>
        <div className="row" style={{ gap: 16, paddingRight: 52 }}>
          <Avatar p={u} size="xl" />
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 24, lineHeight: 1.1 }}>{dn(u)}{isMe ? ' (you)' : ''}</h2>
            <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}><RoleChip role={role} /><StatusChip status={u.status} /></div>
          </div>
        </div>
      </section>

      <section className="bt u-all">
        <span className="bt-h"><Icon name="userp" size={18} />Details</span>
        <table className="ut">
          <tbody>
            {row('Username', u.username, cta('Copy username', 'copy', () => copy(u.username, 'Username')))}
            {row('Login information', u.must_change_password ? 'Not signed in yet' : 'App link and username', cta('Copy login information', 'copy', copyLogin))}
            {row('Full name', u.full_name)}
            {row('Display name', u.display_name || '—')}
            {row('Gender', u.gender === 'F' ? 'Female' : u.gender === 'M' ? 'Male' : '—')}
            {row('Date of birth', fmtD(u.dob))}
            {row('Address', u.address || '—')}
            {row('Role', role?.name ?? 'None yet', cta('Change role', 'edit', () => setDlg({ kind: 'edit' })), 'ut-s')}
            {row('Permissions', `${nPerms} of ${ALL_PERMS.length}`, role && cta('View role permissions', 'lock', () => nav('/users?tab=roles')))}
            {row('Password', u.must_change_password ? 'Temporary, not changed yet' : 'Set by the user')}
            {row('Last active', lastSeenLabel(u.last_seen), null, 'ut-s')}
          </tbody>
        </table>
      </section>

      <section className="bt u-w">
        <span className="bt-h"><Icon name="users" size={18} />Account status</span>
        {canAct ? (
          <>
            <div className="seg big" role="group" aria-label="Account status">
              {(['active', 'suspended', 'discharged'] as UserStatus[]).map((k) => (
                <button key={k} aria-pressed={u.status === k} onClick={() => u.status !== k && setDlg({ kind: 'status', to: k })}>{STATUS_LABEL[k]}</button>
              ))}
            </div>
            <span className="small bt-sub">{INFO[u.status]}</span>
          </>
        ) : (
          <>
            <span><StatusChip status={u.status} /></span>
            <span className="small bt-sub">This is you. You cannot suspend or discharge your own account.</span>
          </>
        )}
      </section>

      {canAct && u.status === 'active' && (
        <button className="bt u-w u-act" onClick={() => setDlg({ kind: 'reset' })}>
          <span className="grow"><b>Reset password</b><span className="small muted" style={{ display: 'block' }}>Generate a temporary password to give them</span></span>
          <Icon name="chev" size={16} />
        </button>
      )}

      {dlg?.kind === 'edit' && <UserSheet user={u} onClose={() => setDlg(null)} />}

      {dlg?.kind === 'status' && (() => {
        const [title, body, label, cls] = statusCopy(dlg.to)
        return (
          <Sheet title={title} onClose={() => setDlg(null)} action={{
            label, cls,
            onClick: async () => { if (await run(() => admin.setStatus(u.id, dlg.to), DONE[dlg.to])) setDlg(null) },
          }}>
            <p style={{ margin: '0 0 6px' }}>{body}</p>
          </Sheet>
        )
      })()}

      {dlg?.kind === 'reset' && (
        <Sheet title="Reset password?" onClose={() => setDlg(null)} action={{ label: 'Generate password', onClick: reset }}>
          <p style={{ margin: '0 0 6px' }}>This replaces <b>{dn(u)}</b>'s password with a temporary one. You will see it once, so copy it and send it to them.</p>
        </Sheet>
      )}

      {dlg?.kind === 'pw' && (
        <Sheet title="Temporary password" onClose={() => setDlg(null)}>
          <p className="muted small" style={{ margin: '0 0 10px' }}>
            For <b>{dn(u)}</b> (@{u.username}). Send it to them privately. They must choose a new password the next time they sign in. It is shown only now.
          </p>
          <div className="pwfield">
            <PasswordBox key={dlg.pw} text={dlg.pw} />
            <button type="button" className="mcta" aria-label="Copy password" title="Copy password" onClick={() => copy(dlg.pw, 'Password')}><Icon name="copy" size={17} /></button>
          </div>
          <button type="button" className="btn blockbtn" style={{ marginTop: 12 }} disabled={regen} onClick={regenerate}><Icon name="refresh" size={17} />Regenerate password</button>
          <button type="button" className="btn blockbtn" style={{ marginTop: 8 }} onClick={() => copy(loginMessage(u.full_name, u.username, dlg.pw), 'Login information')}><Icon name="copy" size={17} />Copy login information</button>
        </Sheet>
      )}
    </div>
  )
}
