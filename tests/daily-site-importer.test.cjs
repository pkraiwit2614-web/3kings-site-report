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

test('GAS splits long source histories into bounded chunks and checks each before writes',()=>{
 assert.match(gas,/for\(let i=0;i<source\.rows\.length;i\+=200\)/);
 assert.match(gas,/const plans=chunks\.map\(rows=>/);
 assert.match(gas,/plans\.forEach\(p=>\{/);
 assert.ok(gas.indexOf("const plans=chunks.map")<gas.indexOf("request.p_mode='commit'"));
 assert.match(gas,/BLOCK_TOTAL_READBACK_COUNT/);
});

test('PostgREST service role guard uses the effective DB role rather than legacy claim GUC',()=>{
 const fix=fs.readFileSync('supabase/migrations/20261019065500_daily_site_rpc_role_guard.sql','utf8');
 assert.match(fix,/security invoker/i);
 assert.match(fix,/current_user <> 'service_role'/);
 assert.doesNotMatch(fix,/coalesce\(current_setting\('request\.jwt\.claim\.role'/);
 assert.match(fix,/revoke all on function public\.daily_site_report_sync_v1\(jsonb,text,jsonb,integer,text\) from public,anon,authenticated/);
 assert.match(fix,/grant execute on function public\.daily_site_report_sync_v1\(jsonb,text,jsonb,integer,text\) to service_role/);
 assert.doesNotMatch(fix,/drop table|truncate table|delete from|alter table.*disable row level security/i);
});
