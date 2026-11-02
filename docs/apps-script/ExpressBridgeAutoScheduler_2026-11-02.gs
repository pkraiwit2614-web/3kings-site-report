/**
 * 3 Kings | Express automatic queue scheduler | STAGING ONLY 2026-11-02
 * New optional GAS file; does not modify any existing handler, trigger,
 * OAuth, XLSX file or DB table. Install only after real-transport QA.
 *
 * Every trigger tick advances exactly one safe state transition:
 * NO_CHANGE / ENQUEUE_MASTER / RUN_MASTER / ENQUEUE_REGISTRY / RUN_REGISTRY /
 * VERIFY_COMPLETED_DB. Each writer is the existing owner-gated function.
 * A canceled/incomplete RUNNING job is never silently retried.
 */
const EXPRESS_AUTO_20261102 = Object.freeze({
  baselineProperty: 'EXPRESS_AUTO_VERIFIED_DB_FINGERPRINT_20261102',
  signatureProperty: 'EXPRESS_AUTO_LAST_SOURCE_SIGNATURE_20261102',
  queueState: 'LIVE_APPROVED',
  active: 'TRUE',
  maxRows: 2000,
  nextExpiryMs: 45 * 60 * 1000
});

function expressQueueSourceSignature20261102_() {
  if (typeof EB_FULL_QA === 'undefined' || typeof EB_qaHashText_ !== 'function')
    throw Error('EXPRESS_AUTO_EXISTING_READER_MISSING');
  const folder = DriveApp.getFolderById(EB_FULL_QA.sourceFolderId);
  const iterator = folder.getFiles(), rows = [];
  while (iterator.hasNext()) {
    const f = iterator.next(), name = f.getName();
    if (!EB_FULL_QA.allowedSource.test(name)) continue;
    rows.push([f.getId(), name, f.getSize(), f.getLastUpdated().getTime()].join('|'));
  }
  if (rows.length < EB_FULL_QA.sourceMinimum || rows.length > EB_FULL_QA.maxSources)
    throw Error('EXPRESS_AUTO_SOURCE_COUNT_HOLD');
  rows.sort();
  return EB_qaHashText_(rows.join('\n'));
}

function expressQueueDBComplete20261102_(fingerprint) {
  const ctx = buildContext_();
  const arr = EB_dbFetch_(ctx, 'get',
    'express_register_runs?select=id,state,document_count,line_count&source_fingerprint=eq.' +
       encodeURIComponent(fingerprint) + '&state=eq.complete&limit=1', null, null).data;
  if (!arr.length || arr[0].state !== 'complete' ||
      !(arr[0].document_count > 0) || !(arr[0].line_count > 0))
    return null;
  return arr[0];
}

function expressQueueEnqueue20261102_(x, action, fingerprint) {
  const c = EXPRESS_QUEUE_20261102;
  if (c.actions.indexOf(action) < 0) throw Error('EXPRESS_AUTO_ACTION_NOT_ALLOWED');
  if (x.requests.getLastRow() >= EXPRESS_AUTO_20261102.maxRows)
    throw Error('EXPRESS_AUTO_QUEUE_CAPACITY_HOLD');
  const now = new Date();
  const expires = new Date(now.getTime() + EXPRESS_AUTO_20261102.nextExpiryMs);
  const record = [
    Utilities.getUuid(), action, fingerprint, now.toISOString(),
    expires.toISOString(), c.owner, 'REQUESTED',
    '', '', '', c.masterId, '', '', '', ''
  ];
  x.requests.appendRow(record);
  SpreadsheetApp.flush();
  return { status: 'ENQUEUED', action: action, fingerprint: fingerprint };
}

/**
 * Manual one-time baseline gate; never processes a request.
 * Bootstrap requires the *existing* DB full-history batch to be complete,
 * current Master to be NO_CHANGE, and source fingerprint to match.
 * No flag is enabled and no trigger is installed here.
 */
function expressQueueBootstrap20261102() {
  const x = expressQueueOpen20261102_();
  if (x.control.queue_state !== 'STAGING_DISABLED' ||
      x.control.worker_active !== 'FALSE')
    throw Error('EXPRESS_AUTO_BOOTSTRAP_MUST_BE_DISABLED');
  if (x.requests.getLastRow() > 1) throw Error('EXPRESS_AUTO_QUEUE_NOT_EMPTY');
  const fingerprint = expressQueueFingerprint20261102_();
  if (!expressQueueDBComplete20261102_(fingerprint))
    throw Error('EXPRESS_AUTO_DB_BASELINE_NOT_COMPLETE');
  if (EB_masterMakePayload_(false).status !== 'NO_CHANGE')
    throw Error('EXPRESS_AUTO_MASTER_NOT_CURRENT');
  const signature = expressQueueSourceSignature20261102_();
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(EXPRESS_AUTO_20261102.baselineProperty, fingerprint);
  properties.setProperty(EXPRESS_AUTO_20261102.signatureProperty, signature);
  return { status:'EXPRESS_AUTO_BASELINE_READBACK_PASS',
    fingerprint:fingerprint, masterFileId:EXPRESS_QUEUE_20261102.masterId };
}

