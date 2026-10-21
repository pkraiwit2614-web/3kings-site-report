'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root=path.resolve(__dirname,'..');
const smart=fs.readFileSync(path.join(root,'docs/apps-script/SmartSyncDefects_v1.3_2026-10-02.gs'),'utf8');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261019132800_defect_override_field_reconcile_20261019.sql'),'utf8');
const patch=fs.readFileSync(path.join(root,'docs/ai-operations/patches/smartsync-live-proposal-20261021.patch'),'utf8');

test('candidate is already present in Git reference, not a Live deployment',()=>{
  for(const field of ['current_status','status_group','next_action']) {
    assert.match(smart,new RegExp('\\b'+field+': src\\.'+field+','));
    assert.doesNotMatch(smart,new RegExp('\\b'+field+': webConfirmed \\? old\\.'));
    assert.ok(patch.includes('-        '+field+': webConfirmed ? old.'+field+' : src.'+field+','));
  }
});
test('evaluate exactly the three source expressions for manual-marked and unmarked records',()=>{
  const grab=field=>{const m=smart.match(new RegExp('^\\s*'+field+':\\s*(src\\.'+field+'),\\s*$','m'));assert.ok(m,'missing '+field);return m[1];};
  const statusFields=['current_status','status_group','next_action'];
  for (const marked of [true,false]){
    const src={current_status:'Excel newer',status_group:'Hotel - Checked Complete',next_action:'Excel next'};
    const old={current_status:'Web prior',status_group:'Hotel - Awaiting Check',next_action:'Web next',latest_source:marked?'Web App manual update':'Excel'};
    const v=Object.fromEntries(statusFields.map(f=>[f,vm.runInNewContext(grab(f),{src,old,webConfirmed:marked})]));
    assert.deepEqual(v,src);
  }
});
test('canonical source and 263-room inventory still required',()=>{
  assert.match(smart,/SOURCE_FILE_ID/);assert.match(smart,/SOURCE_FILE_NAME/);
  assert.match(smart,/EXPECTED_ROOMS:\s*263/);assert.match(smart,/EXPECTED_A:\s*162/);assert.match(smart,/EXPECTED_B:\s*101/);
  assert.match(smart,/validateDefectInventory_\(parsed\.rows, existing\)/);
  assert.match(smart,/getLastUpdated\(\)\.toISOString\(\)\s*!==\s*modifiedIso/);
});
test('no writer trigger or SQL/DB privileges introduced by 3-line proposal',()=>{
  const additions=patch.split('\n').filter(l=>l.startsWith('+')&&!l.startsWith('+++'));
  const removals=patch.split('\n').filter(l=>l.startsWith('-')&&!l.startsWith('---'));
  assert.equal(additions.length,3);assert.equal(removals.length,3);
  assert.ok(additions.every(x=>/current_status: src\.|status_group: src\.|next_action: src\./.test(x)));
  assert.doesNotMatch(patch,/ScriptApp|PropertiesService|UrlFetchApp|upsert|insert|delete|secret/i);
});
test('SQL still owns pending/synced and new-source field reconciliation',()=>{
  assert.match(sql,/source_sync_state\s*<>\s*'synced'/);
  assert.match(sql,/source_synced_at\s+IS\s+NULL/);
  assert.match(sql,/approved_source\s*:=/);
  assert.match(sql,/new\.source_modified_at\s*>\s*v\.source_synced_at/);
  assert.match(sql,/private\.defect_reconcile_field_versions/);
  assert.match(sql,/conflict_kept_db/);
});
