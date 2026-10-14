import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { useI18n } from '../app/i18n'
import { dn, useBanks } from '../data/core'
import { useBook, useLoanViews } from '../data/book'
import { buildToday } from '../data/today'
import { useMessages } from '../data/messages'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'

type Row = [to: string, icon: string, name: string, desc: string, count?: number]

function Section({ title, rows }: { title: string; rows: Row[] }) {
  const nav = useNavigate()
  return (
    <section>
      <div className="bh" style={{ paddingTop: 8 }}>{title}</div>
      <div className="lcard">
        {rows.map(([to, icon, name, desc, count]) => (
          <button className="item" key={to} onClick={() => nav(to)}>
            <span className="tic in"><Icon name={icon} size={17} /></span>
            <span className="grow"><b className="ell" style={{ display: 'block' }}>{name}</b><span className="small muted">{desc}</span></span>
            {count !== undefined && <span className="small muted num">{count}</span>}
            <Icon name="chev" size={16} />
          </button>
        ))}
      </div>
    </section>
  )
}

export function More() {
  const { t } = useI18n()
  const { me, role, can } = useAuth()
  const nav = useNavigate()
  const unread = (useMessages().data ?? []).filter((m) => !m.read).length
  const borrowers = useBook().data?.borrowers.length
  const banks = useBanks().data?.length
  const { views } = useLoanViews()
  const canApprove = can('loans.approve')
  const { todo } = useMemo(() => buildToday(views, canApprove), [views, canApprove])

  // everything else, least important last
  const main: Row[] = [
    ['/', 'dashboard', t('home'), 'Money overview'],
    ['/cashflow', 'payments', t('payTab'), 'Payments in and out'],
    ['/loans', 'loans', t('loans'), 'Active, pending and past loans'],
    ...(can('reports.view') ? [['/reports', 'reports', t('reports'), 'Portfolio, aging and exports'] as Row] : []),
  ]
  const rows: Row[] = [
    ...(can('users.manage') ? [['/users', 'users', 'Users and roles', 'Team and permissions'] as Row] : []),
    ['/settings', 'gear', 'Settings', 'Language, theme, fees'],
    ...(can('banks.manage') ? [['/banks', 'wallet', 'Bank accounts', 'Where borrowers pay you', banks] as Row] : []),
  ]

  return (
    <>
      <div className="bento hubb">
        <button className="bt hb big" onClick={() => nav('/profile')}>
          <span className="hb-top"><Avatar p={me} /><Icon name="chev" size={16} /></span>
          <span className="hb-t"><b>{dn(me)}</b><span className="small muted">{t('profile')}{role?.name ? ` · ${role.name}` : ''}</span></span>
        </button>
        <button className="bt hb wide" onClick={() => nav('/today')}>
          <span className="hb-top"><span className="hb-ic"><Icon name="checkc" size={20} /></span><Icon name="chev" size={16} /></span>
          <span className="hb-t"><b>{t('today')}</b><span className="small muted">What to collect, approve and release</span></span>
          <span className="hb-v"><b className="num">{todo}</b><span className="small muted">to do</span></span>
        </button>
        <button className="bt hb" onClick={() => nav('/borrowers')}>
          <span className="hb-top"><span className="hb-ic"><Icon name="userp" size={20} /></span><Icon name="chev" size={16} /></span>
          <span className="hb-t"><b>{t('borrowers')}</b><span className="small muted">Profiles and trust levels</span></span>
          {borrowers !== undefined && <span className="hb-v"><b className="num">{borrowers}</b><span className="small muted">total</span></span>}
        </button>
        <button className="bt hb" onClick={() => nav('/messages')}>
          <span className="hb-top"><span className="hb-ic"><Icon name="msg" size={20} /></span><Icon name="chev" size={16} /></span>
          <span className="hb-t"><b>{t('messages')}</b><span className="small muted">Team updates</span></span>
          <span className="hb-v"><b className="num">{unread}</b><span className="small muted">unread</span></span>
        </button>
      </div>
      <Section title="Main menu" rows={main} />
      <Section title="Other functions" rows={rows} />
    </>
  )
}
