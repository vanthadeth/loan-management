import { useState } from 'react'
import { permsOf, useRoleActions, useRun } from '../../data/admin'
import { ALL_PERMS } from '../../lib/perms'
import { Dropdown, Field, Seg } from '../../ui/Controls'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import type { Role, RolePermission } from '../../lib/types'

const ALL = 'All loans'
const SCOPED = 'Supervised loans only'
const NONE = 'none'

interface Props {
  /** Edit this role; omit to add a new one. */
  role?: Role
  roles: Role[]
  perms: RolePermission[]
  /** How many users hold the role being edited. */
  users: number
  onClose: () => void
}

export function RoleSheet({ role, roles, perms, users, onClose }: Props) {
  const toast = useToast()
  const run = useRun()
  const actions = useRoleActions()
  const [name, setName] = useState(role?.name ?? '')
  const [desc, setDesc] = useState(role?.description ?? '')
  const [access, setAccess] = useState(role?.scoped ? SCOPED : ALL)
  const [from, setFrom] = useState(NONE)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = async () => {
    const n = name.trim()
    if (!n) { toast('Enter a role name'); return }
    if (roles.some((r) => r.name.toLowerCase() === n.toLowerCase() && r.id !== role?.id)) { toast('That role name is already used'); return }
    const form = { name: n, description: desc.trim(), scoped: access === SCOPED }
    const src = roles.find((r) => r.id === from)
    const done = await run(() => role
      ? actions.save(role.id, form)
      : actions.create(form, new Set(roles.map((r) => r.id)), src ? [...permsOf(src, perms, ALL_PERMS)] : []), 'Role saved')
    if (done) onClose()
  }

  if (confirmDelete && role) {
    return (
      <Sheet key="delete" title="Delete role?" onClose={() => setConfirmDelete(false)} action={{
        label: 'Delete', cls: 'danger',
        onClick: async () => { if (await run(() => actions.remove(role.id), 'Role deleted')) onClose() },
      }}>
        <p style={{ margin: '0 0 6px' }}>Delete the <b>{role.name}</b> role?</p>
      </Sheet>
    )
  }

  return (
    <Sheet key="form" title={role ? 'Edit role' : 'Add role'} onClose={onClose} action={{ label: role ? 'Save' : 'Add role', onClick: save }}>
      <div className="form wz-1col">
        <Field id="rn" label="Role name" value={name} onChange={setName} disabled={role?.locked} />
        <Field id="rd" label="Description" value={desc} onChange={setDesc} />
        {!role?.locked && <Seg id="rs" label="Loan access" options={[ALL, SCOPED]} value={access} onChange={setAccess} />}
        {!role && (
          <Dropdown id="rc" label="Start from"
            options={[{ value: NONE, label: 'No permissions' }, ...roles.map((r) => ({ value: r.id, label: 'Copy of ' + r.name }))]}
            value={from} onChange={setFrom} />
        )}
        {role?.locked && <p className="small muted" style={{ margin: 0 }}>Admin always has full access and cannot be deleted.</p>}
        {role && !role.locked && (
          <button type="button" className="btn danger blockbtn" onClick={() => {
            if (users > 0) toast("Move this role's users to another role first")
            else setConfirmDelete(true)
          }}>Delete role</button>
        )}
      </div>
    </Sheet>
  )
}
