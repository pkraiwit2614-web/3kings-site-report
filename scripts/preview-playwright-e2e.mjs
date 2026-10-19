// Real protected Vercel Preview browser QA. Read-only and fail-closed.
// No screenshots, traces, storage-state dumps, passwords, or JWTs are persisted.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const PREVIEW_HOST = /^3kings-site-report-[a-z0-9-]+-kraiwit-p-golfiiz-sqr\.vercel\.app$/
const PROD_DB = 'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const READ_ONLY_RPC = new Set(['role_permission_matrix_read', 'defect_report_latest_change_at'])
const BROWSER_TIMEOUT = 25000

export function checkedPreview(raw) {
  const url = new URL(String(raw || ''))
  if (url.protocol !== 'https:' || !PREVIEW_HOST.test(url.hostname) ||
      url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash)
    throw new Error('BLOCK_PREVIEW_BROWSER_URL')
  return url.origin
}

export function checkedViewerConfig(env) {
  if (env.KINGS_E2E_ISOLATED_DB !== 'CONFIRMED_ISOLATED_PREVIEW') throw new Error('BLOCK_VIEWER_DB_NOT_ATTESTED')
  if (!env.KINGS_E2E_VIEWER_LOGIN || !env.KINGS_E2E_VIEWER_PASSWORD) throw new Error('BLOCK_VIEWER_CREDENTIALS_MISSING')
  const url = new URL(String(env.KINGS_E2E_PREVIEW_SUPABASE_ORIGIN || ''))
  if (url.origin !== url.href.replace(/\/$/, '') || url.protocol !== 'https:' ||
      !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) || url.origin === PROD_DB)
    throw new Error('BLOCK_VIEWER_DB_NOT_ISOLATED')
  return url.origin
}

function seededFixtureId(value) {
  const id = String(value || '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new Error('BLOCK_RLS_FIXTURE_ID_MISSING')
  return id
}

export function checkedRlsFixtures(env) {
  return {
    otherUserId: seededFixtureId(env.KINGS_E2E_RLS_OTHER_PROFILE_ID),
    payrollId: seededFixtureId(env.KINGS_E2E_RLS_PAYROLL_RECORD_ID)
  }
}

export function isAllowedBrowserRequest(requestUrl, method, previewOrigin, supabaseOrigin, viewer) {
  const url = new URL(requestUrl)
  if (url.origin === previewOrigin) return SAFE_METHODS.has(method)
  if (url.origin !== supabaseOrigin || !viewer) return false
  if (SAFE_METHODS.has(method)) return true
  if (method !== 'POST') return false
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') return true
  const match = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)
  return Boolean(match && READ_ONLY_RPC.has(match[1]))
}

function publicResult(name, result) {
  // Keep all output free of user, room, payroll, session, and secret data.
  console.log(name + ': ' + result)
}

