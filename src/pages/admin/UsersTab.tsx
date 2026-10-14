import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/auth'
import { dn, useRoles, useTeam } from '../../data/core'
import { lastSeenLabel, STATUS_LABEL } from '../../data/admin'
import { Avatar } from '../../ui/Avatar'
import { HeaderAction } from '../../ui/HeaderAction'
import { RoleChip } from './parts'
import { UserSheet } from './UserSheet'

export function UsersTab() {
  const { me } = useAuth()
  const nav = useNavigate()
  const team = useTeam()
  const roles = useRoles().data?.roles ?? []
  const [adding, setAdding] = useState(false)
  const users = team.data ?? []
  return (
    <>
      <h3 className="wz-cap">Team</h3>
      <div className="lcard">
        {users.map((u) => (
          <button className={'item' + (u.status === 'active' ? '' : ' off')} key={u.id} onClick={() => nav('/users/' + u.id)}>
            <Avatar p={u} />
            <span className="grow">
              <b className="ell" style={{ display: 'block' }}>{dn(u)}{u.id === me?.id ? ' (you)' : ''}</b>
              <span className="small muted ell" style={{ display: 'block' }}>@{u.username}</span>
              <span className="small muted">{u.status === 'active' ? lastSeenLabel(u.last_seen) : STATUS_LABEL[u.status]}</span>
            </span>
            <RoleChip role={roles.find((r) => r.id === u.role_id)} />
          </button>
        ))}
        {team.isLoading && <p className="muted">Loading…</p>}
        {team.isError && <p className="muted">Could not load the team.</p>}
      </div>
      <HeaderAction label="Add user" onClick={() => setAdding(true)} />
      {adding && <UserSheet onClose={() => setAdding(false)} />}
    </>
  )
}
