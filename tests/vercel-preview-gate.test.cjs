'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const { allowBuild } = require('../scripts/vercel-preview-gate.cjs')
test('Only Vercel Production builds by default', () => {
  assert.equal(allowBuild({ VERCEL_ENV: 'production' }), true)
  for (const env of ['preview','development','',undefined]) {
    assert.equal(allowBuild({ VERCEL_ENV: env }), false)
  }
  assert.equal(allowBuild({ VERCEL_ENV: 'preview', KINGS_ALLOW_VERCEL_PREVIEW: 'true' }), false)
})
test('Ignored Build Step exit conventions are exact', () => {
  for (const [env, expected] of [['production',1],['preview',0],['',0]]) {
    const result=spawnSync(process.execPath,['scripts/vercel-preview-gate.cjs'],{
      env: { PATH: process.env.PATH, VERCEL_ENV: env }, encoding: 'utf8'
    })
    assert.equal(result.status,expected)
  }
})
test('Vercel config runs only the reviewed gate', () => {
  const json=JSON.parse(readFileSync(new URL('../vercel.json', 'file://' + __filename), 'utf8'))
  assert.equal(json.ignoreCommand,'node scripts/vercel-preview-gate.cjs')
})
