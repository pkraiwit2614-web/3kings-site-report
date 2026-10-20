import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { choosePreviewUrl, inspectPreview } from '../scripts/preview-readonly-smoke.mjs'

const origin = 'https://3kings-site-report-hdyxodg0n-kraiwit-p-golfiiz-sqr.vercel.app/'
const dummy = '0123456789ABCDEF0123456789ABCDEF'
const response = (status, type = 'text/html; charset=utf-8') => ({
  status, headers: { get: () => type }
})

test('only allow HTTPS root of project deployment on verified team domain', () => {
  assert.equal(choosePreviewUrl([origin]), origin)
  assert.equal(choosePreviewUrl(['https://vercel.com/dashboard', origin]), origin)
  for (const unsafe of [
    'http://3kings-site-report-hdyxodg0n-kraiwit-p-golfiiz-sqr.vercel.app/',
    'https://3kings-site-report-hdyxodg0n-kraiwit-p-golfiiz-sqr.vercel.app.evil.example/',
    'https://evil.vercel.app/',
    'https://3kings-site-report.vercel.app/',
    'https://3kings-site-report-abc.vercel.app/',
    'https://3kings-site-report-abc.vercel.app:8443/',
    'https://3kings-site-report-abc-kraiwit-p-golfiiz-sqr.vercel.app/admin',
    'https://3kings-site-report-abc-kraiwit-p-golfiiz-sqr.vercel.app/?token=1',
    'https://user:pass@3kings-site-report-abc-kraiwit-p-golfiiz-sqr.vercel.app/',
    'file:///etc/passwd'
  ]) assert.throws(() => choosePreviewUrl([unsafe]), /BLOCK_PREVIEW_URL_UNVERIFIED/)
})

test('never perform network request if bypass secret is absent or invalid', async () => {
  const noFetch = async () => { throw Error('unsafe network attempt') }
  for (const invalid of ['', 'not configured', 'private?token=xyz', '1234']) {
    assert.deepEqual(await inspectPreview([origin], noFetch, invalid), {
      status: 'BLOCK_PREVIEW_SECRET_NOT_CONFIGURED', http: 'N/A'
    })
  }
})

test('bypass credential is scoped to one checked URL as a header only', async () => {
  let count = 0
  const request = async (url, options) => {
    count++
    assert.equal(url, origin)
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'manual')
    assert.deepEqual(options.headers, {
      Accept: 'text/html',
      'x-vercel-protection-bypass': dummy
    })
    assert.equal(url.includes(dummy), false)
    return response(200)
  }
  assert.deepEqual(await inspectPreview([origin], request, dummy), {
    status: 'REACHABLE_ONLY', http: 200
  })
  assert.equal(count, 1)
  for (const [http, status] of [
    [302, 'UNVERIFIED_REDIRECT'],
    [401, 'BLOCK_PREVIEW_AUTH_REQUIRED'],
    [403, 'BLOCK_PREVIEW_AUTH_REQUIRED'],
    [500, 'FAIL_PREVIEW_HTTP']
  ]) assert.deepEqual(await inspectPreview([origin], async () => response(http), dummy), { status, http })
  assert.deepEqual(await inspectPreview([origin], async () => response(200, 'application/json'), dummy), {
    status: 'FAIL_NON_HTML', http: 200
  })
})

test('no bypass credential is sent to an invalid domain, even with a valid secret', async () => {
  await assert.rejects(
    inspectPreview(['https://attacker.example/'], async () => { throw Error('must not fetch') }, dummy),
    /BLOCK_PREVIEW_URL_UNVERIFIED/
  )
})

test('workflow disallows arbitrary deployment revisions before bypass secret can be read', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const guard = workflow.indexOf('- name: Verify deployed SHA equals trusted first-party branch HEAD')
  const secret = workflow.indexOf('KINGS_VERCEL_PREVIEW_BYPASS: ${{ secrets.KINGS_VERCEL_PREVIEW_BYPASS }}')
  assert.ok(guard > 0 && secret > guard, 'trusted SHA gate must precede secret use')
  assert.match(workflow, /BLOCK_UNTRUSTED_DEPLOYMENT_REVISION/)
  assert.match(workflow, /github\.event\.repository\.full_name/)
  assert.match(workflow, /gh api 'repos\/pkraiwit2614-web\/3kings-site-report\/branches\/test\/preview-qa-automation-20261019'/)
  assert.doesNotMatch(workflow, /pull_request_target/)
})
