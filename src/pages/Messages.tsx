import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '../app/Layout'
import { useI18n } from '../app/i18n'
import { dn, useInvalidate, useRoles, useTeam } from '../data/core'
import { markRead, messageText, useMessages, type MessageRow } from '../data/messages'
import { messageStamp } from '../data/admin'
import { loanCode } from '../lib/format'
import { Icon } from '../ui/Icon'

export function Messages() {
  const { t } = useI18n()
  const nav = useNavigate()
  const inv = useInvalidate()
  const msgs = useMessages()
  const team = useTeam().data ?? []
  const roles = useRoles().data?.roles ?? []
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  usePageTitle(t('messages'))

  const rows = (msgs.data ?? []).filter((m) => filter === 'all' || !m.read)
  const open = async (m: MessageRow) => {
    if (!m.read) {
      await markRead([m.id])
      await inv('messages')
    }
    if (m.loan_id) nav('/loans/' + m.loan_id)
  }

  return (
    <>
      <div className="tabs">
        {([['all', t('all'), 'asterisk'], ['unread', 'Unread', 'msg']] as const).map(([k, name, icon]) => (
          <button className="tab" key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}><Icon name={icon} size={16} />{name}</button>
        ))}
      </div>
      <div className="lcard">
        {rows.map((m) => {
          const who = team.find((p) => p.id === m.actor)
          const role = roles.find((r) => r.id === who?.role_id)
          return (
            <button className="item" key={m.id} onClick={() => open(m)}>
              <span className="avatar">{dn(who)[0]}</span>
              <span className="grow">
                <span className="row between">
                  <b>{dn(who)}{role && <> <span className="small muted">· {role.name}</span></>}</b>
                  <span className="small muted">{messageStamp(m.created_at)}</span>
                </span>
                <span className="small muted">{messageText(m, m.loan_id ? loanCode(m.loan_id) : '')}</span>
              </span>
              {!m.read && <i className="udot" />}
            </button>
          )
        })}
        {msgs.isLoading && <p className="muted">Loading…</p>}
        {msgs.isError && <p className="muted">Could not load messages.</p>}
        {msgs.isSuccess && rows.length === 0 && <p className="muted">No messages.</p>}
      </div>
    </>
  )
}