/**
 * ONE dedicated time-based trigger invokes this function.
 * Owner-only, source-delta-based, fail-closed.
 * Existing Materials queue/triggers remain entirely unchanged.
 */
function expressBridgeAutoTick20261102() {
  if (!expressQueueEnabled20261102_()) return {status:'STAGING_DISABLED'};
  const x = expressQueueOpen20261102_();
  if (x.control.queue_state !== EXPRESS_AUTO_20261102.queueState ||
      x.control.worker_active !== EXPRESS_AUTO_20261102.active ||
      x.control.auto_enabled !== 'TRUE')
    return { status:'DISABLED_BY_CONTROL' };
  const props = PropertiesService.getScriptProperties();
  const baseline = props.getProperty(EXPRESS_AUTO_20261102.baselineProperty);
  if (!baseline || !/^[0-9a-f]{64}$/i.test(baseline))
    return {status:'HOLD_BASELINE_MISSING'};

  // Account for interrupted executions BEFORE considering any new write.
  const rows = x.requests.getLastRow() < 2 ? [] :
    x.requests.getRange(2, 1, x.requests.getLastRow()-1,
      EXPRESS_QUEUE_20261102.headers.length).getDisplayValues();
  if (rows.some(r => ['ERROR', 'REVIEW', 'RUNNING'].indexOf(r[6]) >= 0))
    return {status:'HOLD_QUEUED_ERROR_OR_UNFINISHED'};
  const awaiting = rows.filter(r => r[6] === 'REQUESTED');
  if (awaiting.length > 1) return {status:'HOLD_MULTIPLE_PENDING'};
  if (awaiting.length === 1) return processExpressBridgeQueue20261102();

  // Fast path: unchanged folder metadata and no pending work.
  const signature = expressQueueSourceSignature20261102_();
  const lastSignature = props.getProperty(EXPRESS_AUTO_20261102.signatureProperty);
  if (lastSignature === signature && rows.every(r => r[6] !== 'WAIT_QA'))
    return {status:'NO_CHANGE'};

  const fingerprint = expressQueueFingerprint20261102_();
  const matching = rows.filter(r => r[2] === fingerprint);
  const master = matching.find(r => r[1] === 'EXPRESS_MASTER_IMPORT' &&
    r[6] === 'WAIT_QA' &&
    ['MASTER_REGISTER_WRITE_READBACK_PASS','MASTER_IMPORT_NO_CHANGE'].indexOf(r[9]) >= 0);
  const registry = matching.find(r => r[1] === 'EXPRESS_REGISTRY_SYNC' &&
    r[6] === 'WAIT_QA' &&
    ['DB_REGISTER_READBACK_PASS','DB_REGISTER_NO_CHANGE'].indexOf(r[9]) >= 0);

  if (baseline === fingerprint) {
    // Full history already verified; no reimport because of metadata-only change.
    if (!expressQueueDBComplete20261102_(fingerprint)) return {status:'HOLD_DB_BASELINE_DISAPPEARED'};
    props.setProperty(EXPRESS_AUTO_20261102.signatureProperty, signature);
    return {status:'NO_CHANGE',fingerprint:fingerprint};
  }

  if (registry) {
    if (!expressQueueDBComplete20261102_(fingerprint))
      return {status:'HOLD_DB_COMPLETE_READBACK_MISMATCH'};
    if (EB_masterMakePayload_(false).status !== 'NO_CHANGE')
      return {status:'HOLD_MASTER_READBACK_MISMATCH'};
    props.setProperty(EXPRESS_AUTO_20261102.baselineProperty, fingerprint);
    props.setProperty(EXPRESS_AUTO_20261102.signatureProperty, signature);
    x.requests.getRange(registry.rowNo || rows.indexOf(registry)+2, 14)
      .setValue('SOURCE_MASTER_DB_VERIFIED_AUTH_WEB_QA_PENDING');
    return {status:'SOURCE_MASTER_DB_VERIFIED_WEB_PENDING',
      fingerprint:fingerprint};
  }

  if (master) {
    if (EB_masterMakePayload_(false).status !== 'NO_CHANGE')
      return {status:'HOLD_MASTER_NOT_CURRENT'};
    return expressQueueEnqueue20261102_(x, 'EXPRESS_REGISTRY_SYNC', fingerprint);
  }
  // For changed sources create a new Master write request, rather than
  // running a second importer inside this scanner invocation.
  return expressQueueEnqueue20261102_(x, 'EXPRESS_MASTER_IMPORT', fingerprint);
}
