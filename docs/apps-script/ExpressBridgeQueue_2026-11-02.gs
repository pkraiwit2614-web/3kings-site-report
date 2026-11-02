/**
 * 3 Kings | Isolated Express Bridge Queue | STAGING ONLY (2026-11-02)
 *
 * NOT installed in the live Apps Script project. This file is a reviewed
 * candidate for an eventual owner-authorized, scoped GAS release.
 *
 * It never changes the existing GPT Materials Queue, existing triggers,
 * OAuth settings, spreadsheet masters, Script Properties or database schema.
 * The existing Express importer and registry functions remain the sole writers.
 *
 * Enablement is fail-closed: both EXPRESS_QUEUE_ENABLED_20261102=true in
 * Script Properties AND an independently owned private queue Sheet with
 * Control.queue_state=LIVE_APPROVED and Control.worker_active=TRUE are required.
 * No trigger installer is provided. Schedule only after explicit release QA.
 *
 * A request may execute ONE allowlisted phase per invocation. Incomplete RUNNING
 * rows are never automatically retried (safeguard for partial DB imports).
 */
const EXPRESS_QUEUE_20261102 = Object.freeze({
  scriptId: '1sKddwvs-DOav0ltdrcxyqPXYinXE3uCgFKmDzGu_XEb4VvMvYVwDUDeT',
  owner: 'p.kraiwit2614@gmail.com',
  masterId: '1Yr9iNVo54g4PrB2ntFb6E_ouI_ohHqSn',
  sheetProperty: 'EXPRESS_QUEUE_SHEET_ID_20261102',
  enabledProperty: 'EXPRESS_QUEUE_ENABLED_20261102',
  build: 'EXPRESS_QUEUE_STAGED_20261102_V1',
  maxAgeMs: 60 * 60 * 1000,
  actions: Object.freeze([
    'EXPRESS_MASTER_DRY_RUN',
    'EXPRESS_MASTER_IMPORT',
    'EXPRESS_REGISTRY_DRY_RUN',
    'EXPRESS_REGISTRY_SYNC'
  ]),
  headers: Object.freeze([
    'request_id', 'action', 'source_fingerprint', 'requested_at',
    'expires_at', 'requester', 'status', 'started_at', 'finished_at',
    'result_code', 'master_file_id', 'notes', 'worker_version',
    'verification_status', 'verified_at'
  ])
});

function expressQueueEnabled20261102_() {
  return PropertiesService.getScriptProperties()
    .getProperty(EXPRESS_QUEUE_20261102.enabledProperty) === 'true';
}

function expressQueueOpen20261102_() {
  const c = EXPRESS_QUEUE_20261102;
  if (ScriptApp.getScriptId() !== c.scriptId) throw Error('EXPRESS_QUEUE_SCRIPT_MISMATCH');
  const currentUser = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (currentUser !== c.owner) throw Error('EXPRESS_QUEUE_OWNER_MISMATCH');
  const id = PropertiesService.getScriptProperties().getProperty(c.sheetProperty);
  if (!id) throw Error('EXPRESS_QUEUE_NOT_CONFIGURED');
  const file = DriveApp.getFileById(id);
  const fileOwner = file.getOwner();
  if (!fileOwner || String(fileOwner.getEmail()).toLowerCase() !== currentUser)
    throw Error('EXPRESS_QUEUE_SHEET_OWNER_MISMATCH');
  if (file.getSharingAccess() !== DriveApp.Access.PRIVATE)
    throw Error('EXPRESS_QUEUE_SHEET_NOT_PRIVATE');
  if (file.getEditors().some(user => String(user.getEmail()).toLowerCase() !== currentUser))
    throw Error('EXPRESS_QUEUE_UNAUTHORIZED_EDITOR');
  const spreadsheet = SpreadsheetApp.openById(id);
  const control = spreadsheet.getSheetByName('Control');
  const requests = spreadsheet.getSheetByName('Requests');
  if (!control || !requests) throw Error('EXPRESS_QUEUE_SHEET_SCHEMA_MISMATCH');
  const conf = {};
  control.getDataRange().getDisplayValues().slice(1)
    .forEach(r => { if (r[0]) conf[String(r[0]).trim()] = String(r[1] || '').trim(); });
  if (conf.schema_version !== '1' ||
      conf.allowed_script_project_id !== c.scriptId ||
      conf.allowed_master_file_id !== c.masterId ||
      String(conf.owner_email || '').toLowerCase() !== c.owner)
    throw Error('EXPRESS_QUEUE_CONFIG_MISMATCH');
  const actualHeaders = requests.getRange(1, 1, 1, c.headers.length).getDisplayValues()[0];
  if (c.headers.some((h, i) => actualHeaders[i] !== h))
    throw Error('EXPRESS_QUEUE_HEADERS_MISMATCH');
  return { control: conf, requests: requests, owner: currentUser };
}

