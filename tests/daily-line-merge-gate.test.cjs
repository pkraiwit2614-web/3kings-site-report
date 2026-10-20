'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const {ALLOWED,DAILY_LINE_SOURCES,classify}=require('../scripts/daily-line-merge-gate.cjs')
test('only the ten scoped Preview QA paths may change in PR #187',()=>{
  assert.equal(ALLOWED.length,10)
  assert.equal(classify([...ALLOWED]).pass,true)
  assert.equal(classify([]).pass,false)
  for(const forbidden of [
    'docs/apps-script/DailySiteReportSync_2026-10-19.gs',
    '.github/workflows/daily-site-importer.yml',
    'app/api/reports/123/route.ts',
    'app/api/sync/drive/route.ts',
    'app/reports/page.tsx',
    'docs/publish/daily-png.gs',
    'workers/3kings-line-autopilot.js',
    'api/delivery-gateway.ts',
    'supabase/migrations/daily_report.sql',
    'package.json', 'package-lock.json',
    '.github/workflows/schedule-line.yml',
    '.github/workflows/hosted-preview-on-demand.yml.bak'
  ]){
    const x=classify([...ALLOWED,forbidden])
    assert.equal(x.pass,false,forbidden)
    assert.ok(x.disallowed.includes(forbidden))
  }
})
test('CI checks every named Daily Site Report source and never defines a delivery command',()=>{
  assert.equal(DAILY_LINE_SOURCES.length,4)
  assert.equal(new Set(DAILY_LINE_SOURCES).size,4)
  assert.ok(DAILY_LINE_SOURCES.every(p=>p.includes('daily')||p.includes('Daily')||p.includes('apps-script')))
})
test('change scoping cannot be bypassed by an outside path',()=>{
  const x=classify(['vercel.json','lib/new/report-delivery.ts'])
  assert.equal(x.pass,false)
  assert.equal(x.protectedScopes.dailyReport,false)
  assert.equal(x.protectedScopes.lineGateway,false)
})
