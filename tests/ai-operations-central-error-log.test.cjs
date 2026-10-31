'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {normalizeEvent, buildReport, fromSupabaseSyncRun, fromGitHubWorkflowRun,
  inspectGasSnapshot} = require('../scripts/ai-operations/central-error-log.cjs');
const {main} = require('../scripts/ai-operations/triage-cli.cjs');
const NOW = new Date('2026-10-20T08:00:00Z');
const event = (extra={}) => ({source:'SUPABASE_SYNC',component:'materials',status:'FAILED',
  code:'SYNC_HTTP_500',occurredAt:'2026-10-20T07:00:00Z',eventId:'run-1',...extra});

test('staging records are metadata-only and cannot dispatch', () => {
  const r = normalizeEvent(event({message:'Bearer secret; A417; test@example.com; +66812345678'}), NOW);
  assert.equal(r.executionMode, 'DISABLED_STAGING');
  assert.equal(r.dispatchAllowed, false);
  assert.equal(r.proposedExecutor, 'sync-investigator');
  const json = JSON.stringify(r);
  for(const secret of ['Bearer','secret','A417','test@example.com','66812345678'])
    assert.equal(json.includes(secret), false);
});
test('untrusted code/component cannot leak tokens into public log', () => {
  const r = normalizeEvent(event({component:'customer_0800000000',code:'SYNC_SUPERSECRET_123456789'}),NOW);
  assert.equal(r.errorCode,'SECRET_ERROR');
  assert.match(r.component,/^COMPONENT_SHA256_[0-9a-f]{12}$/);
  assert.equal(JSON.stringify(r).includes('SUPERSECRET'),false);
  assert.equal(JSON.stringify(r).includes('0800000000'),false);
});
test('reject unknown source, invalid state and future events', () => {
  assert.throws(() => normalizeEvent(event({source:'PAYROLL_WRITER'}), NOW), /UNKNOWN_SOURCE/);
  assert.throws(() => normalizeEvent(event({status:'EXECUTE'}), NOW), /INVALID_STATE/);
  assert.throws(() => normalizeEvent(event({occurredAt:'2026-10-21T00:00:00Z'}), NOW), /FUTURE_EVENT_QUARANTINED/);
});
test('security errors always require manual review', () => {
  const r = normalizeEvent(event({code:'RLS_PERMISSION_DENIED'}), NOW);
  assert.equal(r.severity, 'CRITICAL');
  assert.equal(r.proposedAction, 'MANUAL_SECURITY_REVIEW');
});
test('same occurrence deduped, repeated occurrences preserved', () => {
  const a = event();
  const b = event({eventId:'run-2',occurredAt:'2026-10-20T07:10:00Z'});
  const report = buildReport([a,a,b], NOW);
  assert.equal(report.acceptedCount, 2);
  assert.equal(report.groups.length, 1);
  assert.equal(report.groups[0].occurrences, 2);
  assert.equal(report.groups[0].latestState, 'FAILED');
});
test('success observation does not erase earlier failure', () => {
  const report = buildReport([event(), event({status:'RECOVERED',eventId:'run-3',occurredAt:'2026-10-20T07:20:00Z'})], NOW);
  assert.equal(report.events.length, 2);
  assert.equal(report.groups[0].occurrences, 2);
});
test('reject malformed events without exposing their raw contents', () => {
  const report = buildReport([event(),{source:'HACK',message:'secret'},{}], NOW);
  assert.equal(report.acceptedCount, 1);
  assert.deepEqual(report.rejected.map(x=>x.code),['UNKNOWN_SOURCE','UNKNOWN_SOURCE']);
  assert.equal(JSON.stringify(report).includes('secret'),false);
});
test('Supabase sync conversion preserves only metadata', () => {
  const r = fromSupabaseSyncRun({sync_type:'materials',status:'error',created_at:'2026-10-20T07:00:00Z',id:'x',message:'token'});
  assert.equal(r.source,'SUPABASE_SYNC');
  assert.equal(r.state,'FAILED');
  assert.equal(JSON.stringify(r).includes('token'),false);
  assert.equal(fromSupabaseSyncRun({status:'pending'}),null);
});
test('GitHub workflow conversion maps failure without deployment', () => {
  const r = fromGitHubWorkflowRun({name:'CI',conclusion:'failure',created_at:'2026-10-20T07:00:00Z',id:44});
  assert.equal(r.source,'GITHUB_ACTIONS');
  assert.equal(r.state,'FAILED');
  assert.equal(r.code,'WORKFLOW_FAILURE');
});
test('Apps Script snapshot reports partial current-user visibility, not enabled', () => {
  const r = inspectGasSnapshot({schemaVersion:1,collector:'GAS_CURRENT_USER_TRIGGER_INVENTORY',
    collectedAt:'2026-10-20T07:00:00Z',triggers:[{handler:'dailySiteSyncHourly20261019',registration:'REGISTERED_FOR_CURRENT_USER'}]},NOW);
  assert.equal(r.status,'PARTIAL_CURRENT_USER');
  assert.equal(r.enabledStatus,'NOT_EXPOSED_BY_SCRIPTAPP');
  assert.equal(r.otherOwners,'NOT_VISIBLE');
  assert.equal(r.dispatchAllowed,false);
});
test('old GAS snapshots are stale, not live proof', () => {
  const r = inspectGasSnapshot({schemaVersion:1,collector:'GAS_CURRENT_USER_TRIGGER_INVENTORY',
    collectedAt:'2026-10-18T07:00:00Z',triggers:[]},NOW);
  assert.equal(r.status,'STALE');
});
test('CLI writes local output once, cannot overwrite source or existing report', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'3kings-p0b-'));
  try {
    const source = path.join(dir,'input.json'); const output=path.join(dir,'output.json');
    fs.writeFileSync(source,JSON.stringify([event()]));
    assert.equal(main(['--input',source,'--output',output]),0);
    assert.equal(JSON.parse(fs.readFileSync(output)).mode,'STAGING_NO_DISPATCH');
    assert.throws(()=>main(['--input',source,'--output',output]), /EEXIST/);
    assert.throws(()=>main(['--input',source,'--output',source]), /BLOCK_OVERWRITE_SOURCE/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('no mutation methods in GAS inventory collector', () => {
  const source = fs.readFileSync(path.resolve(__dirname,'../docs/apps-script/AI_Operations_Trigger_Inventory_ReadOnly_2026-10-20.gs'),'utf8');
  assert.match(source,/ScriptApp\.getProjectTriggers\(\)/);
  for(const forbidden of ['ScriptApp.newTrigger(', 'deleteTrigger(', 'UrlFetchApp.fetch(', 'setProperty(', 'SpreadsheetApp.openById('])
    assert.equal(source.includes(forbidden),false);
});