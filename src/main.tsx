import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles.css'
import { App } from './App'
import { I18nProvider, applyTheme, savedTheme } from './app/i18n'
import { AuthProvider } from './app/auth'
import { ToastProvider } from './ui/Toast'
import { initFeel } from './lib/feel'

applyTheme(savedTheme())
initFeel()
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <I18nProvider>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </I18nProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

// iOS Safari ignores user-scalable=no, so block the pinch gesture itself
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault())

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => { void registerShell() })
}

/**
 * Registers the service worker that keeps the app shell on the device. A new version downloads in the
 * background and takes over when the app is next hidden or closed, then the app reloads unseen.
 */
async function registerShell() {
  const reg = await navigator.serviceWorker.register('/sw.js').catch(() => null)
  if (!reg) return
  const hadWorker = !!navigator.serviceWorker.controller
  const activateWaiting = () => { if (document.hidden && reg.waiting) reg.waiting.postMessage('SKIP_WAITING') }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) activateWaiting()
    else void reg.update().catch(() => {})
  })
  reg.addEventListener('updatefound', () => {
    reg.installing?.addEventListener('statechange', activateWaiting)
  })
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // the first install takes control without a reload; later updates reload while the app is out of sight
    if (!hadWorker) return
    if (document.hidden) location.reload()
    else document.addEventListener('visibilitychange', () => location.reload(), { once: true })
  })
}
