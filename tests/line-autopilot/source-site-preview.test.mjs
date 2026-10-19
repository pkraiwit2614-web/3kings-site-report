import test from 'node:test';
import assert from 'node:assert/strict';
import {previewLineSourceEvent} from '../../infra/line-autopilot/worker.mjs';

const env={AUTOPILOT_ENABLED:'false',SUPABASE_URL:'https://unit-test.supabase.co',SUPABASE_SERVER_KEY:'fake-test-only'};
const gid='C'+'a'.repeat(32);
const puid='00000000-0000-4000-8000-000000000001';
function mockedQuery(projectCode,seen=[]) {
  return async (_env,path,body) => {
    seen.push(path);
    if(path.startsWith('/rest/v1/projects?')) return [{code:projectCode,active:true}];
    assert.equal(path,'/rest/v1/rpc/line_autopilot_preview_route');
    assert.ok(['above_villa','above_condo_a','above_condo_b'].includes(body.p_site_code)||body.p_site_code===null);
    return [{
      alert_kind:body.p_alert_kind,source_site:body.p_site_code,
      candidate_group_name:body.p_site_code ? 'Test group' : null,
      candidate_group_id:body.p_site_code ? gid : null,
      planned_route_found:!!body.p_site_code,
      decision:body.p_site_code?'STAGED_AWAITING_APPROVAL':'OWNER_ONLY_NO_GROUP_ROUTE',
      would_send_line:false
    }];
  };
}
for (const [code,site] of [
  ['AV-P6','above_villa'],['AV-P9','above_villa'],['AV-COMMON','above_villa'],
  ['CONDO-A','above_condo_a'],['CONDO-B','above_condo_b']
]) {
  test('materials source project '+code+' routes to '+site+' with no push',async()=>{
    const result=await previewLineSourceEvent(env,'po_materials',{kind:'materials',project_id:puid},mockedQuery(code));
    assert.equal(result.site,site);
    assert.equal(result.decision,'STAGED_AWAITING_APPROVAL');
    assert.equal(result.wouldSendLine,false);
  });
}

test('defect source building A routes only to Condo A, not Villa',async()=>{
  const result=await previewLineSourceEvent(env,'defect_overdue',{kind:'defect_work_order',building:'A'},mockedQuery(null));
  assert.equal(result.site,'above_condo_a');
  assert.equal(result.wouldSendLine,false);
});
test('defect source building B routes only to Condo B',async()=>{
  const result=await previewLineSourceEvent(env,'defect_overdue',{kind:'defect_work_order',building:'B'},mockedQuery(null));
  assert.equal(result.site,'above_condo_b');
});
test('defect without recognized building blocked',async()=>{
  const result=await previewLineSourceEvent(env,'defect_overdue',{kind:'defect_work_order',building:'X'},async()=>{throw Error('should not query')});
  assert.equal(result.decision,'BLOCK_UNKNOWN_OR_MISSING_SITE');
});
test('materials with null project blocks before fetch',async()=>{
  const result=await previewLineSourceEvent(env,'po_materials',{kind:'materials',project_id:null},async()=>{throw Error('should not query')});
  assert.equal(result.decision,'BLOCK_MISSING_PROJECT_ID');
});
test('Mirage project is outside configured sites',async()=>{
  const result=await previewLineSourceEvent(env,'po_materials',{kind:'materials',project_id:puid},mockedQuery('MIRAGE'));
  assert.equal(result.decision,'BLOCK_OUTSIDE_CONFIGURED_SITES');
});
test('inactive project blocked',async()=>{
  const result=await previewLineSourceEvent(env,'daily_site_report',{kind:'daily_site_report',project_id:puid},
    async(_e,path)=>path.startsWith('/rest/v1/projects?')?[{code:'AV-P6',active:false}]:[]);
  assert.equal(result.decision,'BLOCK_PROJECT_NOT_VERIFIED');
});
test('project lookup 401 blocked, never falls back to hardcoded route',async()=>{
  const result=await previewLineSourceEvent(env,'po_materials',{kind:'materials',project_id:puid},
    async()=>{throw Error('401 permission denied')});
  assert.equal(result.decision,'BLOCK_PROJECT_LOOKUP_FAILED');
  assert.equal(result.groupName,null);
});
test('daily site report uses project ID, not group names in free text',async()=>{
  const result=await previewLineSourceEvent(env,'daily_site_report',{kind:'daily_site_report',project_id:puid},mockedQuery('AV-P6'));
  assert.equal(result.site,'above_villa');
  assert.equal(result.wouldSendLine,false);
});
test('weekly recap uses verified project mapping',async()=>{
  const result=await previewLineSourceEvent(env,'weekly_recap',{kind:'weekly_recap',project_id:puid},mockedQuery('CONDO-B'));
  assert.equal(result.site,'above_condo_b');
});
test('wrong category/source combination blocked',async()=>{
  const result=await previewLineSourceEvent(env,'defect_overdue',{kind:'materials',project_id:puid},async()=>{throw Error('should not query')});
  assert.equal(result.decision,'BLOCK_SOURCE_KIND_MISMATCH');
});
test('sync failure without error is not an alert',async()=>{
  const result=await previewLineSourceEvent(env,'sync_failure',{kind:'drive_sync_log',status:'success'},async()=>{throw Error('should not query')});
  assert.equal(result.decision,'BLOCK_NO_CONFIRMED_SYNC_FAILURE');
});
test('verified sync error routes owner only',async()=>{
  const result=await previewLineSourceEvent(env,'sync_failure',{kind:'drive_sync_log',status:'error'},mockedQuery(null));
  assert.equal(result.decision,'OWNER_ONLY_NO_GROUP_ROUTE');
  assert.equal(result.groupName,null);
  assert.equal(result.wouldSendLine,false);
});
test('unknown source rejected',async()=>{
  const result=await previewLineSourceEvent(env,'daily_site_report',{kind:'random'},async()=>{throw Error('should not query')});
  assert.equal(result.decision,'BLOCK_SOURCE_NOT_IDENTIFIED');
});
test('non-disabled autopilot blocks dry-run source mapping',async()=>{
  const result=await previewLineSourceEvent({...env,AUTOPILOT_ENABLED:'true'},'daily_site_report',{kind:'daily_site_report',project_id:puid},async()=>{throw Error('should not query')});
  assert.equal(result.decision,'BLOCK_PREVIEW_REQUIRES_SEND_OFF');
});
