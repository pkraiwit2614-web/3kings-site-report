'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {evaluateBoard,markdown}=require('../scripts/ai-operations/closure-evidence-gate.cjs');
const sha='a'.repeat(40);
const now='2026-10-28T05:00:00Z';
const base={schema_version:1,tasks:[]};
function proof(g){
 const p={status:'PASS',ref:'verified://test-qa-receipt',checked_at:now};
 if(['source','sync','database','ui'].includes(g)){p.source_id='canonical-file';p.source_revision='rev-7'}
 if(g==='sync')p.batch_id='batch-1';
 if(g==='database')p.verified_rows=3;
 if(g==='ui')p.role='qa-viewer';
 if(g==='ci')p.head_sha=sha;
 if(g==='production')p.deployed_sha=sha;
 if(g==='migration')p.applied_version='20261027233000';
 if(g==='site_acceptance')p.accepted_by='supervisor-with-proof';
 return p;
}
function task(){
 const required=['source','sync','database','ui','ci','production','migration','site_acceptance'];
 return {task_key:'DEFECT:B515:SYNC',
  scope:{source_id:'canonical-file',source_revision:'rev-7',
    source_modified_at:'2026-10-28T01:00:00Z',head_sha:sha,migration_version:'20261027233000'},
  required_gates:required,proofs:Object.fromEntries(required.map(g=>[g,proof(g)])),writes:['source:canonical-file']};
}
const evaluate=ts=>evaluateBoard({...base,tasks:ts});
test('complete consistent receipt is only CANDIDATE_FOR_REVIEW, never DONE',()=>{
 const r=evaluate([task()]);
 assert.equal(r.tasks[0].state,'CANDIDATE_FOR_REVIEW');
 assert.equal(r.summary.candidates,1);
 assert.equal(r.runtime_enforcement,false);
 assert.equal(r.source_authentication,'NOT_VERIFIED_BY_THIS_TOOL');
});
test('missing authenticated UI cannot be marked PASS',()=>{
 const t=task();delete t.proofs.ui;
 assert.ok(evaluate([t]).tasks[0].blockers.includes('MISSING_UI'));
 const s=task();s.proofs.ui.status='SKIPPED';
 assert.ok(evaluate([s]).tasks[0].blockers.includes('NOT_PASS_UI'));
 const anon=task();anon.proofs.ui.role='anon';
 assert.ok(evaluate([anon]).tasks[0].blockers.includes('UI_AUTH_UNVERIFIED'));
});
test('source revision stale or changed cannot close a task',()=>{
 const t=task();t.proofs.sync.source_revision='different';
 assert.ok(evaluate([t]).tasks[0].blockers.includes('SOURCE_MISMATCH_SYNC'));
 const stale=task();stale.proofs.database.checked_at='2026-10-27T23:00:00Z';
 assert.ok(evaluate([stale]).tasks[0].blockers.includes('STALE_DATABASE'));
});
test('no false pass for CI, deployed SHA or migration version',()=>{
 const t=task();t.proofs.ci.head_sha='b'.repeat(40);
 t.proofs.production.deployed_sha='b'.repeat(40);
 t.proofs.migration.applied_version='20261028220000';
 const b=evaluate([t]).tasks[0].blockers;
 for(const x of ['CI_SHA_MISMATCH','PRODUCTION_SHA_MISMATCH','MIGRATION_VERSION_MISMATCH'])assert.ok(b.includes(x));
});
test('no fake site completion, missing batch or database row verification',()=>{
 const t=task();t.proofs.site_acceptance.accepted_by='synthetic';
 t.proofs.sync.batch_id='';
 t.proofs.database.verified_rows=undefined;
 const b=evaluate([t]).tasks[0].blockers;
 for(const x of ['SYNTHETIC_SITE_ACCEPTANCE','NO_SYNC_BATCH','DB_ROWS_UNVERIFIED'])assert.ok(b.includes(x));
});
test('duplicate task keys and concurrent writers are blocked',()=>{
 const t=task(),u=task();u.task_key='DAILY:SITE_SYNC:ROWS354+';
 const r=evaluate([t,task(),u]);
 assert.ok(r.tasks[0].blockers.includes('DUPLICATE_TASK_KEY'));
 assert.ok(r.tasks[1].blockers.includes('DUPLICATE_TASK_KEY'));
 assert.ok(r.tasks[2].blockers.includes('ACTIVE_WRITER_CONFLICT'));
 assert.equal(r.summary.hold,3);
});
test('invalid schema/required gates fail closed',()=>{
 assert.throws(()=>evaluateBoard({schema_version:2,tasks:[]}),/INVALID_BOARD_SCHEMA/);
 const t=task();t.required_gates=['source','source'];
 assert.ok(evaluate([t]).tasks[0].blockers.includes('INVALID_REQUIRED_GATES'));
});
test('markdown output is sanitized, no task is marked DONE',()=>{
 const t=task();t.task_key='DEFECT:B515:SYNC|EVADE';
 const report=evaluate([t]);const text=markdown(report);
 assert.ok(text.includes('HOLD'));
 assert.ok(!text.includes('DONE'));
 assert.ok(!text.includes('SYNC|EVADE'));
});
test('pure read-only artifact contains no outbound provider calls or db writes',()=>{
 const source=fs.readFileSync('scripts/ai-operations/closure-evidence-gate.cjs','utf8');
 assert.doesNotMatch(source,/(?:fetch|axios|https\.request|child_process|execSync|spawnSync)\s*\(/);
 assert.doesNotMatch(source,/\b(?:INSERT INTO|UPDATE public\.|DELETE FROM|DROP TABLE)\b/i);
});