async function main() {
  const mode = process.argv[2] || 'anonymous'
  if (!['anonymous', 'viewer'].includes(mode)) throw new Error('BLOCK_UNKNOWN_BROWSER_MODE')
  const origin = checkedPreview(process.env.PREVIEW_ENV_URL)
  const bypass = process.env.KINGS_VERCEL_PREVIEW_BYPASS || ''
  if (!/^[a-zA-Z0-9]{32}$/.test(bypass)) throw new Error('BLOCK_VERCEL_BYPASS_MISSING')
  const viewer = mode === 'viewer'
  // Verify isolation BEFORE initializing the browser or attempting a password login.
  const expectedDb = viewer ? checkedViewerConfig(process.env) : PROD_DB
  const fixtures = viewer ? checkedRlsFixtures(process.env) : null

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1360, height: 920 } })
    await context.route('**/*', async route => {
      const req = route.request()
      const requestUrl = req.url()
      const method = req.method().toUpperCase()
      if (!isAllowedBrowserRequest(requestUrl, method, origin, expectedDb, viewer))
        return route.abort('blockedbyclient')
      const target = new URL(requestUrl)
      if (target.origin === origin) {
        // Bypass is never sent to Supabase, external providers, or redirects.
        return route.continue({ headers: { ...req.headers(), 'x-vercel-protection-bypass': bypass } })
      }
      return route.continue()
    })
    await context.routeWebSocket('**/*', socket => socket.close())

    const page = await context.newPage()
    page.setDefaultTimeout(BROWSER_TIMEOUT)
    let bearer = ''
    let anonKey = ''
    let dbRequests = 0
    page.on('request', req => {
      const url = new URL(req.url())
      if (url.origin === expectedDb) {
        dbRequests++
        const key = req.headers().apikey
        if (key) anonKey = key
      }
      if (url.origin === origin && url.pathname.startsWith('/api/access-control')) {
        const auth = req.headers().authorization || ''
        if (/^Bearer \S+$/.test(auth)) bearer = auth
      }
    })

    if (!viewer) {
      const r = await page.goto(origin + '/login', { waitUntil: 'domcontentloaded' })
      assert.equal(r?.status(), 200, 'login page HTTP status')
      await page.getByRole('heading', { name: '3 Kings Site Report' }).waitFor()
      await page.getByPlaceholder('เช่น USER01').waitFor()
      await page.getByPlaceholder('กรอกรหัสผ่าน').waitFor()
      const unauth = await context.request.get(origin + '/api/access-control?path=%2Fusers', {
        headers: { 'x-vercel-protection-bypass': bypass }
      })
      assert.equal(unauth.status(), 401, 'anonymous API access must be denied')
      for (const protectedPath of ['/materials', '/defects', '/reports', '/users', '/reports/labour']) {
        await page.goto(origin + protectedPath, { waitUntil: 'domcontentloaded' })
        await page.waitForURL(u => u.pathname === '/login', { timeout: BROWSER_TIMEOUT })
      }
      publicResult('ANONYMOUS_LOGIN_AND_ROUTE_GUARD', 'PASS')
    } else {
      await page.goto(origin + '/login', { waitUntil: 'domcontentloaded' })
      await page.getByPlaceholder('เช่น USER01').fill(process.env.KINGS_E2E_VIEWER_LOGIN)
      await page.getByPlaceholder('กรอกรหัสผ่าน').fill(process.env.KINGS_E2E_VIEWER_PASSWORD)
      await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
      await page.waitForURL(u => u.pathname === '/', { timeout: BROWSER_TIMEOUT })
      await page.getByText('Dashboard', { exact: true }).first().waitFor()
      assert.ok(bearer.startsWith('Bearer '), 'browser session did not authenticate against API')
      assert.ok(dbRequests > 0, 'no calls to attested isolated Supabase origin')
      const permitted = [
        ['/', 'Dashboard'],
        ['/defects', 'Above Condo — Defect Report'],
        ['/materials', 'วัสดุ เครื่องมือและผู้รับเหมา'],
        ['/reports', 'Site Operations']
      ]
      for (const [path, title] of permitted) {
        const access = await context.request.get(origin + '/api/access-control?path=' + encodeURIComponent(path), {
          headers: { 'x-vercel-protection-bypass': bypass, authorization: bearer }
        })
        assert.equal(access.status(), 200, 'viewer path permission ' + path)
        const result = await access.json()
        assert.equal(result.role, 'viewer', 'expected least-privilege viewer')
        assert.equal(result.allowed, true, 'viewer route expected allowed: ' + path)
        await page.goto(origin + path, { waitUntil: 'domcontentloaded' })
        await page.getByText(title, { exact: false }).first().waitFor()
        assert.equal(new URL(page.url()).pathname, path, 'unexpected route redirect: ' + path)
        publicResult('VIEWER_ROUTE_' + (path === '/' ? 'DASHBOARD' : path.substring(1).toUpperCase()), 'PASS')
      }
      for (const restricted of ['/users', '/reports/labour']) {
        const access = await context.request.get(origin + '/api/access-control?path=' + encodeURIComponent(restricted), {
          headers: { 'x-vercel-protection-bypass': bypass, authorization: bearer }
        })
        assert.equal(access.status(), 403, 'restricted API must reject: ' + restricted)
        const result = await access.json()
        assert.equal(result.allowed, false, 'restricted API must reject: ' + restricted)
        await page.goto(origin + restricted, { waitUntil: 'domcontentloaded' })
        await page.waitForURL(u => u.pathname !== restricted && u.pathname !== '/login', { timeout: BROWSER_TIMEOUT })
        publicResult('VIEWER_DENIED_' + restricted.substring(1).toUpperCase().replaceAll('/', '_'), 'PASS')
      }
      // Read-side RLS: own profile exists; a separately seeded other user
      // and payroll record must both be invisible to a least-privilege Viewer.
      // Fixture existence is independently attested in the disposable test DB.
      assert.ok(anonKey, 'missing publishable key from isolated client')
      const dbHeaders = { apikey: anonKey, authorization: bearer }
      const self = await context.request.get(expectedDb + '/auth/v1/user', { headers: dbHeaders })
      assert.equal(self.status(), 200, 'isolated Supabase auth session')
      const selfId = (await self.json()).id
      assert.match(selfId, /^[0-9a-f-]{36}$/i)
      assert.notEqual(fixtures.otherUserId, selfId)
      const ownProfile = await context.request.get(
        expectedDb + '/rest/v1/profiles?select=user_id&user_id=eq.' + encodeURIComponent(selfId),
        { headers: dbHeaders }
      )
      assert.equal(ownProfile.status(), 200, 'viewer must read its own profile')
      const ownRows = await ownProfile.json()
      assert.ok(Array.isArray(ownRows) && ownRows.some(row => row.user_id === selfId))
      const otherProfile = await context.request.get(
        expectedDb + '/rest/v1/profiles?select=user_id&user_id=eq.' + encodeURIComponent(fixtures.otherUserId),
        { headers: dbHeaders }
      )
      assert.equal(otherProfile.status(), 200, 'profiles RLS query must execute')
      assert.deepEqual(await otherProfile.json(), [], 'viewer must not read another profile')
      const payroll = await context.request.get(
        expectedDb + '/rest/v1/payroll_verification_records?select=id&id=eq.' + encodeURIComponent(fixtures.payrollId),
        { headers: dbHeaders }
      )
      assert.ok([200, 401, 403].includes(payroll.status()), 'payroll RLS denied read')
      if (payroll.status() === 200) assert.deepEqual(await payroll.json(), [], 'viewer must not read payroll row')
      publicResult('VIEWER_PROFILE_AND_PAYROLL_READ_RLS', 'PASS_SEEDED_FIXTURES_REQUIRED')
      // No INSERT/UPDATE/DELETE requests are issued. Write-side RLS must be
      // exercised separately against disposable synthetic data and never Production.
      publicResult('VIEWER_WRITE_RLS', 'NOT_TESTED_READ_ONLY_MODE')
    }
    await context.close()
  } finally {
    await browser.close()
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // Print only categorical test errors, never exception objects with URLs/headers.
    const known = String(error?.message || '').match(/BLOCK_[A-Z_]+/)
    console.error(known ? known[0] : 'FAIL_PREVIEW_PLAYWRIGHT_E2E')
    process.exitCode = 1
  })
}
