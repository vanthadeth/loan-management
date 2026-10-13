import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { messageStamp } from '@shared/data/admin'
import { dn, useInvalidate, useRoles, useTeam } from '@shared/data/core'
import { markRead, messageText, useMessages, type MessageRow } from '@shared/data/messages'
import { loanCode } from '@shared/lib/format'
import { useI18n } from '../lib/i18n'
import { useColors } from '../lib/theme'
import { Avatar } from '../ui/Avatar'
import { Empty, Item, LCard, Row, Tabs } from '../ui/core'
import { Screen } from '../ui/Screen'
import { T } from '../ui/Text'

export function Messages() {
  const { t } = useI18n()
  const c = useColors()
  const inv = useInvalidate()
  const msgs = useMessages()
  const team = useTeam().data ?? []
  const roles = useRoles().data?.roles ?? []
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const rows = (msgs.data ?? []).filter((m) => filter === 'all' || !m.read)
  const open = async (m: MessageRow) => {
    if (!m.read) {
      await markRead([m.id])
      await inv('messages')
    }
    if (m.loan_id) router.push(`/loans/${m.loan_id}`)
  }

  return (
    <Screen title={t('messages')}>
      <Tabs items={[{ key: 'all', label: t('all'), icon: 'asterisk' }, { key: 'unread', label: 'Unread', icon: 'msg' }]} value={filter} onChange={setFilter} />
      <LCard>
        {rows.map((m) => {
          const who = team.find((p) => p.id === m.actor)
          const role = roles.find((r) => r.id === who?.role_id)
          return (
            <Item key={m.id} onPress={() => open(m)} style={{ alignItems: 'flex-start' }}>
              <Avatar p={who} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Row between style={{ alignItems: 'flex-start' }}>
                  <T b style={{ flex: 1 }}>{dn(who)}{role ? <T v="small" muted> · {role.name}</T> : null}</T>
                  <T v="small" muted>{messageStamp(m.created_at)}</T>
                </Row>
                <T v="small" muted>{messageText(m, m.loan_id ? loanCode(m.loan_id) : '')}</T>
              </View>
              {!m.read && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.accent, marginTop: 6 }} />}
            </Item>
          )
        })}
        {msgs.isLoading && <Empty>Loading…</Empty>}
        {msgs.isError && <Empty>Could not load messages.</Empty>}
        {msgs.isSuccess && rows.length === 0 && <Empty>No messages.</Empty>}
      </LCard>
    </Screen>
  )
}
