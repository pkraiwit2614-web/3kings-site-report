'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');

const workerPath = path.resolve(__dirname, '../operations/cloudflare/3kings-line-autopilot-owner-only.mjs');
const workerPromise = import(pathToFileURL(workerPath).href);

const validSha = s => /^[0-9a-f]{64}$/.test(s);
const sha256 = async s => createHash('sha256').update(s).digest('hex');

const defaultEnv = {
  SUPABASE_URL: 'https://wtqubwdduzedmcvyhbgs.supabase.co',
  SUPABASE_SERVER_KEY: 'sb_secret_test_key_for_testing_purposes_only',
  LINE_CHANNEL_ACCESS_TOKEN: 'line-test-token',
  LINE_OWNER_USER_ID: 'U11111111111111111111111111111111',
  SYNC_OWNER_MONITOR_ENABLED: 'true',
  SYNC_OWNER_ENABLED_PIPELINES: 'schedule,materials',
  DAILY_LINE_BRIDGE_TOKEN: 'bridge-secret-test-token'
};

function makeFixture({ quotaAllowed = true, claimStatus = 'new', pushStatus = 200 } = {}) {
  const calls = [];
  const transport = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.endsWith('/quota')) return { ok: true, status: 200, json: async () => ({ type: 'none' }) };
    if (url.includes('/rest/v1/rpc/line_sync_owner_claim')) {
      return {
        ok: true,
        status: 200,
        json: async () => ([{ claim_status: claimStatus, retry_key: '22222222-2222-4222-8222-222222222222' }])
      };
    }
    if (url.includes('/rest/v1/rpc/line_sync_owner_ack')) {
      return { ok: true, status: 200, json: async () => true };
    }
    if (url.includes('/message/push')) {
      return {
        ok: pushStatus === 200,
        status: pushStatus,
        headers: { get: () => null },
        json: async () => ({})
      };
    }
    throw Error('unexpected-call: ' + url);
  };
  return { calls, transport };
}

test('syncOwnerMonitorTick: disabled by default when flag is not true', async () => {
  const { syncOwnerMonitorTick } = await workerPromise;
  const f = makeFixture();
  const res = await syncOwnerMonitorTick(
    { ...defaultEnv, SYNC_OWNER_MONITOR_ENABLED: 'false' },
    { hash: sha256, transport: f.transport }
  );
  assert.equal(res.mode, 'SYNC_MONITOR_OFF');
  assert.equal(f.calls.length, 0);
});

test('syncOwnerMonitorTick: single testItem sends to Owner, claims ledger, and acknowledges', async () => {
  const { syncOwnerMonitorTick } = await workerPromise;
  const f = makeFixture();
  const res = await syncOwnerMonitorTick(defaultEnv, {
    hash: sha256,
    transport: f.transport,
    testItem: {
      pipeline: 'schedule',
      run_key: 'schedule:verified-test-001',
      source_file: 'Above Villa Plot6 Construction Progress_Updated_2026-09-21.xlsx',
      status: 'PASS',
      notes: 'Initial owner sync test'
    }
  });

  assert.equal(res.mode, 'SYNC_OWNER_DELIVERED');
  assert.equal(res.delivered, true);
  assert.equal(res.http, 200);

  // Check claims
  const claimCall = f.calls.find(c => c.url.includes('/line_sync_owner_claim'));
  assert.ok(claimCall);
  const claimBody = JSON.parse(claimCall.opts.body);
  assert.equal(claimBody.p_pipeline, 'schedule');
  assert.equal(claimBody.p_run_key, 'schedule:verified-test-001');

  // Check LINE push
  const pushCall = f.calls.find(c => c.url.includes('/message/push'));
  assert.ok(pushCall);
  const pushBody = JSON.parse(pushCall.opts.body);
  assert.equal(pushBody.to, defaultEnv.LINE_OWNER_USER_ID);
  assert.match(pushBody.messages[0].text, /3 Kings • Sync Monitoring/);
  assert.match(pushBody.messages[0].text, /Run ID: schedule:verified-test-001/);

  // Check ACK
  const ackCall = f.calls.find(c => c.url.includes('/line_sync_owner_ack'));
  assert.ok(ackCall);
  const ackBody = JSON.parse(ackCall.opts.body);
  assert.equal(ackBody.p_status, 'delivered');
  assert.equal(ackBody.p_http_status, 200);
});

test('syncOwnerMonitorTick: deduplication prevents second send when already sent', async () => {
  const { syncOwnerMonitorTick } = await workerPromise;
  const f = makeFixture({ claimStatus: 'already_sent' });
  const res = await syncOwnerMonitorTick(defaultEnv, {
    hash: sha256,
    transport: f.transport,
    testItem: {
      pipeline: 'schedule',
      run_key: 'schedule:verified-test-001'
    }
  });

  assert.equal(res.mode, 'DEDUP_PREVENTED');
  assert.equal(res.claim_status, 'already_sent');
  assert.equal(res.delivered, false);

  // Assert NO call to LINE push API
  const pushCall = f.calls.find(c => c.url.includes('/message/push'));
  assert.equal(pushCall, undefined);
});

test('worker fetch: /sync-owner/health returns service info without sending', async () => {
  const worker = (await workerPromise).default;
  const req = new Request('https://worker.local/sync-owner/health', { method: 'GET' });
  const res = await worker.fetch(req, defaultEnv);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.service, '3kings-line-autopilot');
  assert.equal(json.module, 'sync-owner-monitor');
  assert.equal(json.enabled, true);
  assert.deepEqual(json.enabledPipelines, ['schedule', 'materials']);
  assert.equal(json.ledger, 'line_autopilot.sync_owner_deliveries');
});

test('worker fetch: /sync-owner/tick requires authorized bridge token', async () => {
  const worker = (await workerPromise).default;
  const reqUnauthorized = new Request('https://worker.local/sync-owner/tick', {
    method: 'POST',
    headers: { 'x-3kings-server-key': 'wrong-key' }
  });
  const res = await worker.fetch(reqUnauthorized, defaultEnv);
  assert.equal(res.status, 401);
});