function expressQueueValidate20261102_(row, owner, now) {
  const c = EXPRESS_QUEUE_20261102;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row[0]))
    return 'INVALID_REQUEST_ID';
  if (c.actions.indexOf(row[1]) < 0) return 'ACTION_NOT_ALLOWED';
  if (!/^[0-9a-f]{64}$/i.test(String(row[2] || '')))
    return 'INVALID_SOURCE_FINGERPRINT';
  if (String(row[5] || '').toLowerCase() !== owner) return 'INVALID_REQUESTER';
  if (row[10] !== c.masterId) return 'INVALID_MASTER_ID';
  const requested = Date.parse(row[3]), expires = Date.parse(row[4]);
  if (!Number.isFinite(requested) || !Number.isFinite(expires) ||
      requested > now + 120000 || now - requested > c.maxAgeMs ||
      expires <= now || expires <= requested || expires - requested > c.maxAgeMs)
    return 'EXPIRED_OR_FUTURE_REQUEST';
  if (row[6] !== 'REQUESTED') return 'NOT_REQUESTED';
  if ([7, 8, 9, 11, 12, 13, 14].some(i => String(row[i] || '').trim() !== ''))
    return 'DIRTY_REQUEST_ROW';
  return null;
}

function expressQueueFingerprint20261102_() {
  // Exact canonical source selection and hashing are delegated to existing
  // Express Bridge functions. Never substitute latest-CSV-only inference.
  if (typeof EB_qaReadFolder_ !== 'function' ||
      typeof EB_dbFingerprint_ !== 'function')
    throw Error('EXPRESS_QUEUE_EXISTING_SOURCE_READER_MISSING');
  return EB_dbFingerprint_(EB_qaReadFolder_());
}

function expressQueueExecute20261102_(action) {
  const props = PropertiesService.getScriptProperties();
  switch (action) {
    case 'EXPRESS_MASTER_DRY_RUN':
      if (typeof expressBridgeMasterImportDryRun20261022 !== 'function')
        throw Error('EXPRESS_QUEUE_MASTER_DRY_RUN_MISSING');
      return expressBridgeMasterImportDryRun20261022();
    case 'EXPRESS_MASTER_IMPORT':
      // The underlying importer independently enforces this release gate.
      if (props.getProperty('EXPRESS_BRIDGE_MASTER_WRITE_APPROVED') !== 'true')
        throw Error('EXPRESS_QUEUE_MASTER_RELEASE_GATE_OFF');
      if (typeof expressBridgeMasterImportOnce20261022 !== 'function')
        throw Error('EXPRESS_QUEUE_MASTER_IMPORT_MISSING');
      return expressBridgeMasterImportOnce20261022();
    case 'EXPRESS_REGISTRY_DRY_RUN':
      if (typeof expressBridgeRegistrySyncDryRun20261022 !== 'function')
        throw Error('EXPRESS_QUEUE_REGISTRY_DRY_RUN_MISSING');
      return expressBridgeRegistrySyncDryRun20261022();
    case 'EXPRESS_REGISTRY_SYNC':
      // Never write Supabase directly or bypass the existing DB gate.
      if (props.getProperty('EXPRESS_BRIDGE_DB_SYNC_APPROVED') !== 'true')
        throw Error('EXPRESS_QUEUE_REGISTRY_RELEASE_GATE_OFF');
      if (typeof expressBridgeRegistrySyncOnce20261022 !== 'function')
        throw Error('EXPRESS_QUEUE_REGISTRY_SYNC_MISSING');
      return expressBridgeRegistrySyncOnce20261022();
    default:
      throw Error('EXPRESS_QUEUE_ACTION_NOT_ALLOWED');
  }
}

function expressQueueStatus20261102() {
  if (!expressQueueEnabled20261102_())
    return { status: 'STAGING_DISABLED', enabled: false };
  const x = expressQueueOpen20261102_();
  return {
    status: 'READ_ONLY_STATUS',
    enabled: x.control.queue_state === 'LIVE_APPROVED' && x.control.worker_active === 'TRUE',
    queue_state: x.control.queue_state,
    worker_active: x.control.worker_active
  };
}

