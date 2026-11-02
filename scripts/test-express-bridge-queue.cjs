'use strict';
/**
 * Standalone regression tests for the STAGED Express Bridge Queue GAS source.
 * Run: node scripts/test-express-bridge-queue.cjs
 * These tests never connect to Google, Drive, GAS, Supabase or Production.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.resolve(__dirname, '../docs/apps-script/ExpressBridgeQueue_2026-11-02.gs');
const source = fs.readFileSync(file, 'utf8');
const script = new vm.Script(source, { filename: 'ExpressBridgeQueue_2026-11-02.gs' });
const props = new Map();
const calls = [];
const context = vm.createContext({
  PropertiesService: { getScriptProperties: () => ({
    getProperty: name => props.get(name) || null
  }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'p.kraiwit2614@gmail.com' }) },
  ScriptApp: { getScriptId: () => '1sKddwvs-DOav0ltdrcxyqPXYinXE3uCgFKmDzGu_XEb4VvMvYVwDUDeT' },
  console: { error: (...args) => calls.push(['error', ...args]) },
  DriveApp: { getFileById: () => { throw Error('Unexpected Drive call'); }, Access: { PRIVATE: 'PRIVATE' } },
  SpreadsheetApp: { openById: () => { throw Error('Unexpected spreadsheet call'); } },
  LockService: { getUserLock: () => { throw Error('Unexpected lock'); } },
  EB_qaReadFolder_: () => { calls.push(['source']); return [{ id: 'file', name: 'PO.csv', hash: 'sha' }]; },
  EB_dbFingerprint_: () => 'a'.repeat(64),
  expressBridgeMasterImportDryRun20261022: () => { calls.push(['masterDryRun']); return { status: 'MASTER_IMPORT_PREFLIGHT_PASS' }; },
  expressBridgeMasterImportOnce20261022: () => { calls.push(['masterWrite']); return { status: 'MASTER_IMPORT_PASS' }; },
  expressBridgeRegistrySyncDryRun20261022: () => { calls.push(['dbDryRun']); return { status: 'DB_SYNC_DRY_RUN_PASS' }; },
  expressBridgeRegistrySyncOnce20261022: () => { calls.push(['dbWrite']); return { status: 'DB_REGISTER_SYNC_PASS' }; }
});
script.runInContext(context);

function run(code) { return vm.runInContext(code, context); }

assert.equal(run('expressQueueStatus20261102().status'), 'STAGING_DISABLED');
assert.equal(run('processExpressBridgeQueue20261102().status'), 'STAGING_DISABLED');
assert.deepEqual(calls, [], 'Disabled worker must never reach any source, lock, or writer');

const owner = 'p.kraiwit2614@gmail.com';
const now = Date.parse('2026-11-02T12:00:00.000Z');
const row = [
  '12345678-1234-4234-8234-123456789abc', 'EXPRESS_MASTER_DRY_RUN',
  'a'.repeat(64), '2026-11-02T11:58:00.000Z',
  '2026-11-02T12:30:00.000Z', owner, 'REQUESTED',
  '', '', '', '1Yr9iNVo54g4PrB2ntFb6E_ouI_ohHqSn', '', '', '', ''
];
context.row = row;
context.testOwner = owner;
context.testNow = now;
assert.equal(run('expressQueueValidate20261102_(row,testOwner,testNow)'), null);
const mutateAndCheck = (index, value, expected) => {
  const before = row[index];
  row[index] = value;
  assert.equal(run('expressQueueValidate20261102_(row,testOwner,testNow)'), expected);
  row[index] = before;
};
mutateAndCheck(1, 'MATERIALS_SYNC', 'ACTION_NOT_ALLOWED');
mutateAndCheck(1, 'EXECUTE_ARBITRARY_FUNCTION', 'ACTION_NOT_ALLOWED');
mutateAndCheck(2, 'bad-hash', 'INVALID_SOURCE_FINGERPRINT');
mutateAndCheck(5, 'attacker@example.com', 'INVALID_REQUESTER');
mutateAndCheck(10, 'other-master', 'INVALID_MASTER_ID');
mutateAndCheck(6, 'RUNNING', 'NOT_REQUESTED');
mutateAndCheck(7, 'already-claimed', 'DIRTY_REQUEST_ROW');
mutateAndCheck(4, '2026-11-02T11:59:00.000Z', 'EXPIRED_OR_FUTURE_REQUEST');

assert.equal(run("expressQueueExecute20261102_('EXPRESS_MASTER_DRY_RUN').status"), 'MASTER_IMPORT_PREFLIGHT_PASS');
assert.deepEqual(calls.pop(), ['masterDryRun']);

assert.throws(() => run("expressQueueExecute20261102_('EXPRESS_MASTER_IMPORT')"), /MASTER_RELEASE_GATE_OFF/);
assert.equal(calls.filter(x => x[0] === 'masterWrite').length, 0);
props.set('EXPRESS_BRIDGE_MASTER_WRITE_APPROVED', 'true');
assert.equal(run("expressQueueExecute20261102_('EXPRESS_MASTER_IMPORT').status"), 'MASTER_IMPORT_PASS');
assert.deepEqual(calls.pop(), ['masterWrite']);

assert.equal(run("expressQueueExecute20261102_('EXPRESS_REGISTRY_DRY_RUN').status"), 'DB_SYNC_DRY_RUN_PASS');
assert.deepEqual(calls.pop(), ['dbDryRun']);
assert.throws(() => run("expressQueueExecute20261102_('EXPRESS_REGISTRY_SYNC')"), /REGISTRY_RELEASE_GATE_OFF/);
props.set('EXPRESS_BRIDGE_DB_SYNC_APPROVED', 'true');
assert.equal(run("expressQueueExecute20261102_('EXPRESS_REGISTRY_SYNC').status"), 'DB_REGISTER_SYNC_PASS');
assert.deepEqual(calls.pop(), ['dbWrite']);
assert.throws(() => run("expressQueueExecute20261102_('MATERIALS_SYNC')"), /ACTION_NOT_ALLOWED/);

assert.doesNotMatch(source, /\bmaterialsSyncProduction\s*\(/,
  'Express Queue must not call legacy Materials Sync');
assert.doesNotMatch(source, /ScriptApp\.newTrigger\s*\(/,
  'No installer is allowed in staged source');
assert.doesNotMatch(source, /setProperty\s*\(/,
  'Queue must not activate its own ScriptProperties gates');
console.log('PASS: isolated Express Queue syntax, disabled default, request validation,');
console.log('      four-action allowlist, both inherited release gates, no legacy Materials/trigger mutations.');
