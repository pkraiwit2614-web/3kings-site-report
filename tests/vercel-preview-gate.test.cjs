'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const { allowBuild } = require('../scripts/vercel-preview-gate.cjs')
const sha = 'a'.repeat(40)
const ref = 'feat/express-po-auto-sync-preview-20261019'
const authorized = {
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_SHA: sha,
  VERCEL_GIT_COMMIT_REF: ref,
  VERCEL_GIT_REPO_SLUG: '3kings-site-report',
  VERCEL_GIT_REPO_OWNER: 'pkraiwit2614-web',
  KINGS_HOSTED_PREVIEW_ALLOWED_SHA: sha,
  KINGS_HOSTED_PREVIEW_ALLOWED_REF: ref,
}
test('Vercel Production builds unchanged; Preview skips by default', () => {
  assert.equal(allowBuild({VERCEL_ENV:'production'}), true)
  for (const env of ['preview','development','',undefined]) assert.equal(allowBuild({VERCEL_ENV:env}), false)
  assert.equal(allowBuild({VERCEL_ENV:'preview', KINGS_ALLOW_VERCEL_PREVIEW:'true'}), false)
})
test('Only exact first-party Preview branch + immutable SHA is allowed', () => {
  assert.equal(allowBuild(authorized, sha), true)
  for (const changes of [
    {KINGS_HOSTED_PREVIEW_ALLOWED_SHA: 'b'.repeat(40)},
    {VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40)},
    {KINGS_HOSTED_PREVIEW_ALLOWED_SHA: undefined},
    {KINGS_HOSTED_PREVIEW_ALLOWED_REF: undefined},
    {VERCEL_GIT_COMMIT_REF: 'feat/other'},
    {VERCEL_GIT_COMMIT_REF: 'main', KINGS_HOSTED_PREVIEW_ALLOWED_REF:'main'},
    {VERCEL_GIT_REPO_SLUG:'other'},
    {VERCEL_GIT_REPO_OWNER:'other'},
    {VERCEL_ENV:'development'},
  ]) assert.equal(allowBuild({...authorized,...changes},sha),false)
  assert.equal(allowBuild(authorized, 'b'.repeat(40)),false)
  assert.equal(allowBuild({...authorized,VERCEL_GIT_COMMIT_SHA:undefined},sha),true)
  assert.equal(allowBuild({...authorized,VERCEL_GIT_COMMIT_SHA:undefined},null),false)
})
test('Ignored Build Step exit conventions remain exact', () => {
  for (const [env, expected] of [['production',1],['preview',0],['',0]]) {
    const result=spawnSync(process.execPath,['scripts/vercel-preview-gate.cjs'],{
      env:{PATH:process.env.PATH,VERCEL_ENV:env},encoding:'utf8'
    })
    assert.equal(result.status, expected)
  }
})
test('Vercel config uses reviewed guarded Build Gate', () => {
  const json=JSON.parse(readFileSync(new URL('../vercel.json', 'file://' + __filename),'utf8'))
  assert.equal(json.ignoreCommand, 'node scripts/vercel-preview-gate.cjs')
})
