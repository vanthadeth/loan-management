import { useNavigate } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { useI18n } from '../app/i18n'
import { dn, useBanks } from '../data/core'
import { useBook } from '../data/book'
import { useMessages } from '../data/messages'
import { Icon } from '../ui/Icon'

export function More() {
  const { t } = useI18n()
  const { me, can } = useAuth()
  const nav = useNavigate()
  const unread = (useMessages().data ?? []).filter((m) => !m.read).length
  const borrowers = useBook().data?.borrowers.length
  const banks = useBanks().data?.length

  const tiles: [string, string, string, string, number | string][] = [
    ['/profile', 'userp', t('profile'), dn(me), ''],
    ['/messages', 'msg', t('messages'), 'Team updates and reminders', unread || ''],
    ...(can('users.manage') ? [['/users', 'users', 'Users and roles', 'Team and permissions', ''] as [string, string, string, string, string]] : []),
    ['/settings', 'gear', 'Settings', 'Language, theme, fees', ''],
  ]
  const rows: [string, string, string, string, number | undefined][] = [
    ['/borrowers', 'userp', t('borrowers'), 'Profiles, documents and trust levels', borrowers],
    ...(can('banks.manage') ? [['/banks', 'wallet', 'Bank accounts', 'Where borrowers pay you', banks] as [string, string, string, string, number | undefined]] : []),
  ]

  return (
    <>
      <div className="bento hubb">
        {tiles.map(([to, icon, name, desc, value]) => (
          <button className="bt hb" key={to} onClick={() => nav(to)}>
            <span className="hb-top"><span className="hb-ic"><Icon name={icon} size={20} /></span><Icon name="chev" size={16} /></span>
            <span className="hb-t"><b>{name}</b><span className="small muted">{desc}</span></span>
            {value !== '' && <span className="hb-v"><b className="num">{value}</b><span className="small muted">unread</span></span>}
          </button>
        ))}
      </div>
      <div className="bh" style={{ paddingTop: 8 }}>Other functions</div>
      <div className="lcard">
        {rows.map(([to, icon, name, desc, count]) => (
          <button className="item" key={to} onClick={() => nav(to)}>
            <span className="tic in"><Icon name={icon} size={17} /></span>
            <span className="grow"><b className="ell" style={{ display: 'block' }}>{name}</b><span className="small muted">{desc}</span></span>
            <span className="small muted num">{count}</span>
            <Icon name="chev" size={16} />
          </button>
        ))}
      </div>
    </>
  )
}
