import { useState } from 'react'
import { useAuth } from '../../app/auth'
import { useRoles, useTeam } from '../../data/core'
import { permsOf, useRoleActions, useRun } from '../../data/admin'
import { ALL_PERMS, PDEP, PGROUPS } from '../../lib/perms'
import { Icon } from '../../ui/Icon'
import { HeaderAction } from '../../ui/HeaderAction'
import type { Role } from '../../lib/types'
import { RoleSheet } from './RoleSheet'

const STATE = { allow: ['check', 'Allowed'], deny: ['x', 'Not allowed'], na: ['minus', 'Not available'] } as const

export function RolesTab() {
  const { me, reload } = useAuth()
  const q = useRoles()
  const team = useTeam().data ?? []
  const actions = useRoleActions()
  const run = useRun()
  const [sheet, setSheet] = useState<{ role?: Role } | null>(null)
  const roles = q.data?.roles ?? []
  const perms = q.data?.perms ?? []
  const held = new Map(roles.map((r) => [r.id, permsOf(r, perms, ALL_PERMS)]))
  const count = (r: Role) => team.filter((u) => u.role_id === r.id).length
  const scoped = roles.filter((r) => r.scoped && !r.locked).map((r) => r.name)

  const state = (r: Role, k: string) => {
    const h = held.get(r.id)!
    return r.locked ? 'allow' : PDEP[k] && !h.has(PDEP[k]) ? 'na' : h.has(k) ? 'allow' : 'deny'
  }

  if (q.isLoading) return <p className="muted">Loading…</p>
  if (q.isError) return <p className="muted">Could not load roles.</p>
  return (
    <>
      <p className="muted small" style={{ margin: '0 0 10px' }}>
        {scoped.join(', ') || 'No role'} can only see and manage loans assigned to them as supervisor. Tap a cell to allow or deny a permission for a role. Tap a role name to rename or delete it. Admin always has full access.
      </p>
      <div className="pm-key small muted">
        <span><Icon name="check" size={16} />Allowed</span>
        <span><Icon name="x" size={16} />Not allowed</span>
        <span><Icon name="minus" size={16} />Not available (turn on the matching View permission first)</span>
      </div>
      <div className="pm-wrap">
        <table className="pm">
          <thead>
            <tr>
              <th />
              {roles.map((r) => (
                <th key={r.id}>
                  <button className="pm-h" onClick={() => setSheet({ role: r })}>
                    <b>{r.locked && <Icon name="lock" size={13} />}{r.name}</b>
                    <small>{count(r)} {count(r) === 1 ? 'user' : 'users'}</small>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PGROUPS.map(([group, ps]) => [
              <tr className="pm-g" key={group}><th colSpan={roles.length + 1}>{group}</th></tr>,
              ...ps.map(([k, label]) => (
                <tr key={k}>
                  <th scope="row">{label}</th>
                  {roles.map((r) => {
                    const s = state(r, k)
                    return (
                      <td key={r.id}>
                        <button className="pm-c" data-s={s} disabled={r.locked || s === 'na'}
                          aria-label={`${r.name}: ${label}: ${STATE[s][1]}`} title={STATE[s][1]}
                          onClick={() => run(async () => {
                            await actions.togglePerm(r.id, k, held.get(r.id)!)
                            if (r.id === me?.role_id) await reload()
                          })}>
                          <Icon name={STATE[s][0]} size={18} />
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <HeaderAction label="Add role" onClick={() => setSheet({})} />
      {sheet && <RoleSheet role={sheet.role} roles={roles} perms={perms} users={sheet.role ? count(sheet.role) : 0} onClose={() => setSheet(null)} />}
    </>
  )
}
