import { useState, type ReactNode } from 'react'
import { Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, usePathname } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@shared/app/auth'
import { markRead, messageText, useMessages } from '@shared/data/messages'
import { dn, useTeam } from '@shared/data/core'
import { fmtT, loanCode } from '@shared/lib/format'
import { useI18n } from '../lib/i18n'
import { useColors, useTheme, type ThemePref } from '../lib/theme'
import { Avatar } from './Avatar'
import { Btn, Chip, Divider, IconBtn, Row, Tap } from './core'
import { Seg } from './Controls'
import { Icon } from './Icon'
import { T } from './Text'
import { ToastLayer, useOverlayDepth } from './Toast'

const LOGO = require('../../assets/icon.png')

/** Goes back, or to a sensible page when there is nothing to go back to. */
export const goBack = (fallback = '/more') => (router.canGoBack() ? router.back() : router.replace(fallback as never))

/** A sub page's top bar: back button and centred title. */
function SubBar({ title, right }: { title: string; right?: ReactNode }) {
  const { t } = useI18n()
  return (
    <Row style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
      <IconBtn name="back" label={t('back')} onPress={() => goBack()} />
      <T v="h3" size={17} center ell style={{ flex: 1 }}>{title}</T>
      {right ?? <View style={{ width: 40 }} />}
    </Row>
  )
}

/** The main pages' top bar: logo, greeting, messages bell and account menu. */
function MainBar({ subtitle }: { subtitle: string }) {
  const c = useColors()
  const { t } = useI18n()
  const { me } = useAuth()
  const msgs = useMessages()
  const unread = (msgs.data ?? []).filter((m) => !m.read)
  const [menu, setMenu] = useState<null | 'msg' | 'profile'>(null)
  return (
    <Row style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 }}>
      <Image source={LOGO} style={{ width: 40, height: 40, borderRadius: 9 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T b size={17} ell>{t('appname')}</T>
        <T v="small" muted ell>{subtitle}</T>
      </View>
      <View>
        <IconBtn name="msg" label="Messages" onPress={() => setMenu('msg')} />
        {unread.length > 0 && (
          <View pointerEvents="none" style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 99, backgroundColor: c.late, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.surface }}>
            <T b size={10} color="#fff">{unread.length}</T>
          </View>
        )}
      </View>
      <Tap onPress={() => setMenu('profile')} accessibilityLabel="Account menu" style={{ borderRadius: 22, borderWidth: 2, borderColor: c.line }}>
        <Avatar p={me} size="sm" />
      </Tap>
      {menu && <Menu kind={menu} onClose={() => setMenu(null)} />}
    </Row>
  )
}

