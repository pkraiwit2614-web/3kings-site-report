const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync('lib/changeOwnPassword.ts', 'utf8')
const account = fs.readFileSync('app/account/page.tsx', 'utf8')
const shell = fs.readFileSync('components/AppShell.tsx', 'utf8')
const accessSource = fs.readFileSync('lib/accessControl.ts', 'utf8')
const adminUsers = fs.readFileSync('supabase/functions/admin-users/index.ts', 'utf8')

function load(file, deps = {}) {
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, require: id => {
      if (id in deps) return deps[id]
      throw Error('Unexpected import: ' + id)
    },
  })
  return mod.exports
}

function fixture({ oldValid = true, verifiedUserId = 'u-1', active = true, profileError = null } = {}) {
  const events = []
  const main = {
    supabaseUrl: 'https://example.supabase.co', supabaseKey: 'anon-key',
    auth: { getUser: async () => ({ data: { user: { id: 'u-1', email: 'user01@3kings.invalid' } }, error: null }) },
    from: table => {
      assert.equal(table, 'profiles')
      return { select: fields => {
        assert.equal(fields, 'active')
        return { eq: (field, value) => {
          assert.equal(field, 'user_id');assert.equal(value, 'u-1')
          return { maybeSingle: async () => ({ data: { active }, error: profileError }) }
        } }
      } }
    },
  }
  const verifier = {
    auth: {
      signInWithPassword: async creds => {
        events.push({ type: 'verify', email: creds.email, correct: creds.password === 'old-value' })
        return oldValid ? { data: { user: { id: verifiedUserId } }, error: null } : { data: { user: null }, error: Error('Invalid login credentials') }
      },
      updateUser: async details => {
        events.push({ type: 'update', ...details })
        return { error: null }
      },
      signOut: async options => { events.push({ type: 'signout', ...options }) },
    },
  }
  const change = load('lib/changeOwnPassword.ts', {
    '@/lib/supabase': { getSupabase: () => main },
    '@supabase/supabase-js': { createClient: (url, key, opts) => {
      assert.equal(url, main.supabaseUrl); assert.equal(key, main.supabaseKey)
      assert.equal(opts.auth.persistSession, false)
      assert.equal(opts.auth.autoRefreshToken, false)
      assert.equal(opts.auth.detectSessionInUrl, false)
      return verifier
    } },
  }).changeOwnPassword
  return { change, events }
}

test('optional self change verifies old password, changes matching identity only, and closes isolated session', async () => {
  const { change, events } = fixture()
  assert.equal(await change('old-value', 'New-value-12345'), 'u-1')
  assert.deepEqual(events.map(event => event.type), ['verify', 'update', 'signout'])
  assert.equal(events[1].password, 'New-value-12345')
  assert.equal(events[2].scope, 'local')
})
test('wrong current password cannot change credentials', async () => {
  const { change, events } = fixture({ oldValid: false })
  await assert.rejects(change('wrong-value', 'New-value-12345'), /รหัสผ่านปัจจุบัน/)
  assert.deepEqual(events.map(event => event.type), ['verify', 'signout'])
})
test('identity mismatch cannot change credentials', async () => {
  const { change, events } = fixture({ verifiedUserId: 'attacker-user' })
  await assert.rejects(change('old-value', 'New-value-12345'), /รหัสผ่านปัจจุบัน/)
  assert.deepEqual(events.map(event => event.type), ['verify', 'signout'])
})
test('inactive profile cannot change credentials', async () => {
  const { change, events } = fixture({ active: false })
  await assert.rejects(change('old-value', 'New-value-12345'), /ไม่ได้รับอนุญาต/)
  assert.equal(events.length, 0)
})
test('reject weak or identical new password without contacting auth service', async () => {
  const { change, events } = fixture()
  await assert.rejects(change('old-value', 'weak'), /12/)
  await assert.rejects(change('old-value', 'old-value'), /12|ต่างจาก/)
  assert.equal(events.length, 0)
})
test('all roles can visit account; existing sensitive permissions remain unchanged', () => {
  const access = load('lib/accessControl.ts')
  const roles = ['owner', 'admin', 'viewer', 'viewer_editor', 'defect_contributor', 'defect_editor', 'purchase']
  for (const role of roles) {
    assert.equal(access.canAccessPath(role, '/account'), true, role)
    assert.equal(access.canAccessPath(role, '/users'), role === 'owner', role)
    assert.equal(access.canViewPayroll(role), role === 'owner' || role === 'admin', role)
  }
  assert.equal(access.canAccessPath('defect_contributor', '/reports'), false)
})
test('account navigation is present on mobile and desktop with no forced change at login', () => {
  assert.match(shell, /<Link href="\/account">บัญชีของฉัน/)
  assert.match(shell, /<Link href="\/account" onClick/)
  assert.match(account, /changeOwnPassword\(currentPassword, newPassword\)/)
  assert.match(account, /ไม่มีก[า]?รบังคับเปลี่ยนรหัสผ่าน/)
  const login = fs.readFileSync('app/login/page.tsx', 'utf8')
  assert.doesNotMatch(login, /force.*password|must_change_password/i)
})
test('Owner reset remains the existing owner-only action and never reads user password', () => {
  assert.match(adminUsers, /if \(action === 'reset_password'\)/)
  assert.match(adminUsers, /callerProfile\.role !== 'manager'/)
  assert.match(adminUsers, /admin\.auth\.admin\.updateUserById\(target, \{ password \}\)/)
  assert.doesNotMatch(source, /service_role|admin\.updateUserById|insert\(/i)
})
