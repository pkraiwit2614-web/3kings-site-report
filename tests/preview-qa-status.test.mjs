import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classify, report } from '../scripts/preview-qa-status.mjs'

test('PASS, SKIPPED, BLOCK are distinct; unknown and cancelled fail closed',()=>{
  assert.equal(classify('success'),'PASS')
  assert.equal(classify('skipped'),'SKIPPED')
  for (const result of ['failure','cancelled','timed_out','neutral',undefined,'']) {
    assert.equal(classify(result),'BLOCK')
  }
})
test('PR green local suite is not a Production release approval',()=>{
  const result=report({mode:'pr',build:'success',contract:'success',local:'success'})
  assert.equal(result.mandatoryPass,true)
  assert.match(result.release,/^BLOCK_/)
  assert.match(result.markdown,/BLOCK_VERCEL_PREVIEW_NOT_VERIFIED_BY_PR/)
})
test('unexpected skipped local Viewer is not converted to PASS',()=>{
  const result=report({mode:'pr',build:'success',contract:'success',local:'skipped'})
  assert.equal(result.mandatoryPass,false)
  assert.match(result.markdown,/SKIPPED/)
  assert.match(result.release,/BLOCK_LOCAL_QA_INCOMPLETE/)
})
test('protected Preview requires both actual HTTP and browser checks',()=>{
  const pass=report({mode:'deployment',probe:'success',browser:'success'})
  assert.equal(pass.mandatoryPass,true)
  assert.match(pass.release,/BLOCK_AUTHENTICATED_PREVIEW_NOT_ISOLATED/)
  for (const probe of ['skipped','failure',undefined]) {
    assert.equal(report({mode:'deployment',probe,browser:'success'}).mandatoryPass,false)
  }
})


test('deployment QA status only evaluates successful first-party Preview events',()=>{
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const start = workflow.indexOf('  qa_preview_status:')
  assert.ok(start > 0, 'deployment summary job exists')
  const job = workflow.slice(start)
  assert.match(job, /github\\.event_name == 'deployment_status'/)
  assert.match(job, /github\\.event\\.deployment_status\\.state == 'success'/)
  assert.match(job, /github\\.event\\.deployment\\.environment == 'Preview'/)
  assert.match(job, /github\\.event\\.repository\\.full_name == 'pkraiwit2614-web\\/3kings-site-report'/)
})