function processExpressBridgeQueue20261102() {
  const c = EXPRESS_QUEUE_20261102;
  if (!expressQueueEnabled20261102_()) return { status: 'STAGING_DISABLED' };
  const x = expressQueueOpen20261102_();
  if (x.control.queue_state !== 'LIVE_APPROVED' || x.control.worker_active !== 'TRUE')
    return { status: 'DISABLED_BY_CONTROL' };

  // Lock only the request claim, not the importer execution: both existing
  // Master and DB importers acquire their own SCRIPT locks.
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { status: 'CLAIM_LOCKED' };
  let rowNo = 0, action = '', requestId = '', fingerprint = '';
  try {
    const lastRow = x.requests.getLastRow();
    if (lastRow < 2) return { status: 'NO_PENDING' };
    const rows = x.requests.getRange(2, 1, lastRow - 1, c.headers.length).getDisplayValues();
    const seen = {};
    rows.forEach(r => { if (r[0]) seen[r[0]] = (seen[r[0]] || 0) + 1; });
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r[6] !== 'REQUESTED') continue;
      rowNo = i + 2;
      requestId = r[0];
      action = r[1];
      fingerprint = r[2];
      const issue = seen[requestId] !== 1 ? 'DUPLICATE_REQUEST_ID' :
        expressQueueValidate20261102_(r, x.owner, Date.now());
      if (issue) {
        x.requests.getRange(rowNo, 7).setValue('REVIEW');
        x.requests.getRange(rowNo, 12).setValue(issue);
        return { status: 'REVIEW', reason: issue };
      }
      // Heavy source hashing only happens for a real, authorized request.
      const currentFingerprint = expressQueueFingerprint20261102_();
      if (currentFingerprint.toLowerCase() !== fingerprint.toLowerCase()) {
        x.requests.getRange(rowNo, 7).setValue('REVIEW');
        x.requests.getRange(rowNo, 12).setValue('SOURCE_FINGERPRINT_CHANGED');
        return { status: 'REVIEW', reason: 'SOURCE_FINGERPRINT_CHANGED' };
      }
      x.requests.getRange(rowNo, 7, 1, 2)
        .setValues([['RUNNING', new Date().toISOString()]]);
      x.requests.getRange(rowNo, 13).setValue(c.build);
      SpreadsheetApp.flush();
      break;
    }
    if (!rowNo) return { status: 'NO_PENDING' };
  } finally {
    lock.releaseLock();
  }

  try {
    const result = expressQueueExecute20261102_(action);
    const code = result && typeof result.status === 'string' ? result.status : '';
    const accepted = {
      EXPRESS_MASTER_DRY_RUN: ['MASTER_IMPORT_PREFLIGHT_PASS', 'MASTER_REGISTER_ALREADY_CURRENT'],
      EXPRESS_MASTER_IMPORT: ['MASTER_REGISTER_WRITE_READBACK_PASS', 'MASTER_IMPORT_NO_CHANGE'],
      EXPRESS_REGISTRY_DRY_RUN: ['DB_SYNC_DRY_RUN_PASS'],
      EXPRESS_REGISTRY_SYNC: ['DB_REGISTER_READBACK_PASS', 'DB_REGISTER_NO_CHANGE']
    };
    if (!code || !accepted[action] || accepted[action].indexOf(code) < 0)
      throw Error('EXPRESS_QUEUE_UNEXPECTED_EXECUTOR_RESULT');
    // A source change or incomplete import requires human review, never
    // automatic retry or implicit promotion to completed Production QA.
    const sourceAfter = expressQueueFingerprint20261102_();
    if (sourceAfter.toLowerCase() !== fingerprint.toLowerCase()) {
      x.requests.getRange(rowNo, 7).setValue('REVIEW');
      x.requests.getRange(rowNo, 12).setValue('SOURCE_CHANGED_DURING_EXECUTION');
      return { status: 'REVIEW', requestId: requestId };
    }
    x.requests.getRange(rowNo, 7).setValue('WAIT_QA');
    x.requests.getRange(rowNo, 9, 1, 2)
      .setValues([[new Date().toISOString(), code]]);
    x.requests.getRange(rowNo, 14).setValue('SOURCE_MASTER_DB_AUTH_WEB_READBACK_REQUIRED');
    return { status: 'WAIT_QA', action: action, resultCode: code, requestId: requestId };
  } catch (err) {
    x.requests.getRange(rowNo, 7).setValue('ERROR');
    x.requests.getRange(rowNo, 9).setValue(new Date().toISOString());
    x.requests.getRange(rowNo, 12).setValue('REVIEW_GAS_EXECUTION_STACK_NO_AUTO_RETRY');
    console.error('EXPRESS_QUEUE_EXECUTION_FAILED', String(err));
    return { status: 'ERROR', requestId: requestId };
  }
}