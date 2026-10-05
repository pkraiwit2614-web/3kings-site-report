const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')

const migration=fs.readFileSync('supabase/migrations/20261005035000_prompt3_source_revision_invalidation.sql','utf8')
const ui=fs.readFileSync('app/reports/labour/page.tsx','utf8')

function invalidate(state,changed){
  const next=structuredClone(state)
  if(!changed)return next
  if(next.batch.verification_status==='verified')next.batch.verification_status='needs_review'
  if(['timecard_checked','verified','external_verified'].includes(next.payroll.status))next.payroll.status='needs_review'
  return next
}
function reverify(state,currentFingerprint){
  const next=structuredClone(state)
  next.batch.verification_status='verified'
  next.batch.verified_source_fingerprint=currentFingerprint
  return next
}

test('changed canonical source makes Labour and checked Payroll stale without deleting history',()=>{
  const before={
    batch:{verification_status:'verified',verified_source_fingerprint:'rev-a'},
    payroll:{status:'timecard_checked'},
    assignments:[{id:'a1'},{id:'a2'}],
    payrollItems:[{id:'p1'},{id:'p2'}],
  }
  const after=invalidate(before,true)
  assert.equal(after.batch.verification_status,'needs_review')
  assert.equal(after.payroll.status,'needs_review')
  assert.deepEqual(after.assignments,before.assignments)
  assert.deepEqual(after.payrollItems,before.payrollItems)
})

test('no-op source write does not invalidate current verification',()=>{
  const before={batch:{verification_status:'verified'},payroll:{status:'timecard_checked'}}
  assert.deepEqual(invalidate(before,false),before)
})

test('project-link identity change uses the same invalidation contract',()=>{
  const before={batch:{verification_status:'verified'},payroll:{status:'external_verified'}}
  const after=invalidate(before,true)
  assert.equal(after.batch.verification_status,'needs_review')
  assert.equal(after.payroll.status,'needs_review')
})

test('re-verification snapshots the new source revision; Payroll still requires its own recheck',()=>{
  const stale={
    batch:{verification_status:'needs_review',verified_source_fingerprint:'rev-a'},
    payroll:{status:'needs_review'},
  }
  const after=reverify(stale,'rev-b')
  assert.equal(after.batch.verification_status,'verified')
  assert.equal(after.batch.verified_source_fingerprint,'rev-b')
  assert.equal(after.payroll.status,'needs_review')
})

test('migration is surgical and preserves Prompt 1/2 monetary/security surfaces',()=>{
  assert.match(migration,/trg_site_operations_source_revision_invalidate/)
  assert.match(migration,/trg_site_operations_project_revision_invalidate/)
  assert.match(migration,/verification_status='needs_review'/)
  assert.match(migration,/status='needs_review'/)
  assert.match(migration,/b\.verification_status='verified'[\s\S]*b\.work_date is distinct from e\.work_date/)
  assert.doesNotMatch(migration,/delete\s+from\s+public\.labour_daily_assignments/i)
  assert.doesNotMatch(migration,/delete\s+from\s+public\.payroll_verification_items/i)
  assert.doesNotMatch(migration,/update\s+public\.payroll_verification_items/i)
  assert.doesNotMatch(migration,/create\s+policy|alter\s+policy|drop\s+policy/i)
  assert.doesNotMatch(migration,/grant\s|revoke\s/i)
})

test('UI treats fingerprint mismatch as needs_review before downstream action',()=>{
  assert.match(ui,/source_fingerprint:string/)
  assert.match(ui,/verified_source_fingerprint:string\|null/)
  assert.match(ui,/batch\.verified_source_fingerprint!==entry\.source_fingerprint/)
  assert.match(ui,/labourStatusFor\(batch\)!=='verified'/)
  assert.match(ui,/ข้อมูลต้นทางมีการเปลี่ยนหลังยืนยันทีม/)
})
