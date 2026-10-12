// Service worker: keeps the app shell (page, scripts, styles, icons, fonts) on the device so Komjei opens
// instantly and still opens offline. Loan data is never cached here: Supabase requests are cross-origin and
// always go to the network.
//
// The build fills in VERSION and PRECACHE (see vite.config.ts). A new deploy installs a new worker in the
// background; the page tells it to take over the next time the app is closed or hidden, so nobody is
// reloaded in the middle of their work.
const VERSION = /*__VERSION__*/'dev'
const PRECACHE = /*__PRECACHE__*/['/']
const SHELL = 'shell-' + VERSION
const RUNTIME = 'runtime-' + VERSION
const FONTS = 'fonts-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting()
})

/** Cached copy if there is one, otherwise the network (and keep what came back). */
async function cacheFirst(req, cacheName) {
  const hit = await caches.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok || res.type === 'opaque') {
    const copy = res.clone()
    caches.open(cacheName).then((c) => c.put(req, copy))
  }
  return res
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Google Fonts: the font files never change; the stylesheet is refreshed in the background.
  if (url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, FONTS))
    return
  }
  if (url.hostname === 'fonts.googleapis.com') {
    e.respondWith(
      caches.open(FONTS).then(async (c) => {
        const hit = await c.match(req)
        const net = fetch(req).then((res) => { c.put(req, res.clone()); return res }).catch(() => hit)
        return hit || net
      }),
    )
    return
  }
  if (url.origin !== self.location.origin) return

  // Every page of the app is the same shell: serve it from the cache at once, the network only as a fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('/', { cacheName: SHELL })
        .then((hit) => hit || fetch(req))
        .catch(() => caches.match('/')),
    )
    return
  }

  // Built files have content hashes in their names, so a cached copy is always right.
  if (url.pathname.startsWith('/assets/') || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith(cacheFirst(req, RUNTIME))
  }
})
