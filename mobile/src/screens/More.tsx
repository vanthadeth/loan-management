import { View } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '@shared/app/auth'
import { dn, useBanks } from '@shared/data/core'
import { useBook } from '@shared/data/book'
import { useMessages } from '@shared/data/messages'
import { useI18n } from '../lib/i18n'
import { useColors } from '../lib/theme'
import { Item, LCard, Row, Tap, Tic } from '../ui/core'
import { Icon } from '../ui/Icon'
import { Screen } from '../ui/Screen'
import { T } from '../ui/Text'

export function More() {
  const { t } = useI18n()
  const c = useColors()
  const { me, can } = useAuth()
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
    <Screen>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {tiles.map(([to, icon, name, desc, value]) => (
          <Tap key={to} onPress={() => router.push(to as never)}
            style={{ width: '46%', flexGrow: 1, minHeight: 150, justifyContent: 'space-between', gap: 16, backgroundColor: c.surface, borderRadius: 11, padding: 18, borderWidth: 0.5, borderColor: c.hair }}>
            <Row between>
              <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} color={c.accentInk} /></View>
              <Icon name="chev" size={16} color={c.muted} />
            </Row>
            <View style={{ gap: 3 }}><T b size={16}>{name}</T><T v="small" muted numberOfLines={2}>{desc}</T></View>
            {value !== '' && <View><T b num size={22}>{value}</T><T v="small" muted>unread</T></View>}
          </Tap>
        ))}
      </View>
      <T v="eyebrow" style={{ paddingTop: 8 }}>Other functions</T>
      <LCard>
        {rows.map(([to, icon, name, desc, count]) => (
          <Item key={to} onPress={() => router.push(to as never)}>
            <Tic name={icon} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}><T b ell>{name}</T><T v="small" muted ell>{desc}</T></View>
            <T v="small" muted num>{count ?? ''}</T>
            <Icon name="chev" size={16} color={c.muted} />
          </Item>
        ))}
      </LCard>
    </Screen>
  )
}
