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

function expressQueueRecoverRunningRows20261102_(x, rows) {
  const now = Date.now();
  let recoveredCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r[6] !== 'RUNNING') continue;
    const rowNo = i + 2;
    const expiresAt = Date.parse(r[4]);
    const startedAt = Date.parse(r[7]);
    const isExpired = (Number.isFinite(expiresAt) && now > expiresAt) ||
                      (Number.isFinite(startedAt) && (now - startedAt > 10 * 60 * 1000));
    if (!isExpired) continue;

    const action = r[1];
    const fingerprint = r[2];

    if (action === 'EXPRESS_MASTER_IMPORT') {
      let masterState = null;
      try {
        masterState = EB_masterMakePayload_(false);
      } catch (me) {
        masterState = { status: 'ERROR', error: String(me) };
      }
      if (masterState && masterState.status === 'NO_CHANGE') {
        const currentFP = expressQueueFingerprint20261102_();
        if (currentFP.toLowerCase() === String(fingerprint).toLowerCase()) {
          const finishTime = r[8] || new Date().toISOString();
          x.requests.getRange(rowNo, 7).setValue('WAIT_QA');
          x.requests.getRange(rowNo, 9, 1, 2).setValues([[finishTime, 'MASTER_REGISTER_WRITE_READBACK_PASS']]);
          x.requests.getRange(rowNo, 12).setValue('RECONCILED_EXPIRED_RUNNING_MASTER_VERIFIED_CURRENT');
          x.requests.getRange(rowNo, 14, 1, 2).setValues([['SOURCE_MASTER_DB_AUTH_WEB_READBACK_REQUIRED', new Date().toISOString()]]);
          SpreadsheetApp.flush();
          r[6] = 'WAIT_QA';
          r[8] = finishTime;
          r[9] = 'MASTER_REGISTER_WRITE_READBACK_PASS';
          r[11] = 'RECONCILED_EXPIRED_RUNNING_MASTER_VERIFIED_CURRENT';
          r[13] = 'SOURCE_MASTER_DB_AUTH_WEB_READBACK_REQUIRED';
          r[14] = new Date().toISOString();
          recoveredCount++;
          console.log('RECONCILED_EXPIRED_RUNNING_MASTER_IMPORT', rowNo, r[0]);
          continue;
        }
      }
      x.requests.getRange(rowNo, 7).setValue('REVIEW');
      x.requests.getRange(rowNo, 12).setValue('UNFINISHED_MASTER_IMPORT_HOLD_MANUAL_REVIEW');
      SpreadsheetApp.flush();
      r[6] = 'REVIEW';
      r[11] = 'UNFINISHED_MASTER_IMPORT_HOLD_MANUAL_REVIEW';
    } else if (action === 'EXPRESS_REGISTRY_SYNC') {
      let dbRun = expressQueueDBComplete20261102_(fingerprint);
      if (!dbRun && typeof buildContext_ === 'function' && typeof EB_dbFetch_ === 'function' && typeof EB_dbCount_ === 'function') {
        const ctx = buildContext_();
        const existing = EB_dbFetch_(ctx, 'get',
          'express_register_runs?select=*&source_fingerprint=eq.' + encodeURIComponent(fingerprint) + '&limit=1', null, null).data;
        if (existing.length && existing[0].state === 'importing') {
          const batchId = existing[0].id;
          const liveDocs = EB_dbCount_(ctx, batchId, 'eq.0');
          const liveLines = EB_dbCount_(ctx, batchId, 'gt.0');
          if (liveDocs === existing[0].document_count && liveLines === existing[0].line_count) {
            EB_dbFetch_(ctx, 'patch', 'express_register_runs?id=eq.' + batchId,
              { state: 'complete', completed_at: new Date().toISOString() }, 'return=representation');
            EB_dbFetch_(ctx, 'delete', 'express_register_runs?id=neq.' + batchId, null, 'return=minimal');
            dbRun = expressQueueDBComplete20261102_(fingerprint);
          }
        }
      }
      if (dbRun) {
        const finishTime = r[8] || new Date().toISOString();
        x.requests.getRange(rowNo, 7).setValue('WAIT_QA');
        x.requests.getRange(rowNo, 9, 1, 2).setValues([[finishTime, 'DB_REGISTER_READBACK_PASS']]);
        x.requests.getRange(rowNo, 12).setValue('RECONCILED_EXPIRED_RUNNING_DB_VERIFIED_COMPLETE');
        x.requests.getRange(rowNo, 14, 1, 2).setValues([['SOURCE_MASTER_DB_AUTH_WEB_READBACK_REQUIRED', new Date().toISOString()]]);
        SpreadsheetApp.flush();
        r[6] = 'WAIT_QA';
        r[8] = finishTime;
        r[9] = 'DB_REGISTER_READBACK_PASS';
        r[11] = 'RECONCILED_EXPIRED_RUNNING_DB_VERIFIED_COMPLETE';
        r[13] = 'SOURCE_MASTER_DB_AUTH_WEB_READBACK_REQUIRED';
        r[14] = new Date().toISOString();
        recoveredCount++;
        console.log('RECONCILED_EXPIRED_RUNNING_REGISTRY_SYNC', rowNo, r[0]);
        continue;
      }
      x.requests.getRange(rowNo, 7).setValue('REVIEW');
      x.requests.getRange(rowNo, 12).setValue('UNFINISHED_REGISTRY_SYNC_HOLD_MANUAL_REVIEW');
      SpreadsheetApp.flush();
      r[6] = 'REVIEW';
      r[11] = 'UNFINISHED_REGISTRY_SYNC_HOLD_MANUAL_REVIEW';
    }
  }
  return recoveredCount;
}

