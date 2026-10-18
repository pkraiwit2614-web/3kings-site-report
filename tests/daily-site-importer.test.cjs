const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const pg=fs.readFileSync('supabase/migrations/20261019123000_daily_site_report_independent_sync.sql','utf8');
const gas=fs.readFileSync('docs/apps-script/DailySiteReportSync_2026-10-19.gs','utf8');
test('standalone trigger strictly additive; 9 old handlers never deleted',()=>{
 assert.match(gas,/function installDailySiteTrigger20261019\(/);
 assert.match(gas,/newTrigger\(name\)\.timeBased\(\)\.everyHours\(1\)/);
 assert.doesNotMatch(gas,/deleteTrigger\(/);
 assert.match(gas,/others\.some\(/);
 assert.match(gas,/MIN_ROW:354/);
});
test('source pinned to verified native Form, tab and complete 13-column headers',()=>{
 assert.match(gas,/1-ZSZXulxaje4vDP1ztvUBXsjlmffjAcDu0w1OHRnpUw/);
 assert.match(gas,/การตอบแบบฟอร์ม 1/);
 assert.match(gas,/BLOCK_SOURCE_MIME_MISMATCH/);
 assert.match(gas,/BLOCK_SOURCE_HEADER_MISMATCH_AT_/);
 assert.match(gas,/BLOCK_HEADCOUNT_MISMATCH_ROW_/);
});
test('source fingerprint is computed and checked, CAS preflight precedes live import',()=>{
 assert.match(pg,/sha256\(convert_to\(/);
 assert.match(pg,/p_expected->>v_key is distinct from v_prior\.source_fingerprint/);
 assert.match(pg,/DSR_CONCURRENT_SOURCE_REVISION/);
 assert.match(pg,/DSR2\|/);
 assert.match(pg,/DSR_READBACK_MISMATCH/);
 assert.match(gas,/p_mode:'dry_run'/);
 assert.match(gas,/request\.p_mode='commit'/);
 assert.match(gas,/BLOCK_SOURCE_REVISION_CHANGED/);
 assert.ok(gas.indexOf("const dry=dailySiteSyncRpc20261019_")<gas.indexOf("request.p_mode='commit'"));
});
test('legacy and payroll rows are immutable, no unrelated table modifications',()=>{
 assert.match(pg,/v_row < 354/);
 assert.match(pg,/LEGACY_ROW_NEEDS_RECONCILIATION/);
 assert.match(pg,/public\.labour_daily_assignments a/);
 assert.match(pg,/public\.payroll_verification_records pr/);
 assert.match(pg,/v_has_locked_finance/);
 assert.doesNotMatch(pg,/\bdelete\s+from\b/i);
 assert.doesNotMatch(pg,/\btruncate\b/i);
 assert.doesNotMatch(pg,/\bdrop\s+(?:table|trigger|policy)\b/i);
 assert.match(pg,/rows_inserted/);
 assert.match(pg,/rows_verified/);
});
test('read-only mode cannot write and source rows are present only via RPC transaction',()=>{
 assert.match(pg,/if p_mode='commit' then/);
 assert.match(pg,/if p_mode='commit' and \(v_inserted\+v_updated\)>0 then/);
 assert.match(gas,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.doesNotMatch(gas,/Logger\.log\(.*(?:key|token)/);
 assert.doesNotMatch(gas,/ScriptApp\.deleteTrigger\(/);
});
