'use strict'

const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')

const migration=fs.readFileSync('supabase/migrations/20261005045000_prompt5_manpower_classification.sql','utf8')
const page=fs.readFileSync('app/reports/labour/page.tsx','utf8')
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/prompt5-manpower.json','utf8'))

test('Prompt 5 preserves Prompt 12 raw evidence and expected-headcount authority',()=>{
  assert.doesNotMatch(migration,/update\s+public\.site_operations_entries\s+set/i)
  assert.match(migration,/confirmed_headcount/)
  assert.match(migration,/expected_headcount/)
  assert.match(migration,/NULL means unresolved; never derive as raw_total-confirmed_headcount/)
})

test('the four known team leaders remain separate-pay by explicit eligibility, not supervisor role',()=>{
  assert.deepEqual(fixture.team_leader_fixtures.map(x=>x.label),['พี่ปู','บังรุน','ช่างอ๊อด','ช่างต่อ'])
  assert.equal(fixture.team_leader_fixtures.every(x=>x.worker_class==='company'&&x.payroll_eligible===false),true)
  for(const x of fixture.team_leader_fixtures) assert.match(migration,new RegExp(x.worker_id))
  assert.match(migration,/prompt01_team_leader_separate_pay/)
})

test('eligible supervisor is not excluded solely because it is supervisor',()=>{
  assert.doesNotMatch(migration,/worker_id<>v_supervisor_worker_id/)
  assert.doesNotMatch(migration,/worker_id<>b\.supervisor_worker_id/)
  assert.doesNotMatch(migration,/i\.worker_id=b\.supervisor_worker_id/)
  assert.match(migration,/labour_is_company_payroll_worker/)
  assert.match(page,/isCompanyPayrollWorker/)
  assert.doesNotMatch(page,/worker_id!==batch\.supervisor_worker_id/)
})

test('DC contractor people and non-person mappings are blocked from Worker Payroll',()=>{
  for(const id of fixture.dc_contractor_worker_ids) assert.match(migration,new RegExp(id))
  assert.match(migration,/labour_master_dc_contractor/)
  assert.match(migration,/NON_PERSON_CONTRACTOR/)
  assert.match(migration,/NON_PERSON_GROUP/)
  assert.match(migration,/NON_PAYROLL_WORKER_NOT_ALLOWED_/)
})

test('ลุงทอง stays distinct from DC supplied workers',()=>{
  assert.equal(fixture.distinct_dc_supervisor.worker_id,'W012')
  assert.equal(fixture.distinct_dc_supervisor.worker_class,'company')
  assert.equal(fixture.distinct_dc_supervisor.payroll_eligible,true)
  assert.match(migration,/labour_master_distinct_supervisor/)
})

test('contractor count has structured authority and cannot be supplied through general note',()=>{
  assert.match(migration,/contractor_person_count/)
  assert.match(migration,/CONTRACTOR_COUNT_EVIDENCE_REQUIRED/)
  assert.match(migration,/labour_confirm_contractor_count/)
  assert.match(migration,/STALE_CONTRACTOR_COUNT_RELOAD_REQUIRED/)
  assert.match(page,/p_expected_source_fingerprint:contractorDraft.source_fingerprint/)
  assert.match(page,/Contractor \/ non-payroll/)
  assert.match(page,/ไม่คำนวณจาก Reported - Company Payroll/)
})

test('Prompt 4 optimistic-concurrency overloads are preserved',()=>{
  assert.equal((migration.match(/CREATE OR REPLACE FUNCTION public\.labour_verify_batch/gi)||[]).length,2)
  assert.equal((migration.match(/CREATE OR REPLACE FUNCTION public\.payroll_save_verification/gi)||[]).length,2)
  assert.match(migration,/p_expected_source_fingerprint/)
  assert.match(migration,/p_expected_batch_revision/)
  assert.match(migration,/p_expected_payroll_revision/)
  assert.match(migration,/STALE_LABOUR_SAVE_RELOAD_REQUIRED/)
  assert.match(migration,/STALE_PAYROLL_SAVE_RELOAD_REQUIRED/)
})

test('no RBAC/RLS policy rewrite is introduced',()=>{
  assert.doesNotMatch(migration,/create\s+policy|alter\s+policy|drop\s+policy/i)
})
