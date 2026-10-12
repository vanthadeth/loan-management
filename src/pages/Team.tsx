import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { usePageTitle } from '../app/Layout'
import { Icon } from '../ui/Icon'
import { RolesTab } from './admin/RolesTab'
import { UsersTab } from './admin/UsersTab'

const TABS = [['users', 'Users', 'users'], ['roles', 'Roles and permissions', 'lock']] as const

export function Team() {
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  usePageTitle('Users and roles')
  if (!can('users.manage')) return <Navigate to="/more" replace />
  const tab = params.get('tab') === 'roles' ? 'roles' : 'users'
  return (
    <>
      <div className="tabs">
        {TABS.map(([k, name, icon]) => (
          <button className="tab" key={k} aria-pressed={tab === k} onClick={() => setParams(k === 'users' ? {} : { tab: k }, { replace: true })}>
            <Icon name={icon} size={16} />{name}
          </button>
        ))}
      </div>
      {tab === 'users' ? <UsersTab /> : <RolesTab />}
    </>
  )
}
