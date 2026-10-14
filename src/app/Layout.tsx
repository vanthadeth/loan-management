import { createPortal } from 'react-dom'
import { lockScroll } from '../lib/lock'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../ui/Icon'
import { NAV_ICONS } from '../ui/navIcons'
import { Avatar } from '../ui/Avatar'
import { useAuth } from './auth'
import { applyTheme, savedTheme, useI18n, type Theme } from './i18n'
import { markRead, messageText, useMessages } from '../data/messages'
import { dn, useTeam } from '../data/core'
import { supabase } from '../lib/supabase'
import { fmtT, loanCode } from '../lib/format'

const TitleCtx = createContext<(t: string | null) => void>(() => {})
/** Sub pages call this to show a back button and a centered title in the top bar. */
export function usePageTitle(title: string | null) {
  const set = useContext(TitleCtx)
  useLayoutEffect(() => {
    set(title)
    return () => set(null)
  }, [title, set])
}

const ActionSlotCtx = createContext<HTMLElement | null>(null)
/** The empty space at the right of a sub page's title bar; a page portals its action button into it. */
export const useActionSlot = () => useContext(ActionSlotCtx)

const ROUTES: Record<string, string> = { dashboard: '/', payments: '/cashflow', loans: '/loans', reports: '/reports', hub: '/more' }
const NAV_LABEL: Record<string, string> = { dashboard: 'home', payments: 'payTab', hub: 'more' }

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

