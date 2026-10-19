import test from 'node:test';
import assert from 'node:assert/strict';
import {isConfigured} from '../../infra/line-autopilot/worker.mjs';

const base = {
 AUTOPILOT_ENABLED:'false',
 SUPABASE_URL:'https://unit-test.supabase.co',
 SUPABASE_SERVER_KEY:'TEST_ONLY',
 LINE_CHANNEL_ACCESS_TOKEN:'TEST_ONLY',
 LINE_OWNER_USER_ID:'U'+'a'.repeat(32)
};

test('owner only sync remains off when AutoPilot disabled',()=>{
 assert.equal(isConfigured(base),false);
});
test('owner-only sync configuration does not require main group ID',()=>{
 assert.equal(isConfigured({...base,AUTOPILOT_ENABLED:'true'}),true);
});
test('invalid owner user ID disables sync collector',()=>{
 assert.equal(isConfigured({...base,AUTOPILOT_ENABLED:'true',LINE_OWNER_USER_ID:'invalid'}),false);
});
test('missing LINE access token disables sync collector',()=>{
 assert.equal(isConfigured({...base,AUTOPILOT_ENABLED:'true',LINE_CHANNEL_ACCESS_TOKEN:''}),false);
});
test('unsupported Supabase endpoint disables sync collector',()=>{
 assert.equal(isConfigured({...base,AUTOPILOT_ENABLED:'true',SUPABASE_URL:'http://localhost:54321'}),false);
});
