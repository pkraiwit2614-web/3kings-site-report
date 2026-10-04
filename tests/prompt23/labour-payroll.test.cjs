'use strict'

const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  A4_LANDSCAPE_MM,
  canonicalizeLabourRows,
  planLabourPage,
  normalizedGolden,
  financialReconciliationGate
} = require('./labour-payroll-contract.cjs')

const fixtureDir = path.join(__dirname, 'fixtures')
const readJson = name => JSON.parse(fs.readFileSync(path.join(fixtureDir, name), 'utf8'))

test('Labour PDF contract is A4 landscape and exactly one page per work date', () => {
  const fixture = readJson('labour-pdf.synthetic.json')
  const canonical = canonicalizeLabourRows(fixture.rows)
  const plans = canonical.map(planLabourPage)
  assert.equal(plans.length, new Set(fixture.rows.filter(x => x.entity_type === 'worker').map(x => x.work_date)).size)
  for (const plan of plans) {
    assert.deepEqual(plan.page_size_mm, A4_LANDSCAPE_MM)
    assert.equal(plan.orientation, 'landscape')
    assert.equal(plan.overlap, false)
    assert.equal(plan.fits, true)
  }
})

test('Tone 16/09 canonical merge is 3 unique workers across A+B despite duplicate source rows', () => {
  const fixture = readJson('labour-pdf.synthetic.json')
  const canonical = canonicalizeLabourRows(fixture.rows)
  const tone = canonical.find(x => x.work_date === '2026-09-16')
  assert.ok(tone)
  assert.deepEqual(tone.projects, ['A','B'])
  assert.deepEqual(tone.workers.map(x => x.worker_key), ['TONE-W1','TONE-W2','TONE-W3'])
  assert.equal(tone.workers.length, 3)
})

test('contractor and non-person rows are excluded from Labour PDF person count', () => {
  const fixture = readJson('labour-pdf.synthetic.json')
  const tone = canonicalizeLabourRows(fixture.rows).find(x => x.work_date === '2026-09-16')
  assert.equal(tone.workers.some(x => x.worker_key === 'CONTRACTOR-ROW'), false)
  assert.equal(tone.workers.some(x => x.worker_key === 'NOTE-ROW'), false)
})

test('Labour PDF remains pre-verification evidence and does not wait for Verified status', () => {
  const fixture = readJson('labour-pdf.synthetic.json')
  const tone = canonicalizeLabourRows(fixture.rows).find(x => x.work_date === '2026-09-16')
  assert.ok(tone.source_statuses.includes('pending'))
  assert.equal(tone.workers.length, 3)
})

test('Thai long-detail layout is deterministic, fits one page and matches golden output', () => {
  const fixture = readJson('labour-pdf.synthetic.json')
  const golden = readJson('labour-pdf.golden.json')
  const actual = normalizedGolden(canonicalizeLabourRows(fixture.rows).map(planLabourPage))
  assert.deepEqual(actual, golden)
})

test('financial handoff is Verified Payroll only and is BLOCKED without authoritative verified fixture', () => {
  const fixture = readJson('verified-payroll.synthetic.json')
  const result = financialReconciliationGate(fixture)
  assert.deepEqual(result, {
    status: 'BLOCKED',
    reason: 'NO_AUTHORITATIVE_VERIFIED_PAYROLL_FIXTURE',
    authority_record_count: 0,
    exported_rows: []
  })
})

test('timecard_checked/draft records can never become financial authority through this harness', () => {
  const fixture = readJson('verified-payroll.synthetic.json')
  assert.equal(fixture.records.every(x => ['draft','timecard_checked'].includes(x.status)), true)
  const result = financialReconciliationGate(fixture)
  assert.equal(result.exported_rows.length, 0)
})
