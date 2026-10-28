'use strict';
// 3 Kings closure receipt QA. Offline/READ_ONLY; no network, production writes, or credentials.
// Receipts are assertions by an operator; CANDIDATE_FOR_REVIEW does NOT prove live state.
const fs=require('node:fs');
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
const SHA=/^[a-f0-9]{40}$/i;
const KEY=/^[A-Z][A-Z0-9_-]*(?::[A-Z0-9_+.-]+){2,6}$/;
const GATES=new Set(['source','sync','database','ui','ci','production','migration','site_acceptance']);
const STATES=new Set(['PASS','FAIL','HOLD','UNVERIFIED','SKIPPED']);
function utc(s){if(typeof s!=='string'||!ISO.test(s))return null;const ms=Date.parse(s);return Number.isFinite(ms)?ms:null}
function uniq(a){return [...new Set(a)]}
function evaluateTask(task,duplicate,resourceConflicts){
 const blockers=[];const t=task&&typeof task==='object'?task:{};
 if(!KEY.test(t.task_key||''))blockers.push('INVALID_TASK_KEY');
 if(duplicate)blockers.push('DUPLICATE_TASK_KEY');
 const required=t.required_gates;
 if(!Array.isArray(required)||required.length===0||required.some(x=>!GATES.has(x))||
   new Set(required).size!==required.length)blockers.push('INVALID_REQUIRED_GATES');
 const scope=t.scope||{};
 const id=scope.source_id,revision=scope.source_revision;
 const needsSource=Array.isArray(required)&&required.some(x=>['source','sync','database','ui'].includes(x));
 if(needsSource&&(!id||!revision))blockers.push('SOURCE_ID_OR_REVISION_MISSING');
 if(scope.head_sha!==undefined&&!SHA.test(scope.head_sha))blockers.push('INVALID_HEAD_SHA');
 const changed=utc(scope.source_modified_at);
 if(scope.source_modified_at!==undefined&&changed===null)blockers.push('INVALID_SOURCE_MODIFIED_AT');
 const proof=t.proofs||{};
 for(const gate of Array.isArray(required)?required:[]){
   if(!GATES.has(gate))continue;
   const p=proof[gate];
   if(!p||typeof p!=='object'){blockers.push('MISSING_'+gate.toUpperCase());continue}
   if(!STATES.has(p.status)||p.status!=='PASS'){blockers.push('NOT_PASS_'+gate.toUpperCase());continue}
   if(typeof p.ref!=='string'||!p.ref.trim())blockers.push('NO_REF_'+gate.toUpperCase());
   const checked=utc(p.checked_at);
   if(checked===null)blockers.push('BAD_TIME_'+gate.toUpperCase());
   if(changed!==null&&checked!==null&&checked<changed)blockers.push('STALE_'+gate.toUpperCase());
   if(['source','sync','database','ui'].includes(gate)){
     if(p.source_id!==id||p.source_revision!==revision)blockers.push('SOURCE_MISMATCH_'+gate.toUpperCase());
   }
   if(gate==='sync'&&!p.batch_id)blockers.push('NO_SYNC_BATCH');
   if(gate==='database'&&(!Number.isSafeInteger(p.verified_rows)||p.verified_rows<0))blockers.push('DB_ROWS_UNVERIFIED');
   if(gate==='ui'&&(!p.role||['anon','anonymous','public','unauthenticated'].includes(String(p.role).toLowerCase())))blockers.push('UI_AUTH_UNVERIFIED');
   if(gate==='ci'&&(!SHA.test(scope.head_sha)||p.head_sha!==scope.head_sha))blockers.push('CI_SHA_MISMATCH');
   if(gate==='production'&&(!SHA.test(scope.head_sha)||p.deployed_sha!==scope.head_sha))blockers.push('PRODUCTION_SHA_MISMATCH');
   if(gate==='migration'&&(!scope.migration_version||p.applied_version!==scope.migration_version))blockers.push('MIGRATION_VERSION_MISMATCH');
   if(gate==='site_acceptance'&&p.accepted_by==='synthetic')blockers.push('SYNTHETIC_SITE_ACCEPTANCE');
 }
 if(Array.isArray(t.writes))for(const w of t.writes){if(resourceConflicts.has(w))blockers.push('ACTIVE_WRITER_CONFLICT')}
 return {task_key:t.task_key||null,state:blockers.length?'HOLD':'CANDIDATE_FOR_REVIEW',blockers:uniq(blockers).sort(),required_gates:Array.isArray(required)?required:[]};
}
function evaluateBoard(payload){
 if(!payload||payload.schema_version!==1||!Array.isArray(payload.tasks))throw Error('INVALID_BOARD_SCHEMA');
 if(payload.tasks.length>100)throw Error('BOARD_TOO_LARGE');
 const counts=new Map(),resources=new Map();
 for(const task of payload.tasks){
  const key=task?.task_key||'';
  counts.set(key,(counts.get(key)||0)+1);
  const writes=Array.isArray(task?.writes)?new Set(task.writes):new Set();
  for(const w of writes){if(typeof w!=='string'||!w.trim())continue;resources.set(w,(resources.get(w)||0)+1)}
 }
 const conflicts=new Set([...resources].filter(([,count])=>count>1).map(([w])=>w));
 const tasks=payload.tasks.map(t=>evaluateTask(t,counts.get(t?.task_key||'')>1,conflicts));
 return {schema_version:1,mode:'READ_ONLY_OFFLINE_STAGING',runtime_enforcement:false,source_authentication:'NOT_VERIFIED_BY_THIS_TOOL',tasks,summary:{total:tasks.length,candidates:tasks.filter(t=>t.state==='CANDIDATE_FOR_REVIEW').length,hold:tasks.filter(t=>t.state==='HOLD').length}};
}
function markdown(report){
 const clean=s=>String(s??'').replace(/[|\r\n]/g,' ').slice(0,250);
 return ['# 3 Kings — Closure Evidence QA (offline only)',
  'This is a receipt consistency check, not a live Production verification or execution authorization.',
  '', '| Task key | Status | Blockers |','|---|---|---|',
  ...report.tasks.map(t=>`| ${clean(t.task_key)} | ${t.state} | ${clean(t.blockers.join(', ')||'none')} |`),
  '',`Totals: ${report.summary.candidates} review candidates; ${report.summary.hold} HOLD. No tasks were closed.`,
  ''].join('\n');
}
if(require.main===module){
 const arg=process.argv[2];
 if(!arg||process.argv.length!==3){process.stderr.write('Usage: node scripts/ai-operations/closure-evidence-gate.cjs <local-json-receipt>\n');process.exitCode=2}
 else try{
  const input=JSON.parse(fs.readFileSync(arg,'utf8'));
  const report=evaluateBoard(input);
  process.stdout.write(markdown(report));
  if(report.summary.hold)process.exitCode=1;
 }catch(err){process.stderr.write('CLOSURE_GATE_ERROR: '+String(err.message).replace(/[\r\n]/g,' ')+'\n');process.exitCode=2}
}
module.exports={evaluateBoard,evaluateTask,markdown};
