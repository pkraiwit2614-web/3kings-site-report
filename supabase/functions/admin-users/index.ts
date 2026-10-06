import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const OWNER_ID = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'
const INTERNAL_DOMAIN = '3kings.invalid'
const VALID_ROLES = new Set(['manager', 'admin', 'viewer', 'viewer_editor', 'defect_contributor', 'defect_editor', 'purchase', 'engineer', 'foreman', 'payroll'])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function getSecretKey() {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.default) return String(parsed.default)
    } catch {}
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
}

function getPublishableKey() {
  const raw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.default) return String(parsed.default)
    } catch {}
  }
  return Deno.env.get('SUPABASE_ANON_KEY') || ''
}

function normalizeUsername(value: unknown) {
  return String(value || '').trim().toUpperCase()
}

function validUsername(username: string) {
  return /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(username)
}

function internalEmail(username: string) {
  return `${username.toLowerCase()}@${INTERNAL_DOMAIN}`
}

function validPassword(value: unknown) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128
}

function randomPart(length = 5) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

function starterPassword(username: string) {
  return `K3-${username.replace('USER', 'U')}-${randomPart()}!`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const secretKey = getSecretKey()
  const publishableKey = getPublishableKey()
  if (!supabaseUrl || !secretKey || !publishableKey) return json({ ok: false, error: 'server_config_missing' }, 500)

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401)

  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  const caller = userData.user
  if (userError || !caller) return json({ ok: false, error: 'unauthorized' }, 401)

  const { data: callerProfile, error: callerProfileError } = await admin
    .from('profiles')
    .select('role,active')
    .eq('user_id', caller.id)
    .maybeSingle()
  if (callerProfileError || !callerProfile?.active || callerProfile.role !== 'manager' || caller.id !== OWNER_ID) {
    return json({ ok: false, error: 'forbidden' }, 403)
  }

  const manager = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let payload: any = {}
  try { payload = await req.json() } catch { return json({ ok: false, error: 'invalid_json' }, 400) }
  const action = String(payload?.action || 'list')

  if (action === 'list') {
    const { data, error } = await admin
      .from('profiles')
      .select('user_id,username,email,full_name,phone,role,active,created_at,updated_at')
      .order('created_at', { ascending: true })
    if (error) return json({ ok: false, error: error.message }, 400)
    return json({ ok: true, users: data || [] })
  }

  if (action === 'create') {
    const username = normalizeUsername(payload?.username)
    const fullName = String(payload?.full_name || username).trim().slice(0, 120)
    const role = String(payload?.role || 'viewer').toLowerCase()
    const password = String(payload?.password || '')
    if (!validUsername(username)) return json({ ok: false, error: 'invalid_username' }, 400)
    if (!VALID_ROLES.has(role) || role === 'manager') return json({ ok: false, error: 'invalid_role' }, 400)
    if (!validPassword(password)) return json({ ok: false, error: 'invalid_password' }, 400)

    const email = internalEmail(username)
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { provisioned_by_admin: true, app_role: role, username },
    })
    if (error || !data.user) return json({ ok: false, error: error?.message || 'create_failed' }, 400)

    const { error: accessError } = await manager.rpc('owner_set_profile_access', {
      p_user_id: data.user.id,
      p_role: role,
      p_active: true,
    })
    if (accessError) {
      await admin.auth.admin.deleteUser(data.user.id)
      return json({ ok: false, error: accessError.message }, 400)
    }

    return json({ ok: true, user: { user_id: data.user.id, username, full_name: fullName, role, active: true } })
  }

  if (action === 'update') {
    const target = String(payload?.user_id || '')
    if (!target || target === OWNER_ID) return json({ ok: false, error: 'invalid_target' }, 400)
    const { data: current, error: currentError } = await admin
      .from('profiles')
      .select('user_id,username,full_name,role,active')
      .eq('user_id', target)
      .maybeSingle()
    if (currentError || !current) return json({ ok: false, error: 'user_not_found' }, 404)

    const username = payload?.username === undefined ? current.username : normalizeUsername(payload.username)
    const fullName = payload?.full_name === undefined ? current.full_name : String(payload.full_name || '').trim().slice(0, 120)
    const role = payload?.role === undefined ? current.role : String(payload.role || '').toLowerCase()
    const active = payload?.active === undefined ? current.active : Boolean(payload.active)
    if (username && !validUsername(username)) return json({ ok: false, error: 'invalid_username' }, 400)
    if (!VALID_ROLES.has(role) || role === 'manager') return json({ ok: false, error: 'invalid_role' }, 400)

    if (username && username !== current.username) {
      const { error: authError } = await admin.auth.admin.updateUserById(target, {
        email: internalEmail(username),
        email_confirm: true,
        user_metadata: { full_name: fullName || username },
        app_metadata: { provisioned_by_admin: true, app_role: role, username },
      })
      if (authError) return json({ ok: false, error: authError.message }, 400)
    } else {
      const { error: authMetaError } = await admin.auth.admin.updateUserById(target, {
        user_metadata: { full_name: fullName || username || current.full_name },
        app_metadata: { provisioned_by_admin: true, app_role: role, username: username || current.username },
      })
      if (authMetaError) return json({ ok: false, error: authMetaError.message }, 400)
    }

    const { error: profileError } = await admin.from('profiles').update({
      username: username || null,
      full_name: fullName || username || null,
      email: username ? internalEmail(username) : null,
    }).eq('user_id', target)
    if (profileError) return json({ ok: false, error: profileError.message }, 400)

    const { error: accessError } = await manager.rpc('owner_set_profile_access', {
      p_user_id: target,
      p_role: role,
      p_active: active,
    })
    if (accessError) return json({ ok: false, error: accessError.message }, 400)

    return json({ ok: true })
  }

  if (action === 'reset_password') {
    const target = String(payload?.user_id || '')
    const password = String(payload?.password || '')
    if (!target || target === OWNER_ID || !validPassword(password)) return json({ ok: false, error: 'invalid_request' }, 400)
    const { error } = await admin.auth.admin.updateUserById(target, { password })
    if (error) return json({ ok: false, error: error.message }, 400)
    return json({ ok: true })
  }

  if (action === 'seed_initial') {
    const credentials: Array<{ username: string; password: string; role: string; full_name: string }> = []
    const skipped: string[] = []
    const seeds = [
      ...Array.from({ length: 20 }, (_, i) => {
        const n = i + 1
        const username = `USER${String(n).padStart(2, '0')}`
        return { username, full_name: `ผู้ใช้งาน ${String(n).padStart(2, '0')}`, role: n <= 10 ? 'foreman' : 'viewer' }
      }),
      { username: 'AI-VIEWER', full_name: 'AI System Viewer', role: 'viewer' },
    ]

    const { data: existing } = await admin.from('profiles').select('username').not('username', 'is', null)
    const existingSet = new Set((existing || []).map((x: any) => String(x.username || '').toUpperCase()))

    for (const seed of seeds) {
      if (existingSet.has(seed.username)) { skipped.push(seed.username); continue }
      const password = starterPassword(seed.username)
      const { data, error } = await admin.auth.admin.createUser({
        email: internalEmail(seed.username),
        password,
        email_confirm: true,
        user_metadata: { full_name: seed.full_name },
        app_metadata: { provisioned_by_admin: true, app_role: seed.role, username: seed.username },
      })
      if (error || !data.user) return json({ ok: false, error: error?.message || `seed_failed:${seed.username}`, credentials, skipped }, 400)
      credentials.push({ ...seed, password })
      existingSet.add(seed.username)
    }
    return json({ ok: true, credentials, skipped })
  }

  return json({ ok: false, error: 'unknown_action' }, 400)
})
