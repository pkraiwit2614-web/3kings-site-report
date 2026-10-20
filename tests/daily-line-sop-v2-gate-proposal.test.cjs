'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const filename='docs/release-candidates/20261020_daily_line_sop_v2_GATE_PROPOSAL_NOT_DEPLOYED.sql';
const src=fs.readFileSync(filename,'utf8');

test('SOP v2 publisher gate is reference-only, not auto-applied',()=>{
  assert.match(src,/REFERENCE-ONLY P2 RELEASE CANDIDATE/);
  assert(!fs.readdirSync('supabase/migrations').some(x=>x.includes('daily_line_sop_v2')));
  assert.equal((src.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
  assert.match(src,/public\.daily_line_finalize\(/);
  assert.doesNotMatch(src,/\b(GRANT|REVOKE|DROP|TRUNCATE|DELETE FROM|UPDATE line_autopilot)\b/i);
});
test('new report dates require two independent ACTIVE v2 SOP proofs',()=>{
  assert.match(src,/WHEN p_report_date>='2026-10-20'::date THEN NOT/);
  assert.match(src,/sopSheetsV2Read/);
  assert.match(src,/sopPublishV2Read/);
  assert.match(src,/sheetReadbackVerified/);
});
test('historical report evidence and safeguards remain backwards compatible',()=>{
  assert.match(src,/WHEN p_report_date>='2026-10-19'::date THEN NOT/);
  assert.match(src,/sopSheetsV14Read/);
  assert.match(src,/sopPublishV1Read/);
  assert.match(src,/sopV13Read/);
  for(const guard of ['SERVICE_ROLE_ONLY','BLOCK_MANUAL_RUN_NOT_VERIFIED','BLOCK_QA_INCOMPLETE',
    'BLOCK_PNG_ASSETS_INCOMPLETE','BLOCK_FINALIZED_MANIFEST_CHANGED']){
    assert(src.includes(guard),guard);
  }
  assert.match(src,/v_count<>4/);
  assert.match(src,/ON CONFLICT\(report_date\)/);
});
