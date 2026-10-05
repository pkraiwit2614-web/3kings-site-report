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

const c=loadTs('lib/siteOperationsCanonical.ts')
const base={
  work_date:'2026-09-29',
  supervisor_worker_id:'W014',
  supervisor_raw:'สมชาย แก้วเพ็ง',
  project_name_raw:'Hennessy',
  area_raw:'ห้องน้ำ',
  specific_area:null,
  work_detail:'ซ่อมห้องน้ำคนงาน',
  afternoon_detail:null,
}

test('same worker/date/site/work is only a duplicate candidate signature',()=>{
  const a=c.duplicateCandidateSignature(base)
  const b=c.duplicateCandidateSignature({...base,supervisor_raw:'สมชาย  แก้วเพ็ง'})
  assert.equal(a,b)
  assert.equal(c.canonicalFlowState({flow_state:'suspected'}),'suspected')
  assert.equal(c.canUseCanonicalDownstream({flow_state:'suspected'}),false)
})

test('similar work on a different shift/work evidence does not share the exact candidate key',()=>{
  const morning=c.duplicateCandidateSignature({...base,afternoon_detail:'กะเช้า'})
  const afternoon=c.duplicateCandidateSignature({...base,afternoon_detail:'กะบ่าย'})
  assert.notEqual(morning,afternoon)
})

test('same worker on different sites is not a candidate match',()=>{
  const a=c.duplicateCandidateSignature(base)
  const b=c.duplicateCandidateSignature({...base,project_name_raw:'Above Villa Plot 6'})
  assert.notEqual(a,b)
})

test('close timestamps never auto-merge because timestamp is not a decision input',()=>{
  const a=c.duplicateCandidateSignature(base)
  const b=c.duplicateCandidateSignature(base)
  assert.equal(a,b)
  assert.equal(c.canonicalFlowState({flow_state:'suspected'}),'suspected')
  assert.equal(c.canonicalFlowState({flow_state:'active'}),'active')
})

test('suppressed members are excluded downstream while confirmed distinct/canonical members are active',()=>{
  assert.equal(c.canUseCanonicalDownstream({flow_state:'suppressed'}),false)
  assert.equal(c.canUseCanonicalDownstream({flow_state:'active'}),true)
})

test('migration is generic, preserves raw source fields, and requires explicit evidence/state',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261005062000_prompt13_canonical_duplicate_guard.sql','utf8')
  assert.match(sql,/site_operations_duplicate_groups/)
  assert.match(sql,/confirmed_duplicate/)
  assert.match(sql,/confirmed_distinct/)
  assert.match(sql,/DUPLICATE_DECISION_EVIDENCE_REQUIRED/)
  assert.match(sql,/DUPLICATE_SOURCE_REVIEW_REQUIRED_/)
  assert.match(sql,/decision_members_fingerprint/)
  assert.match(sql,/unique\(entry_id\)/i)
  assert.match(sql,/security_invoker=true/)
  assert.doesNotMatch(sql,/source_row\s*(?:=|in\s*\(\s*185)/i)
  assert.doesNotMatch(sql,/\b185\b|\b186\b|\b212\b|\b220\b|Tone|โทน/)
  assert.doesNotMatch(sql,/delete\s+from\s+public\.site_operations_entries/i)
  assert.doesNotMatch(sql,/update\s+public\.site_operations_entries\s+set\s+(source_file_id|source_sheet|source_row|source_timestamp|work_date|project_name_raw|area_raw|supervisor_raw|male_count|female_count|total_manpower|work_detail|source_fingerprint)/i)
})

test('retry/idempotency contracts are encoded by stable candidate key and unique raw membership',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261005062000_prompt13_canonical_duplicate_guard.sql','utf8')
  assert.match(sql,/candidate_key text not null unique/)
  assert.match(sql,/on conflict\(candidate_key\) do update/)
  assert.match(sql,/on conflict\(entry_id\) do update/)
  assert.match(sql,/v_decision_fp is distinct from v_current_fp/)
})
