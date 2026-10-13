import { StyleSheet, View } from 'react-native'
import { Tabs } from 'expo-router/js-tabs'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@shared/app/auth'
import { supabase } from '@shared/lib/supabase'
import { NAV_ICONS } from '@shared/ui/navIcons'
import { useI18n } from '../../lib/i18n'
import { useColors } from '../../lib/theme'
import { Tap } from '../../ui/core'
import { PathIcon } from '../../ui/Icon'
import { T } from '../../ui/Text'
import { ToastLayer } from '../../ui/Toast'

const ROUTE: Record<string, string> = { dashboard: 'index', payments: 'cashflow', loans: 'loans', reports: 'reports', hub: 'more' }
const LABEL: Record<string, string> = { dashboard: 'home', payments: 'payTab', hub: 'more' }

/** Loans waiting for approval, shown as a red dot on the Loans tab. */
function usePendingApproval() {
  const { can } = useAuth()
  const q = useQuery({
    queryKey: ['pending-approval'],
    enabled: can('loans.approve'),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase.from('loans').select('id', { count: 'exact', head: true }).eq('status', 'requested').is('voided_at', null)
      return count ?? 0
    },
  })
  return can('loans.approve') && (q.data ?? 0) > 0
}

function TabBar({ state, navigation }: BottomTabBarProps) {
  const c = useColors()
  const { t } = useI18n()
  const { can } = useAuth()
  const insets = useSafeAreaInsets()
  const pending = usePendingApproval()
  const current = state.routes[state.index]?.name
  const items = NAV_ICONS.filter(([k]) => k !== 'reports' || can('reports.view'))
  return (
    <View style={{ flexDirection: 'row', gap: 2, paddingHorizontal: 6, paddingBottom: insets.bottom, backgroundColor: c.glass, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hair }}>
      {items.map(([k, outline, filled]) => {
        const name = ROUTE[k]
        const on = current === name
        return (
          <Tap key={k} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t(LABEL[k] ?? k)}
            onPress={() => {
              const route = state.routes.find((r) => r.name === name)
              const e = navigation.emit({ type: 'tabPress', target: route?.key, canPreventDefault: true })
              if (!on && !e.defaultPrevented) navigation.navigate(name)
            }}
            style={{ flex: 1, alignItems: 'center', gap: 3, paddingTop: 8, paddingBottom: 12 }}>
            <PathIcon paths={on ? filled : outline} color={on ? c.accent : c.muted} />
            <T size={11} b={on ? 700 : 500} color={on ? c.accentText : c.muted}>{t(LABEL[k] ?? k)}</T>
            {k === 'loans' && pending && <View accessibilityLabel="Loans waiting for approval" style={{ position: 'absolute', top: 6, left: '50%', marginLeft: 6, width: 9, height: 9, borderRadius: 5, backgroundColor: c.late, borderWidth: 2, borderColor: c.surface }} />}
            {on && <View style={{ position: 'absolute', bottom: 0, width: 48, height: 4, borderTopLeftRadius: 99, borderTopRightRadius: 99, backgroundColor: c.accent }} />}
          </Tap>
        )
      })}
    </View>
  )
}

export default function TabsLayout() {
  const c = useColors()
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="cashflow" />
        <Tabs.Screen name="loans" />
        <Tabs.Screen name="reports" />
        <Tabs.Screen name="more" />
      </Tabs>
      <ToastLayer bottom={84} />
    </View>
  )
}
