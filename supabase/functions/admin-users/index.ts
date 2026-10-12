// Admin-only user management. Only this function holds the service role key:
//   create          { username, full_name (Khmer name), name_latin?, display_name?, gender?, dob?, address?, role_id }
//                   -> { user_id, username, temp_password }
//   reset_password  { user_id }                -> { temp_password }
//   set_status      { user_id, status }        -> { ok: true }   (active | suspended | discharged)
// The caller must hold the users.manage permission (or the locked Admin role).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no look-alikes
function tempPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const c = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length])
  return c.slice(0, 4).join('') + '-' + c.slice(4).join('')
}
const emailOf = (u: string) => `${u}@loans.local`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: caller } = await admin.auth.getUser(token)
  if (!caller.user) return json({ error: 'Not signed in' }, 401)

  const { data: me } = await admin.from('profiles').select('id,status,role_id,role:roles(locked)').eq('id', caller.user.id).maybeSingle()
  if (!me || me.status !== 'active') return json({ error: 'Not allowed' }, 403)
  let allowed = (me.role as unknown as { locked: boolean } | null)?.locked === true
  if (!allowed) {
    const { data: rp } = await admin.from('role_permissions').select('permission')
      .eq('permission', 'users.manage').eq('role_id', me.role_id)
    allowed = (rp ?? []).length > 0
  }
  if (!allowed) return json({ error: 'You do not have permission to manage users' }, 403)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid request' }, 400) }

  if (body.action === 'create') {
    const username = String(body.username ?? '').trim().toLowerCase()
    const fullName = String(body.full_name ?? '').trim()
    const roleId = String(body.role_id ?? '')
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return json({ error: 'Username must be 3–32 letters, numbers, dots, dashes or underscores' }, 400)
    if (!fullName) return json({ error: 'Enter the name in Khmer' }, 400)
    const { data: role } = await admin.from('roles').select('id').eq('id', roleId).maybeSingle()
    if (!role) return json({ error: 'Choose a role' }, 400)
    const { data: taken } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
    if (taken) return json({ error: 'That username is already used' }, 409)

    const password = tempPassword()
    const created = await admin.auth.admin.createUser({ email: emailOf(username), password, email_confirm: true })
    if (created.error || !created.data.user) return json({ error: created.error?.message ?? 'Could not create the user' }, 400)
    const uid = created.data.user.id
    const { error } = await admin.from('profiles').insert({
      id: uid, username, full_name: fullName,
      display_name: String(body.display_name ?? '').trim(),
      name_latin: String(body.name_latin ?? '').trim(),
      gender: body.gender === 'F' || body.gender === 'M' ? body.gender : null,
      dob: body.dob ? String(body.dob) : null,
      address: String(body.address ?? '').trim(),
      role_id: roleId, status: 'active', must_change_password: true,
    })
    if (error) {
      await admin.auth.admin.deleteUser(uid)
      return json({ error: error.message }, 400)
    }
    return json({ user_id: uid, username, temp_password: password })
  }

  if (body.action === 'reset_password' || body.action === 'set_status') {
    const uid = String(body.user_id ?? '')
    if (uid === me.id) return json({ error: 'You cannot do this to your own account' }, 400)
    const { data: target } = await admin.from('profiles').select('id').eq('id', uid).maybeSingle()
    if (!target) return json({ error: 'User not found' }, 404)

    if (body.action === 'reset_password') {
      const password = tempPassword()
      const r = await admin.auth.admin.updateUserById(uid, { password })
      if (r.error) return json({ error: r.error.message }, 400)
      await admin.from('profiles').update({ must_change_password: true }).eq('id', uid)
      return json({ temp_password: password })
    }
    const status = String(body.status)
    if (!['active', 'suspended', 'discharged'].includes(status)) return json({ error: 'Invalid status' }, 400)
    // a blocked account cannot sign in at all; reactivating lifts the block
    const r = await admin.auth.admin.updateUserById(uid, { ban_duration: status === 'active' ? 'none' : '876000h' })
    if (r.error) return json({ error: r.error.message }, 400)
    await admin.from('profiles').update({ status }).eq('id', uid)
    return json({ ok: true })
  }
  return json({ error: 'Unknown action' }, 400)
})