/**
 * Reconcile only an UNSTARTED source-fingerprint REVIEW when the current Drive
 * snapshot is a strict one-file extension of the request snapshot.
 * No accepted or interrupted writer is ever retried or auto-cleared.
 */
function expressQueueSupersedeUnstartedGrowth20261104_(x, rows) {
  const held = rows.map((r,i)=>({r,i})).filter(o=>o.r[6]==='REVIEW');
  if (!held.length) return 'NONE';
  if (held.length!==1 || rows.some(r=>r[6]==='RUNNING'||r[6]==='ERROR'))
    return 'HOLD_OTHER_ERROR';
  const h=held[0], r=h.r;
  if (r[11]!=='SOURCE_FINGERPRINT_CHANGED' || r[1]!=='EXPRESS_MASTER_IMPORT' ||
      r[7] || r[8] || r[9] || r[12] || r[13] || r[14])
    return 'HOLD_REVIEW_NOT_AUTORECOVERABLE';
  const files=EB_qaReadFolder_();
  const matches=files.filter((added,i)=>{
    const previous=files.filter((_,j)=>j!==i);
    return EB_dbFingerprint_(previous).toLowerCase()===String(r[2]).toLowerCase();
  });
  if (matches.length!==1) return 'HOLD_NONMONOTONIC_SOURCE_CHANGE';
  EB_qaVerifyFolderUnchanged_(files);
  const rowNo=h.i+2, verifiedAt=new Date().toISOString();
  x.requests.getRange(rowNo,7).setValue('SUPERSEDED');
  x.requests.getRange(rowNo,12).setValue(
    'SUPERSEDED_UNSTARTED_ONE_ADDED_SOURCE:'+matches[0].name);
  x.requests.getRange(rowNo,14,1,2)
    .setValues([['SUPERSEDED_BEFORE_EXECUTION_NOT_IMPORT_PASS', verifiedAt]]);
  SpreadsheetApp.flush();
  rows[h.i][6]='SUPERSEDED';
  rows[h.i][11]='SUPERSEDED_UNSTARTED_ONE_ADDED_SOURCE:'+matches[0].name;
  return 'SUPERSEDED_SAFE_SOURCE_GROWTH';
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

  expressQueueRecoverRunningRows20261102_(x, rows);
  expressQueueSupersedeUnstartedGrowth20261104_(x, rows);

  if (rows.some(r => ['ERROR', 'REVIEW', 'RUNNING'].indexOf(r[6]) >= 0))
    return {status:'HOLD_QUEUED_ERROR_OR_UNFINISHED'};
  const awaiting = rows.filter(r => r[6] === 'REQUESTED');
  if (awaiting.length > 1) {
    const firstAwaiting = awaiting[0];
    for (let i = 1; i < awaiting.length; i++) {
      const dup = awaiting[i];
      if (dup[1] === firstAwaiting[1] && dup[2] === firstAwaiting[2]) {
        const dupRowNo = rows.indexOf(dup) + 2;
        const nowIso = new Date().toISOString();
        x.requests.getRange(dupRowNo, 7).setValue('WAIT_QA');
        x.requests.getRange(dupRowNo, 9, 1, 2).setValues([[nowIso, 'DB_REGISTER_NO_CHANGE']]);
        x.requests.getRange(dupRowNo, 12).setValue('DEDUPLICATED_REDUNDANT_REQUEST');
        x.requests.getRange(dupRowNo, 14, 1, 2).setValues([['SOURCE_MASTER_DB_AUTH_WEB_READBACK_REQUIRED', nowIso]]);
        SpreadsheetApp.flush();
        dup[6] = 'WAIT_QA';
        dup[8] = nowIso;
        dup[9] = 'DB_REGISTER_NO_CHANGE';
        dup[11] = 'DEDUPLICATED_REDUNDANT_REQUEST';
      }
    }
    const remainingAwaiting = rows.filter(r => r[6] === 'REQUESTED');
    if (remainingAwaiting.length > 1) return {status:'HOLD_MULTIPLE_PENDING'};
    if (remainingAwaiting.length === 1) return processExpressBridgeQueue20261102();
  }
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
  // A new snapshot must be observed unchanged across two scheduled ticks.
  // This avoids treating an in-progress PO/PR pair upload as a full batch.
  const candidateKey='EXPRESS_AUTO_STAGED_SOURCE_SIGNATURE_20261104';
  if (props.getProperty(candidateKey)!==signature) {
    props.setProperty(candidateKey,signature);
    return {status:'WAIT_SOURCE_STABLE',fingerprint:fingerprint};
  }
  // For changed sources create a new Master write request, rather than
  // running a second importer inside this scanner invocation.
  return expressQueueEnqueue20261102_(x, 'EXPRESS_MASTER_IMPORT', fingerprint);
}