export function Layout() {
  const { t, lang, setLang } = useI18n()
  const { me, role, can, signOut } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const qc = useQueryClient()
  const [title, setTitle] = useState<string | null>(null)
  const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null)
  const [menu, setMenu] = useState<null | 'msg' | 'profile'>(null)
  const [theme, setTheme] = useState<Theme>(savedTheme())
  const appRef = useRef<HTMLDivElement>(null)
  const [barsHidden, setBarsHidden] = useState(false)
  const pending = usePendingApproval()
  const msgs = useMessages()
  const team = useTeam()
  const unread = (msgs.data ?? []).filter((m) => !m.read)

  useEffect(() => { setMenu(null) }, [loc.pathname])
  // each page rises in, its blocks one after another
  useEffect(() => {
    const view = document.getElementById('view')
    if (!view) return
    view.classList.remove('enter')
    Array.from(view.children).slice(0, 10).forEach((el, i) => (el as HTMLElement).style.setProperty('--i', String(i)))
    void view.offsetWidth
    view.classList.add('enter')
  }, [loc.pathname])

  // Mobile bars: keep content clear of the fixed top bar / nav, and hide them while scrolling down.
  useEffect(() => {
    const app = appRef.current
    const main = app?.querySelector('main')
    const top = app?.querySelector<HTMLElement>('.top')
    const navEl = app?.querySelector<HTMLElement>('.nav')
    if (!app || !main || !top || !navEl) return
    const measure = () => {
      app.style.setProperty('--top-h', top.offsetHeight + 'px')
      app.style.setProperty('--nav-h', navEl.offsetHeight + 'px')
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(top)
    ro.observe(navEl)
    let last = main.scrollTop
    const onScroll = () => {
      const y = main.scrollTop
      const d = y - last
      if (y <= 12) setBarsHidden(false)
      else if (d > 8) { setBarsHidden(true); setMenu(null) }
      else if (d < -8) setBarsHidden(false)
      if (Math.abs(d) > 8 || y <= 12) last = y
    }
    main.addEventListener('scroll', onScroll, { passive: true })
    return () => { ro.disconnect(); main.removeEventListener('scroll', onScroll) }
  }, [title])

  useEffect(() => { setBarsHidden(false) }, [loc.pathname])
  useEffect(() => (menu ? lockScroll() : undefined), [menu])
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menu && !(e.target as Element).closest('.menu, [data-menu]')) setMenu(null)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menu])

  const path = loc.pathname
  const current = path === '/' ? 'dashboard'
    : path.startsWith('/cashflow') ? 'payments'
    : path.startsWith('/loans') ? 'loans'
    : path.startsWith('/reports') ? 'reports' : 'hub'
  const sub = title !== null
  const items = NAV_ICONS.filter(([k]) => k !== 'reports' || can('reports.view'))
  const subtitle = current === 'dashboard' ? `${t('hello')}, ${dn(me)}` : t(NAV_LABEL[current] ?? current)
  const name = (id: string | null) => dn((team.data ?? []).find((p) => p.id === id))
  const go = (to: string) => { setMenu(null); nav(to) }

  return (
    <TitleCtx.Provider value={setTitle}>
      <ActionSlotCtx.Provider value={actionSlot}>
      <div className={'app' + (barsHidden ? ' bars-hidden' : '')} ref={appRef}>
        <header className={'top' + (sub ? ' centered' : '')} id="top">
          {sub ? (
            <>
              <button className="icon-btn" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/more'))} aria-label={t('back')}><Icon name="back" /></button>
              <h1 className="tt ell">{title}</h1>
              <span ref={setActionSlot} style={{ width: 40, display: 'flex', justifyContent: 'flex-end' }} />
            </>
          ) : (
            <>
              <img className="logo-img" src="/icon.svg" width={40} height={40} alt="" />
              <div className="hello"><b className="ell">{t('appname')}</b><span className="small muted ell">{subtitle}</span></div>
              <span ref={setActionSlot} style={{ display: 'contents' }} />
              <button className="icon-btn bell" data-menu onClick={() => setMenu(menu === 'msg' ? null : 'msg')} aria-haspopup="dialog" aria-expanded={menu === 'msg'} aria-label="Messages">
                <Icon name="msg" />{unread.length > 0 && <i className="ncount">{unread.length}</i>}
              </button>
              <button className="avatar sm badge" data-menu onClick={() => setMenu(menu === 'profile' ? null : 'profile')} aria-haspopup="menu" aria-expanded={menu === 'profile'} aria-label="Account menu">
                <Avatar p={me} size="bare" />
              </button>
            </>
          )}
          {menu === 'msg' && createPortal(
            <><div className="float-mask" onClick={(e) => { e.stopPropagation(); setMenu(null) }} aria-hidden="true" /><div className="menu" role="dialog" aria-label="Recent messages">
              <div className="row between" style={{ padding: '8px 10px 4px' }}>
                <b>{t('messages')}</b>
                {unread.length ? <button className="linkbtn" onClick={async () => { await markRead(unread.map((m) => m.id)); qc.invalidateQueries({ queryKey: ['messages'] }) }}>Mark all read</button> : <span className="small muted">All read</span>}
              </div>
              {(msgs.data ?? []).slice(0, 3).map((m) => (
                <button className="mrow" key={m.id} onClick={() => go('/messages')}>
                  <span className="avatar sm">{name(m.actor)[0]}</span>
                  <span className="grow">
                    <span className="row between"><b className="ell">{name(m.actor)}</b><span className="small muted">{fmtT(m.created_at)}</span></span>
                    <span className="small muted clamp2">{messageText(m, m.loan_id ? loanCode(m.loan_id) : '')}</span>
                  </span>
                  {!m.read && <i className="udot" />}
                </button>
              ))}
              <div className="mdiv" style={{ margin: '6px 0' }} />
              <button className="btn primary" style={{ width: '100%', marginTop: 0 }} onClick={() => go('/messages')}>Open Messages</button>
            </div></>
          , document.body)}
          {menu === 'profile' && me && createPortal(
            <><div className="float-mask" onClick={(e) => { e.stopPropagation(); setMenu(null) }} onPointerDown={(e) => e.stopPropagation()} aria-hidden="true" /><div className="menu" role="menu" aria-label="Account menu">
              <button className="mi pcard" role="menuitem" onClick={() => go('/profile')}>
                <Avatar p={me} />
                <span className="grow"><b style={{ display: 'block' }}>{dn(me)}</b><span className="small muted">@{me.username}</span>
                  <span style={{ display: 'block', marginTop: 4 }}><span className={'chip ' + (role?.locked ? 'approved' : 'verified')}>{role?.name}</span></span></span>
                <Icon name="chev" size={16} />
              </button>
              <div className="mdiv" />
              <div className="mi static"><span className="grow"><Icon name="globe" size={18} /><span>Language</span></span>
                <div className="seg"><button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button><button aria-pressed={lang === 'km'} onClick={() => setLang('km')}>ខ្មែរ</button></div></div>
              <div className="mi static"><span className="grow"><Icon name="theme" size={18} /><span>Theme</span></span>
                <div className="seg">{(['light', 'dark', 'auto'] as Theme[]).map((k) => <button key={k} aria-pressed={theme === k} onClick={() => { setTheme(k); applyTheme(k) }}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div></div>
              <div className="mdiv" />
              <button className="mi" role="menuitem" onClick={() => go('/more')}><span className="grow"><Icon name="hub" size={18} /><span>More</span></span></button>
              <button className="mi" role="menuitem" onClick={() => go('/messages')}><span className="grow"><Icon name="msg" size={18} /><span>{t('messages')}</span></span>{unread.length > 0 && <span className="chip requested">{unread.length}</span>}</button>
              <div className="mdiv" />
              <button className="mi danger" role="menuitem" onClick={() => signOut()}><span className="grow"><Icon name="out" size={18} /><span>Sign out</span></span></button>
            </div></>
          , document.body)}
        </header>
        <nav className="nav" id="nav">
          {items.map(([k, outline, filled]) => (
            <button key={k} aria-current={current === k ? 'page' : undefined} onClick={() => nav(ROUTES[k])}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                dangerouslySetInnerHTML={{ __html: current === k ? filled : outline }} />
              {t(NAV_LABEL[k] ?? k)}
              {k === 'loans' && pending && <i className="ndot" role="img" aria-label="Loans waiting for approval" />}
            </button>
          ))}
        </nav>
        <main id="main"><div className="wrap" id="view"><Outlet /></div></main>
      </div>
      </ActionSlotCtx.Provider>
    </TitleCtx.Provider>
  )
}
