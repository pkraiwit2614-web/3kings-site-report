import test from 'node:test'
import assert from 'node:assert/strict'
import {checkedPreview,checkedViewerConfig,isAllowedBrowserRequest} from '../scripts/preview-playwright-e2e.mjs'

const origin = 'https://3kings-site-report-aaa-kraiwit-p-golfiiz-sqr.vercel.app'
const prod = 'https://wtqubwdduzedmcvyhbgs.supabase.co'
const isolated = 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'

test('Playwright accepts only root of verified 3 Kings preview on HTTPS', () => {
  assert.equal(checkedPreview(origin + '/'), origin)
  for (const bad of [
    'https://3kings-site-report.vercel.app/', 'https://evil.vercel.app/',
    'http://3kings-site-report-aaa-kraiwit-p-golfiiz-sqr.vercel.app/',
    origin + '/users', origin + '/?secret=1', origin + '.evil.test/',
    'https://name:pass@3kings-site-report-aaa-kraiwit-p-golfiiz-sqr.vercel.app/'
  ]) assert.throws(() => checkedPreview(bad))
})

test('viewer credentials cannot run on production or unattested Supabase', () => {
  const base = {KINGS_E2E_VIEWER_LOGIN:'qa-viewer',KINGS_E2E_VIEWER_PASSWORD:'dummy12345678'}
  assert.throws(() => checkedViewerConfig({...base,KINGS_E2E_ISOLATED_DB:'CONFIRMED_ISOLATED_PREVIEW',KINGS_E2E_PREVIEW_SUPABASE_ORIGIN:prod}))
  assert.throws(() => checkedViewerConfig({...base,KINGS_E2E_PREVIEW_SUPABASE_ORIGIN:isolated}))
  assert.throws(() => checkedViewerConfig({...base,KINGS_E2E_ISOLATED_DB:'CONFIRMED_ISOLATED_PREVIEW',KINGS_E2E_PREVIEW_SUPABASE_ORIGIN:isolated,KINGS_E2E_VIEWER_LOGIN:''}))
  assert.equal(checkedViewerConfig({...base,KINGS_E2E_ISOLATED_DB:'CONFIRMED_ISOLATED_PREVIEW',KINGS_E2E_PREVIEW_SUPABASE_ORIGIN:isolated}), isolated)
})

test('never send credentials to third-party or production DB in viewer mode', () => {
  assert.equal(isAllowedBrowserRequest(origin+'/login','GET',origin,isolated,true),true)
  assert.equal(isAllowedBrowserRequest(origin+'/users','POST',origin,isolated,true),false)
  assert.equal(isAllowedBrowserRequest(prod+'/rest/v1/profiles','GET',origin,isolated,true),false)
  assert.equal(isAllowedBrowserRequest('https://attacker.test','GET',origin,isolated,true),false)
  assert.equal(isAllowedBrowserRequest(isolated+'/auth/v1/token?grant_type=password','POST',origin,isolated,true),true)
  assert.equal(isAllowedBrowserRequest(isolated+'/rest/v1/profiles','PATCH',origin,isolated,true),false)
  assert.equal(isAllowedBrowserRequest(isolated+'/rest/v1/activity_logs','POST',origin,isolated,true),false)
  assert.equal(isAllowedBrowserRequest(isolated+'/rest/v1/rpc/defect_report_latest_change_at','POST',origin,isolated,true),true)
  assert.equal(isAllowedBrowserRequest(isolated+'/rest/v1/rpc/delete_all','POST',origin,isolated,true),false)
  assert.equal(isAllowedBrowserRequest(isolated+'/auth/v1/token?grant_type=password','POST',origin,isolated,false),false)
})
