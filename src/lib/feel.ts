// Touch feedback: a short vibration and a ripple on taps. Vibration works on Android browsers and installed apps;
// iPhones do not allow web pages to vibrate, so there the ripple and animations are the feedback.

const KEY = 'komjei-haptics'
const PATTERNS = { light: 8, medium: 16, success: [10, 40, 10], error: [30, 50, 30, 50, 30] } as const
export type Haptic = keyof typeof PATTERNS

export function hapticsOn() {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}
export function setHaptics(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* private mode */ }
  if (on) haptic('success')
}

export function haptic(kind: Haptic = 'light') {
  if (!hapticsOn() || typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  try { navigator.vibrate(PATTERNS[kind] as number | number[]) } catch { /* not allowed */ }
}

/** Toast text that reports a problem, as opposed to a success. */
export const isProblem = (m: string) => /not allowed|could not|couldn't|failed|error|wrong|invalid|check |select |enter |choose |give |required|already|no longer|cannot|can't/i.test(m)

const TAP = 'button, a.btn, a.mcta, .item, .tab, summary, [role="button"], .dd-opt'
const RIPPLE = '.btn, .mcta, .fab, .hbtn, .tab, .icon-btn'

/** One listener for the whole app: vibrate on every tap and draw a ripple on buttons. */
export function initFeel() {
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Element | null
    const hit = t?.closest(TAP) as HTMLElement | null
    if (!hit || (hit as HTMLButtonElement).disabled) return
    haptic('light')
    const host = (t?.closest(RIPPLE) as HTMLElement | null)
    if (!host || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = host.getBoundingClientRect()
    const size = Math.max(r.width, r.height) * 2
    const dot = document.createElement('span')
    dot.className = 'rip'
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`
    host.append(dot)
    setTimeout(() => dot.remove(), 600)
  }, { passive: true })
}
