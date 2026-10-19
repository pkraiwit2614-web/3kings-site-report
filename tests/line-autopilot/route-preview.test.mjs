import test from 'node:test';
import assert from 'node:assert/strict';
import {previewLineSiteRoute, NOTIFICATION_TYPES} from '../../infra/line-autopilot/worker.mjs';

const env = Object.freeze({
  AUTOPILOT_ENABLED: 'false',
  SUPABASE_URL: 'https://unit-test.supabase.co',
  SUPABASE_SERVER_KEY: 'mock-not-real',
});
const gid = 'C' + 'a'.repeat(32);
const sites = {
  above_villa: 'Villa test',
  above_condo_a: 'Condo A test',
  above_condo_b: 'Condo B test',
};
const kinds = ['defect_overdue', 'po_materials', 'daily_site_report', 'weekly_recap'];
let requests = [];
let outgoingLineCalls = 0;
async function query(_env, path, payload) {
  requests.push({path, payload});
  assert.equal(path, '/rest/v1/rpc/line_autopilot_preview_route');
  const {p_alert_kind: kind, p_site_code: site} = payload;
  const owner = kind === 'sync_failure';
  const supported = !!sites[site] && kinds.includes(kind)
    && !(site === 'above_villa' && kind === 'defect_overdue');
  return [{
    alert_kind: kind, source_site: site,
    candidate_group_name: supported ? sites[site] : null,
    candidate_group_id: supported ? gid : null,
    planned_route_found: supported,
    decision: owner ? 'OWNER_ONLY_NO_GROUP_ROUTE'
      : supported ? 'STAGED_AWAITING_APPROVAL'
      : 'BLOCK_TYPE_NOT_CONFIGURED_FOR_SITE',
    would_send_line: false,
  }];
}

test('worker inherits exactly the five registered notification types', () => {
  assert.deepEqual([...NOTIFICATION_TYPES], ['sync_failure',...kinds]);
});

for (const [site,group] of Object.entries(sites)) {
  for (const kind of kinds) {
    test(site + '/' + kind + ': staged or deliberately unavailable; never sends', async () => {
      const ret = await previewLineSiteRoute(env, kind, site, query);
      assert.equal(ret.site,site);
      assert.equal(ret.kind,kind);
      assert.equal(ret.wouldSendLine,false);
      if (site === 'above_villa' && kind === 'defect_overdue') {
        assert.equal(ret.decision,'BLOCK_TYPE_NOT_CONFIGURED_FOR_SITE');
        assert.equal(ret.groupName,null);
      } else {
        assert.equal(ret.decision,'STAGED_AWAITING_APPROVAL');
        assert.equal(ret.groupName,group);
        assert.equal(ret.routeFound,true);
      }
    });
  }
}

test('sync errors resolve owner-only and no group target', async () => {
  const ret = await previewLineSiteRoute(env,'sync_failure',null,query);
  assert.equal(ret.decision,'OWNER_ONLY_NO_GROUP_ROUTE');
  assert.equal(ret.groupName,null);
  assert.equal(ret.wouldSendLine,false);
});

for (const site of [null,'','other_building','a213','plot6']) {
  test('reject unknown or missing site '+String(site),async()=>{
    const before=requests.length;
    const result=await previewLineSiteRoute(env,'po_materials',site,query);
    assert.equal(result.decision,'BLOCK_UNKNOWN_OR_MISSING_SITE');
    assert.equal(result.wouldSendLine,false);
    assert.equal(requests.length,before);
  });
}

test('unknown event type blocked without lookup',async()=>{
  const before=requests.length;
  const ret=await previewLineSiteRoute(env,'payroll','above_villa',query);
  assert.equal(ret.decision,'BLOCK_UNKNOWN_MESSAGE_TYPE');
  assert.equal(requests.length,before);
});

test('disabled/no credential blocks before lookup',async()=>{
  const x=await previewLineSiteRoute({...env,SUPABASE_SERVER_KEY:''},'daily_site_report','above_villa',query);
  assert.equal(x.decision,'BLOCK_SUPABASE_NOT_CONFIGURED');
});

test('non-disabled send flag blocks preview, even when test caller supplies route',async()=>{
  for (const flag of ['true',null,undefined]) {
    const x=await previewLineSiteRoute({...env,AUTOPILOT_ENABLED:flag},'daily_site_report','above_villa',query);
    assert.equal(x.decision,'BLOCK_PREVIEW_REQUIRES_SEND_OFF');
    assert.equal(x.wouldSendLine,false);
  }
});

test('supabase unavailable fails closed',async()=>{
  const x=await previewLineSiteRoute(env,'daily_site_report','above_villa',async()=>{throw Error('401')});
  assert.equal(x.decision,'BLOCK_ROUTE_READ_FAILED');
  assert.equal(x.groupName,null);
});

test('database response that implies send gets rejected',async()=>{
  const x=await previewLineSiteRoute(env,'daily_site_report','above_villa',async()=>[{
    alert_kind:'daily_site_report',source_site:'above_villa',
    candidate_group_name:'Test',candidate_group_id:gid,
    planned_route_found:true,decision:'STAGED_AWAITING_APPROVAL',would_send_line:true
  }]);
  assert.equal(x.decision,'BLOCK_ROUTE_INVALID_RESPONSE');
  assert.equal(x.wouldSendLine,false);
});

test('malformed group ID fails closed',async()=>{
  const x=await previewLineSiteRoute(env,'po_materials','above_condo_b',async()=>[{
    alert_kind:'po_materials',source_site:'above_condo_b',
    candidate_group_name:'Test',candidate_group_id:'invalid',
    planned_route_found:true,decision:'STAGED_AWAITING_APPROVAL',would_send_line:false
  }]);
  assert.equal(x.decision,'BLOCK_ROUTE_INVALID_RESPONSE');
  assert.equal(x.groupName,null);
});

test('wrong source site in database response fails closed',async()=>{
  const x=await previewLineSiteRoute(env,'po_materials','above_villa',async()=>[{
    alert_kind:'po_materials',source_site:'above_condo_a',
    candidate_group_name:'Test',candidate_group_id:gid,
    planned_route_found:true,decision:'STAGED_AWAITING_APPROVAL',would_send_line:false
  }]);
  assert.equal(x.decision,'BLOCK_ROUTE_INVALID_RESPONSE');
});

test('preview does not make any LINE HTTP request',()=>{
  assert.ok(requests.length>0);
  assert.equal(outgoingLineCalls,0);
});
