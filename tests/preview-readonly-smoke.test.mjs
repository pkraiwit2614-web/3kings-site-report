import test from 'node:test'
import assert from 'node:assert/strict'
import { choosePreviewUrl, inspectPreview } from '../scripts/preview-readonly-smoke.mjs'

const origin = 'https://3kings-site-report-abc-123.vercel.app/'
const response = (status, type = 'text/html; charset=utf-8') => ({
  status, headers: { get: () => type }
})

test('accept only exact HTTPS 3 Kings Vercel preview hosts and root path', () => {
  assert.equal(choosePreviewUrl([origin]), origin)
  assert.equal(choosePreviewUrl(['https://vercel.com/dashboard', origin]), origin)
  for (const unsafe of [
    'http://3kings-site-report-abc.vercel.app/',
    'https://3kings-site-report-abc.vercel.app.evil.example/',
    'https://evil.vercel.app/',
    'https://3kings-site-report.vercel.app/',
    'https://3kings-site-report-abc.vercel.app:8443/',
    'https://3kings-site-report-abc.vercel.app/admin',
    'https://3kings-site-report-abc.vercel.app/?secret=1',
    'https://user:password@3kings-site-report-abc.vercel.app/',
    'file:///etc/passwd'
  ]) assert.throws(() => choosePreviewUrl([unsafe]), /BLOCK_PREVIEW_URL_UNVERIFIED/)
})

test('read-only GET cannot follow redirects or treat protection as successful QA', async () => {
  let count = 0
  const request = async (url, options) => {
    count++
    assert.equal(url, origin)
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'manual')
    return response(200)
  }
  assert.deepEqual(await inspectPreview([origin], request), { status: 'REACHABLE_ONLY', http: 200 })
  assert.equal(count, 1)
  for (const [http, status] of [
    [302, 'UNVERIFIED_REDIRECT'],
    [401, 'BLOCK_PREVIEW_AUTH_REQUIRED'],
    [403, 'BLOCK_PREVIEW_AUTH_REQUIRED'],
    [500, 'FAIL_PREVIEW_HTTP']
  ]) assert.deepEqual(await inspectPreview([origin], async () => response(http)), { status, http })
  assert.deepEqual(await inspectPreview([origin], async () => response(200, 'application/json')), { status: 'FAIL_NON_HTML', http: 200 })
})