function Menu({ kind, onClose }: { kind: 'msg' | 'profile'; onClose: () => void }) {
  const c = useColors()
  const { t, lang, setLang } = useI18n()
  const { pref, setPref } = useTheme()
  const { me, role, signOut } = useAuth()
  const msgs = useMessages()
  const team = useTeam()
  const qc = useQueryClient()
  const insets = useSafeAreaInsets()
  const level = useOverlayDepth()
  const unread = (msgs.data ?? []).filter((m) => !m.read)
  const name = (id: string | null) => dn((team.data ?? []).find((p) => p.id === id))
  const go = (to: string) => { onClose(); router.push(to as never) }
  const mi = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 5 }
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.backdrop }]} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ position: 'absolute', right: 16, left: 16, top: insets.top + 62, alignItems: 'flex-end' }}>
        <View style={{ width: '100%', maxWidth: 340, backgroundColor: c.surface, borderRadius: 9, padding: 6 }}>
          {kind === 'msg' ? (
            <>
              <Row between style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 }}>
                <T b>{t('messages')}</T>
                {unread.length
                  ? <Tap onPress={async () => { await markRead(unread.map((m) => m.id)); qc.invalidateQueries({ queryKey: ['messages'] }) }}><T b={600} size={13} color={c.accentText}>Mark all read</T></Tap>
                  : <T v="small" muted>All read</T>}
              </Row>
              {(msgs.data ?? []).slice(0, 3).map((m) => (
                <Tap key={m.id} onPress={() => go('/messages')} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.track, alignItems: 'center', justifyContent: 'center' }}><T b>{name(m.actor)[0]}</T></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Row between><T b ell style={{ flex: 1 }}>{name(m.actor)}</T><T v="small" muted>{fmtT(m.created_at)}</T></Row>
                    <T v="small" muted numberOfLines={2}>{messageText(m, m.loan_id ? loanCode(m.loan_id) : '')}</T>
                  </View>
                  {!m.read && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.accent, marginTop: 6 }} />}
                </Tap>
              ))}
              <Divider style={{ marginVertical: 6, marginHorizontal: -6 }} />
              <Btn kind="primary" label="Open Messages" onPress={() => go('/messages')} />
            </>
          ) : me && (
            <>
              <Tap onPress={() => go('/profile')} style={[mi, { alignItems: 'flex-start' }]}>
                <Avatar p={me} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T b>{dn(me)}</T>
                  <T v="small" muted>@{me.username}</T>
                  <Chip kind={role?.locked ? 'approved' : 'verified'} label={role?.name ?? ''} style={{ marginTop: 4 }} />
                </View>
                <Icon name="chev" size={16} color={c.muted} />
              </Tap>
              <Divider style={{ marginVertical: 6, marginHorizontal: -6 }} />
              <View style={mi}>
                <Icon name="globe" size={18} /><T style={{ flex: 1 }}>Language</T>
                <Seg compact options={[{ value: 'en', label: 'EN' }, { value: 'km', label: 'ខ្មែរ' }]} value={lang} onChange={(v) => setLang(v as 'en' | 'km')} />
              </View>
              <View style={mi}>
                <Icon name="theme" size={18} /><T style={{ flex: 1 }}>Theme</T>
                <Seg compact options={(['light', 'dark', 'auto'] as ThemePref[]).map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))} value={pref} onChange={(v) => setPref(v as ThemePref)} />
              </View>
              <Divider style={{ marginVertical: 6, marginHorizontal: -6 }} />
              <Tap onPress={() => go('/more')} style={mi}><Icon name="hub" size={18} /><T style={{ flex: 1 }}>More</T></Tap>
              <Tap onPress={() => go('/messages')} style={mi}>
                <Icon name="msg" size={18} /><T style={{ flex: 1 }}>{t('messages')}</T>
                {unread.length > 0 && <Chip kind="requested" label={String(unread.length)} />}
              </Tap>
              <Divider style={{ marginVertical: 6, marginHorizontal: -6 }} />
              <Tap onPress={() => { onClose(); void signOut() }} style={mi}><Icon name="out" size={18} color={c.late} /><T color={c.late} style={{ flex: 1 }}>Sign out</T></Tap>
            </>
          )}
        </View>
      </View>
      <ToastLayer level={level} />
    </Modal>
  )
}

const MAIN_LABEL: Record<string, string> = { '/': 'home', '/cashflow': 'payTab', '/loans': 'loans', '/reports': 'reports', '/more': 'more' }

/**
 * One screen: the top bar, a scrolling page with pull to refresh, and anything pinned (`header`, `overlay`).
 * Without a title it is a main tab page with the logo bar.
 */
export function Screen({ title, children, header, overlay, scroll = true, onRefresh, right, contentStyle }: {
  title?: string; children?: ReactNode; header?: ReactNode; overlay?: ReactNode; scroll?: boolean
  onRefresh?: () => Promise<unknown>; right?: ReactNode; contentStyle?: StyleProp<ViewStyle>
}) {
  const c = useColors()
  const { t } = useI18n()
  const { me } = useAuth()
  const insets = useSafeAreaInsets()
  const path = usePathname()
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)
  const refresh = async () => {
    setRefreshing(true)
    try { await (onRefresh ? onRefresh() : qc.invalidateQueries()) } finally { setRefreshing(false) }
  }
  const subtitle = path === '/' ? `${t('hello')}, ${dn(me)}` : t(MAIN_LABEL[path] ?? 'more')
  const body = [{ padding: 16, paddingTop: 8, gap: 16, paddingBottom: 96 }, contentStyle]
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      {title === undefined ? <MainBar subtitle={subtitle} /> : <SubBar title={title} right={right} />}
      {header && <View style={{ paddingHorizontal: 16 }}>{header}</View>}
      {scroll
        ? (
          <ScrollView
            style={{ flex: 1 }} contentContainerStyle={body} keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.muted} colors={[c.accent]} />}
          >
            {children}
          </ScrollView>
        )
        : <View style={[{ flex: 1 }, contentStyle]}>{children}</View>}
      {overlay}
      {title !== undefined && <ToastLayer bottom={24} />}
    </View>
  )
}
