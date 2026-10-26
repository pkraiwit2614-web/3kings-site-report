import test from 'node:test'
import assert from 'node:assert/strict'
import { classify, diagnose } from '../scripts/production-sso-preflight.mjs'

test('401/403 are not called an E2E failure or pass', () => {
  assert.equal(classify(401), 'PROTECTED_OR_APP_AUTH_REQUIRED')
  assert.equal(classify(403), 'PROTECTED_OR_APP_AUTH_REQUIRED')
})
test('redirects never become authenticated PASS', () => {
  assert.equal(classify(302, 'https://vercel.com/sso'), 'AUTH_REDIRECT_UNVERIFIED')
})
test('HTTP 200 with client permission shell is not E2E PASS', () => {
  assert.equal(classify(200, '', '<main>กำลังตรวจสอบสิทธิ์…</main>'), 'REACHABLE_SHELL_ONLY')
})
test('unexpected HTTP 500 is failure', () => {
  assert.equal(classify(500), 'HTTP_FAILURE')
})
test('fixed paths, no credentials, no redirects followed', async () => {
  const calls = []
  const results = await diagnose(async (url, options) => {
    calls.push({ url, options })
    return { status: 200, headers: { get: () => null }, text: async () => '<html>login</html>' }
  })
  assert.deepEqual(calls.map(c => c.url), [
    'https://3kings-site-report.vercel.app/login',
    'https://3kings-site-report.vercel.app/defects',
    'https://3kings-site-report.vercel.app/reports'
  ])
  for (const { options } of calls) {
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'manual')
    assert.deepEqual(options.headers, { Accept: 'text/html' })
  }
  assert.ok(results.every(r => r.classification === 'REACHABLE_UNAUTHENTICATED_ONLY'))
})
