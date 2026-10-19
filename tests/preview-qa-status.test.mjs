import { test } from 'node:test'
import assert from 'node:assert/strict'
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
