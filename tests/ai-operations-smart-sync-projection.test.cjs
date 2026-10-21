'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {patch} = require('../scripts/ai-operations/patch-smart-sync-projection.cjs');
const fixture = `const DEFECT_V13 = {EXPECTED_ROOMS:263,EXPECTED_A:162,EXPECTED_B:101};
function runDefectSyncV13_(){
if(file.getId() !== DEFECT_V13.SOURCE_FILE_ID)throw Error('source');
validateDefectInventory_(rows, existing);
const webConfirmed = old.latest_source === 'Web App manual update';
return {current_status: webConfirmed ? old.current_status : src.current_status,
status_group: webConfirmed ? old.status_group : src.status_group,
next_action: webConfirmed ? old.next_action : src.next_action,
latest_source: webConfirmed ? old.latest_source : (src.latest_source || old.latest_source || null),
source_note: webConfirmed ? (old.source_note || null) : (src.source_note || old.source_note || null)};
}
function defectV13ScopedChanges_() {return 1;}
`;
function project(code,src,old) {
  const body = code.slice(code.indexOf('const webConfirmed ='),code.indexOf('\n}\nfunction defectV13ScopedChanges_'));
  return Function('src','old','const file={getId:()=>null};'+body)(src,old);
}
const old={current_status:'WEB',status_group:'WEB_GROUP',next_action:'WEB_NEXT',latest_source:'Web App manual update',source_note:'WEB_NOTE'};
const src={current_status:'EXCEL',status_group:'EXCEL_GROUP',next_action:'EXCEL_NEXT',latest_source:'Excel',source_note:'EXCEL_NOTE'};
test('red/green: synced Web provenance must not pre-substitute old values ahead of SQL guard',()=>{
  const before=project(fixture,src,old);
  assert.equal(before.current_status,'WEB');
  const result=patch(fixture);
  assert.deepEqual(result.changedFields,['current_status','status_group','next_action']);
  const after=project(result.content,src,old);
  assert.equal(after.current_status,'EXCEL');
  assert.equal(after.status_group,'EXCEL_GROUP');
  assert.equal(after.next_action,'EXCEL_NEXT');
  assert.equal(after.latest_source,old.latest_source);
  assert.equal(after.source_note,old.source_note);
});
test('no Web provenance stays Excel-proposed and preserves original provenance behavior',()=>{
  const r=project(patch(fixture).content,src,{...old,latest_source:'Excel'});
  assert.equal(r.current_status,'EXCEL');
  assert.equal(r.latest_source,'Excel');
});
test('patch changes exactly the three expressions; retains original safety gates',()=>{
  const out=patch(fixture).content;
  let expected=fixture;
  for (const field of ['current_status','status_group','next_action'])
    expected=expected.replace(`${field}: webConfirmed ? old.${field} : src.${field},`,`${field}: src.${field},`);
  assert.equal(out,expected);
  assert.match(out,/EXPECTED_ROOMS:263/);
  assert.match(out,/validateDefectInventory_/);
});
test('fail closed on missing or duplicated source lines',()=>{
  assert.throws(()=>patch(fixture.replace('current_status: webConfirmed ?', 'current_status: src.')),/MATCH_COUNT/);
  assert.throws(()=>patch(fixture.replace('function defectV13ScopedChanges_','// edited\nfunction blah')),/SAFETY_GUARD/);
  assert.throws(()=>patch(fixture.replace('function defectV13ScopedChanges_','next_action: webConfirmed ? old.next_action : src.next_action,\nfunction defectV13ScopedChanges_')),/MATCH_COUNT/);
});
test('does not edit unrelated Web provenance or source mapping',()=>{
  const out=patch(fixture).content;
  assert.ok(out.includes('source_note: webConfirmed ? (old.source_note || null)'));
  assert.ok(out.includes('file.getId() !== DEFECT_V13.SOURCE_FILE_ID'));
});
