// Fetches the contract template, a Google Doc shared as "Anyone with the link can view",
// as HTML so the browser can fill in the placeholders and make the PDF.
//   POST { url } -> { title, html }
// The browser cannot read docs.google.com directly (CORS), so this function does it.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: caller } = await admin.auth.getUser(token)
  if (!caller.user) return json({ error: 'Not signed in' }, 401)
  const { data: me } = await admin.from('profiles').select('status').eq('id', caller.user.id).maybeSingle()
  if (!me || me.status !== 'active') return json({ error: 'Not allowed' }, 403)

  let url = ''
  try { url = String((await req.json()).url ?? '') } catch { /* handled below */ }
  const m = /^https:\/\/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]{20,})/.exec(url.trim())
  if (!m) return json({ error: 'Paste the link of a Google Doc (docs.google.com/document/d/…)' }, 400)

  const res = await fetch(`https://docs.google.com/document/d/${m[1]}/export?format=html`, { redirect: 'follow' })
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.includes('text/html') || new URL(res.url).hostname !== 'docs.google.com') {
    return json({ error: 'Google would not share this document. Open it, choose Share, and set General access to "Anyone with the link" (Viewer).' }, 422)
  }
  const html = await res.text()
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? 'Contract template'
  return json({ title, html })
})
