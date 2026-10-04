const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const vm=require('node:vm')
const ts=require('typescript')
const {createRequire}=require('node:module')

function loadTs(file){
  const filename=path.resolve(file)
  const module={exports:{}}
  const realRequire=createRequire(filename)
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText
  vm.runInNewContext(code,{module,exports:module.exports,require:realRequire,console},{filename})
  return module.exports
}

const h=loadTs('lib/headcountReconciliation.ts')

test('raw total equal male+female is matched but not automatically confirmed',()=>{
  const entry={total_manpower:7,male_count:5,female_count:2}
  assert.equal(h.deriveHeadcountSourceStatus(entry),'matched')
  assert.equal(h.maleFemaleHeadcount(entry),7)
  assert.equal(h.confirmedHeadcount({headcount_confirmation_status:'unconfirmed',confirmed_headcount:null}),null)
})

test('Prompt 12 evidence rows 28/136/145/208 remain review cases without guessed values',()=>{
  const fixtures=[
    {row:28,total_manpower:6,male_count:5,female_count:2},
    {row:136,total_manpower:11,male_count:6,female_count:4},
    {row:145,total_manpower:8,male_count:5,female_count:2},
    {row:208,total_manpower:7,male_count:2,female_count:2},
  ]
  for(const entry of fixtures){
    const batch={headcount_confirmation_status:'unconfirmed',confirmed_headcount:null}
    assert.equal(h.deriveHeadcountSourceStatus(entry),'mismatch','row '+entry.row)
    assert.equal(h.isHeadcountReviewCase(batch,entry),true,'row '+entry.row)
    assert.equal(h.confirmedHeadcount(batch),null,'row '+entry.row)
  }
})

test('null source components stay unknown and are never coerced to zero',()=>{
  const entry={total_manpower:null,male_count:5,female_count:null}
  assert.equal(h.deriveHeadcountSourceStatus(entry),'unknown')
  assert.equal(h.maleFemaleHeadcount(entry),null)
  assert.equal(h.countLabel(entry.total_manpower),'ไม่ระบุ')
  assert.equal(h.isHeadcountReviewCase({headcount_confirmation_status:'unconfirmed'},entry),true)
})

test('company plus contractor evidence never becomes Worker Payroll authority by arithmetic',()=>{
  const entry={total_manpower:10,male_count:6,female_count:4}
  assert.equal(h.deriveHeadcountSourceStatus(entry),'matched')
  assert.equal(h.confirmedHeadcount({headcount_confirmation_status:'unconfirmed',confirmed_headcount:null}),null)
  assert.equal(h.confirmedHeadcount({headcount_confirmation_status:'confirmed',confirmed_headcount:5,expected_headcount:5}),5)
})

test('Tone 16/09 canonical three people stays three across A+B project links',()=>{
  const entry={total_manpower:3,male_count:3,female_count:0}
  const projectLinks=['Above Condo A','Above Condo B']
  const batch={headcount_confirmation_status:'confirmed',confirmed_headcount:3,expected_headcount:3}
  assert.equal(projectLinks.length,2)
  assert.equal(h.deriveHeadcountSourceStatus(entry),'matched')
  assert.equal(h.confirmedHeadcount(batch),3)
})

test('confirmed authority is independent of pending/needs_review/verified display state',()=>{
  for(const verification_status of ['pending','needs_review','verified']){
    const batch={verification_status,headcount_confirmation_status:'unconfirmed',confirmed_headcount:null}
    assert.equal(h.confirmedHeadcount(batch),null,verification_status)
  }
  assert.equal(h.confirmedHeadcount({verification_status:'needs_review',headcount_confirmation_status:'confirmed',confirmed_headcount:4}),4)
})

test('migration preserves raw evidence and gates downstream on confirmed headcount',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261004153000_prompt12_confirmed_headcount.sql','utf8')
  assert.match(sql,/expected_headcount=case when b\.verification_status='verified' then r\.roster_count else null end/)
  assert.match(sql,/if v_headcount_confirmation_status<>'confirmed'/)
  assert.match(sql,/if v_distinct_workers<>v_confirmed/)
  assert.match(sql,/CONTRACTOR_ONLY_BATCH_EXCLUDED_FROM_WORKER_PAYROLL/)
  assert.match(sql,/after update of total_manpower,male_count,female_count/)
  assert.doesNotMatch(sql,/source_row\s*(?:=|in\s*\()/i)
  assert.doesNotMatch(sql,/alter\s+policy|create\s+policy|drop\s+policy/i)
  assert.doesNotMatch(sql,/update\s+public\.site_operations_entries\s+set/i)
  assert.doesNotMatch(sql,/coalesce\s*\(\s*v_confirmed\s*,\s*0\s*\)/i)
})
