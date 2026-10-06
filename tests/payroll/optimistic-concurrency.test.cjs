const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')

const stage=fs.readFileSync('supabase/migrations/20261005043000_prompt4_optimistic_concurrency_stage.sql','utf8')
const cutover=fs.readFileSync('supabase/migrations/20261005043100_prompt4_optimistic_concurrency_cutover.sql','utf8')
const ui=fs.readFileSync('app/reports/labour/page.tsx','utf8')

function labourSave(state,req){
  if(state.source!==req.source)return {ok:false,code:'STALE_LABOUR_SAVE_RELOAD_REQUIRED',state}
  const fp=JSON.stringify(req.payload)
  if(state.batchRevision!==req.batchRevision){
    if(state.batchRevision===req.batchRevision+1&&state.lastBase===req.batchRevision&&state.lastFp===fp){
      return {ok:true,idempotent:true,state}
    }
    return {ok:false,code:'STALE_LABOUR_SAVE_RELOAD_REQUIRED',state}
  }
  return {ok:true,state:{...state,batchRevision:state.batchRevision+1,lastBase:req.batchRevision,lastFp:fp,assignments:structuredClone(req.payload)}}
}

function payrollSave(state,req){
  if(state.source!==req.source||state.batchRevision!==req.batchRevision){
    return {ok:false,code:'STALE_PAYROLL_SAVE_RELOAD_REQUIRED',state}
  }
  const fp=JSON.stringify(req.payload)
  if(state.payrollRevision!==req.payrollRevision){
    if(state.payrollRevision===req.payrollRevision+1&&state.lastPayrollBase===req.payrollRevision&&state.lastPayrollFp===fp){
      return {ok:true,idempotent:true,state}
    }
    return {ok:false,code:'STALE_PAYROLL_SAVE_RELOAD_REQUIRED',state}
  }
  return {ok:true,state:{...state,payrollRevision:state.payrollRevision+1,lastPayrollBase:req.payrollRevision,lastPayrollFp:fp,payroll:structuredClone(req.payload)}}
}

test('two Labour sessions: A wins, stale B cannot overwrite and its local draft is preserved',()=>{
  const initial={source:'src-a',batchRevision:7,lastBase:null,lastFp:null,assignments:[{worker:'old'}]}
  const draftA=[{worker:'A'}]
  const draftB=[{worker:'B'}]
  const a=labourSave(initial,{source:'src-a',batchRevision:7,payload:draftA})
  assert.equal(a.ok,true)
  const b=labourSave(a.state,{source:'src-a',batchRevision:7,payload:draftB})
  assert.equal(b.ok,false)
  assert.equal(b.code,'STALE_LABOUR_SAVE_RELOAD_REQUIRED')
  assert.deepEqual(b.state.assignments,draftA)
  assert.deepEqual(draftB,[{worker:'B'}])
})

test('Labour exact retry is idempotent but a different stale payload is rejected',()=>{
  const initial={source:'src-a',batchRevision:3,lastBase:null,lastFp:null,assignments:[]}
  const req={source:'src-a',batchRevision:3,payload:[{worker:'A'}]}
  const first=labourSave(initial,req)
  const retry=labourSave(first.state,req)
  assert.equal(retry.ok,true)
  assert.equal(retry.idempotent,true)
  assert.equal(retry.state.batchRevision,4)
  const staleDifferent=labourSave(first.state,{...req,payload:[{worker:'B'}]})
  assert.equal(staleDifferent.ok,false)
})

test('source changed during review rejects stale Labour save before overwrite',()=>{
  const state={source:'src-b',batchRevision:9,lastBase:null,lastFp:null,assignments:[{worker:'current'}]}
  const staleDraft=[{worker:'stale'}]
  const result=labourSave(state,{source:'src-a',batchRevision:8,payload:staleDraft})
  assert.equal(result.ok,false)
  assert.deepEqual(result.state.assignments,[{worker:'current'}])
  assert.deepEqual(staleDraft,[{worker:'stale'}])
})

test('two Payroll sessions: stale B cannot replace A items; exact retry is idempotent',()=>{
  const initial={source:'src-a',batchRevision:5,payrollRevision:2,lastPayrollBase:null,lastPayrollFp:null,payroll:[{worker:'old'}]}
  const reqA={source:'src-a',batchRevision:5,payrollRevision:2,payload:[{worker:'A',ot:1}]}
  const reqB={source:'src-a',batchRevision:5,payrollRevision:2,payload:[{worker:'A',ot:3}]}
  const a=payrollSave(initial,reqA)
  assert.equal(a.ok,true)
  const retry=payrollSave(a.state,reqA)
  assert.equal(retry.ok,true)
  assert.equal(retry.idempotent,true)
  const b=payrollSave(a.state,reqB)
  assert.equal(b.ok,false)
  assert.equal(b.code,'STALE_PAYROLL_SAVE_RELOAD_REQUIRED')
  assert.deepEqual(b.state.payroll,reqA.payload)
})

test('migration compares expected state under row locks before destructive replacement',()=>{
  assert.match(stage,/concurrency_revision bigint not null default 1/)
  assert.match(stage,/for update of b,e/)
  assert.match(stage,/STALE_LABOUR_SAVE_RELOAD_REQUIRED/)
  assert.match(stage,/STALE_PAYROLL_SAVE_RELOAD_REQUIRED/)
  assert.ok(stage.indexOf('STALE_LABOUR_SAVE_RELOAD_REQUIRED')<stage.indexOf('delete from public.labour_daily_assignments'))
  assert.ok(stage.indexOf('STALE_PAYROLL_SAVE_RELOAD_REQUIRED')<stage.lastIndexOf('delete from public.payroll_verification_items'))
  assert.match(stage,/last_save_fingerprint=v_request_fingerprint/)
  assert.match(stage,/v_record\.last_save_fingerprint=v_request_fingerprint/)
})

test('UI snapshots draft base revisions instead of silently adopting background refresh revisions',()=>{
  assert.match(ui,/type DraftBase=\{source_fingerprint:string;batch_revision:number\}/)
  assert.match(ui,/type PayrollDraftBase=DraftBase&\{payroll_revision:number\}/)
  assert.match(ui,/draftBases\[batch\.id\]/)
  assert.match(ui,/payrollDraftBases\[batch\.id\]/)
  assert.match(ui,/p_expected_source_fingerprint:base\.source_fingerprint/)
  assert.match(ui,/p_expected_batch_revision:base\.batch_revision/)
  assert.match(ui,/p_expected_payroll_revision:base\.payroll_revision/)
  assert.match(ui,/ฉบับร่างยังอยู่/)
})

test('cutover removes legacy non-CAS RPC signatures only',()=>{
  assert.match(cutover,/drop function if exists public\.labour_verify_batch\(uuid,text,jsonb\)/)
  assert.match(cutover,/drop function if exists public\.payroll_save_verification\(uuid,text,text,text,text,jsonb\)/)
  assert.doesNotMatch(cutover,/drop table|alter table|policy|rls/i)
})
