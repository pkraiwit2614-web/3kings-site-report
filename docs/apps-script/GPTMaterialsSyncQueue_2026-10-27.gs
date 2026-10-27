/**
 * 3 Kings GPT-first Materials Sync request consumer (staged; not installed).
 * Isolated extension to EXISTING 3Kings Drive → Supabase Sync GAS project.
 * Does not implement another importer, write Supabase, bypass SOP, or touch unrelated triggers.
 * The private owner-only Google Sheet is the request transport, not an authorization bypass.
 * Only an owner-approved, canonical-source MATERIALS_SYNC operation is allowed.
 *
 * Installation requires live-source comparison and one-time exact-scope owner approval.
 * Queue Control must be manually changed to LIVE_APPROVED / TRUE only after QA.
 */
const GPT_MATERIALS_QUEUE_20261027 = Object.freeze({
  SHEET_ID:'17mc-xMCiXUID4bmuT8cj5LlS1PYGdZdsnW5UWK6PpE0',
  MASTER_ID:'1Yr9iNVo54g4PrB2ntFb6E_ouI_ohHqSn',
  MASTER_NAME:'ABOVE_MATERIALS_STATUS_Stock_Updated_2026-09-20.xlsx',
  ACTION:'MATERIALS_SYNC',
  HANDLER:'processGPTMaterialsSyncQueue20261027',
  BUILD:'2026-10-27-v1',
  MAX_AGE_MS:60*60*1000,
  HEADERS:['request_id','action','source_file_id','source_modified_at',
    'requested_at','expires_at','requester','status','started_at',
    'finished_at','sync_status','rows_read','rows_written','message','worker_version']
});

function gptMaterialsQueueOpen20261027_() {
  const c=GPT_MATERIALS_QUEUE_20261027;
  const file=DriveApp.getFileById(c.SHEET_ID);
  const owner=file.getOwner();
  const effective=Session.getEffectiveUser().getEmail().toLowerCase();
  if(!effective||!owner||owner.getEmail().toLowerCase()!==effective)
    throw new Error('GPT_QUEUE_NOT_OWNER_CONTEXT');
  if(file.getSharingAccess()!==DriveApp.Access.PRIVATE)
    throw new Error('GPT_QUEUE_NOT_PRIVATE');
  // No delegated editors: a forged requester cell is not authorization.
  if(file.getEditors().some(x=>x.getEmail().toLowerCase()!==effective))
    throw new Error('GPT_QUEUE_UNAUTHORIZED_EDITOR');
  const ss=SpreadsheetApp.openById(c.SHEET_ID);
  const control=ss.getSheetByName('Control');
  const requests=ss.getSheetByName('Requests');
  if(!control||!requests)throw new Error('GPT_QUEUE_MISSING_SHEET');
  const conf={};
  control.getDataRange().getDisplayValues().slice(1).forEach(r=>{
    if(r[0])conf[String(r[0]).trim()]=String(r[1]||'').trim();
  });
  if(conf.schema_version!=='1'||conf.allowed_source_file_id!==c.MASTER_ID||
    conf.allowed_action!==c.ACTION||
    conf.allowed_script_project_id!==ScriptApp.getScriptId()||
    conf.owner_email.toLowerCase()!==effective)
    throw new Error('GPT_QUEUE_CONFIG_MISMATCH');
  const h=requests.getRange(1,1,1,c.HEADERS.length).getDisplayValues()[0];
  if(c.HEADERS.some((x,i)=>x!==h[i]))throw new Error('GPT_QUEUE_SCHEMA_MISMATCH');
  return {conf:conf,requests:requests,owner:effective};
}
function gptValidateMaterialsRequest20261027_(r,owner,now) {
  const c=GPT_MATERIALS_QUEUE_20261027;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!uuid.test(r[0]))return 'INVALID_REQUEST_ID';
  if(r[1]!==c.ACTION||r[2]!==c.MASTER_ID)return 'INVALID_ACTION_OR_SOURCE';
  if(String(r[6]).toLowerCase()!==owner)return 'INVALID_REQUESTER';
  const requested=Date.parse(r[4]),expires=Date.parse(r[5]);
  if(!Number.isFinite(requested)||!Number.isFinite(expires))return 'INVALID_REQUEST_DATE';
  if(requested>now+120000||now-requested>c.MAX_AGE_MS||expires<=now||
      expires<=requested||expires-requested>c.MAX_AGE_MS)return 'EXPIRED_OR_FUTURE_REQUEST';
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r[3]))
    return 'INVALID_SOURCE_REVISION';
  if(r[7]!=='REQUESTED')return 'NOT_REQUESTED';
  if(r[8]||r[9]||r[10]||r[11]||r[12]||r[13]||r[14])return 'DIRTY_REQUEST_ROW';
  return null;
}
function gptMaterialsQueueSource20261027_(revision) {
  const c=GPT_MATERIALS_QUEUE_20261027;
  const file=DriveApp.getFileById(c.MASTER_ID);
  if(file.getMimeType()!=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'||
     file.getName()!==c.MASTER_NAME)throw new Error('GPT_QUEUE_MASTER_ID_OR_TYPE_CHANGED');
  const actual=file.getLastUpdated().toISOString();
  if(actual!==revision)throw new Error('GPT_QUEUE_STALE_SOURCE_REVISION');
  // Existing importer uses findLatestFile_ rather than the queue file ID.
  // Check the selection resolves to exactly this canonical file before invoking it.
  if(typeof buildContext_!=='function'||typeof findLatestFile_!=='function'||
     typeof materialsSyncProduction!=='function')throw new Error('GPT_QUEUE_LEGACY_EXECUTOR_MISSING');
  const ctx=buildContext_();
  const above=getUniqueChildFolderByName_(ctx.rootFolder,CFG.ABOVE_FOLDER_NAME);
  const folder=getUniqueChildFolderByName_(above,CFG.MATERIALS_FOLDER_NAME);
  const selected=findLatestFile_(folder,CFG.MATERIAL_FILE_RE);
  if(!selected||selected.getId()!==c.MASTER_ID)throw new Error('GPT_QUEUE_IMPORTER_SOURCE_MISMATCH');
  return actual;
}
function getGPTMaterialsQueueStatus20261027() {
  const x=gptMaterialsQueueOpen20261027_();
  const triggerCount=ScriptApp.getProjectTriggers().filter(t=>
    t.getHandlerFunction()===GPT_MATERIALS_QUEUE_20261027.HANDLER).length;
  return {queue:x.conf.queue_state,worker:x.conf.worker_active,
    triggers:triggerCount,enabled:x.conf.queue_state==='LIVE_APPROVED'&&x.conf.worker_active==='TRUE',
    sourceFileId:GPT_MATERIALS_QUEUE_20261027.MASTER_ID};
}
function preflightGPTMaterialsQueue20261027() {
  // Read-only; no request claim, trigger installation, sync or data writes.
  const x=gptMaterialsQueueOpen20261027_();
  return {status:'PREFLIGHT_ONLY',queue:x.conf.queue_state,
    worker:x.conf.worker_active,headers:GPT_MATERIALS_QUEUE_20261027.HEADERS.length,
    sourceExists:!!DriveApp.getFileById(GPT_MATERIALS_QUEUE_20261027.MASTER_ID)};
}
function processGPTMaterialsSyncQueue20261027() {
  const x=gptMaterialsQueueOpen20261027_();
  if(x.conf.queue_state!=='LIVE_APPROVED'||x.conf.worker_active!=='TRUE')
    return {status:'disabled'};
  const owner=x.owner,c=GPT_MATERIALS_QUEUE_20261027;
  // Separate user lock for queue claiming; legacy importer itself holds the script lock.
  const claimLock=LockService.getUserLock();
  if(!claimLock.tryLock(1000))return {status:'claim_locked'};
  let sheet=x.requests,rowNo=0,revision='',requestId='';
  try {
    const last=sheet.getLastRow();
    if(last<2)return {status:'no_pending'};
    const rows=sheet.getRange(2,1,last-1,c.HEADERS.length).getDisplayValues();
    const ids={};
    rows.forEach(r=>{if(r[0])ids[r[0]]=(ids[r[0]]||0)+1;});
    for(let i=0;i<rows.length;i++){
      const r=rows[i];
      if(r[7]!=='REQUESTED')continue;
      rowNo=i+2;requestId=r[0];revision=r[3];
      const error=ids[requestId]!==1?'DUPLICATE_REQUEST_ID':
        gptValidateMaterialsRequest20261027_(r,owner,Date.now());
      if(error){
        sheet.getRange(rowNo,8).setValue('REVIEW');
        sheet.getRange(rowNo,14).setValue(error);
        return {status:'review',reason:error};
      }
      try{gptMaterialsQueueSource20261027_(revision)}catch(e){
        const reason=String(e&&e.message||'SOURCE_PREFLIGHT_FAILED');
        sheet.getRange(rowNo,8).setValue('REVIEW');
        sheet.getRange(rowNo,14).setValue(/^GPT_QUEUE_[A-Z_]+$/.test(reason)?reason:'SOURCE_PREFLIGHT_FAILED');
        return {status:'review',reason:'SOURCE_PREFLIGHT_FAILED'};
      }
      sheet.getRange(rowNo,8,1,2).setValues([['RUNNING',new Date().toISOString()]]);
      sheet.getRange(rowNo,15).setValue(c.BUILD);
      SpreadsheetApp.flush();
      break;
    }
    if(!rowNo)return {status:'no_pending'};
  } finally {claimLock.releaseLock();}
  try {
    // The existing importer performs normal parse/delta guards with force=false,
    // imports the canonical workbook, logs in drive_sync_runs and preserves source state.
    const outcome=materialsSyncProduction();
    const status=outcome&&outcome.status;
    if(status!=='success'&&status!=='skipped')throw new Error('INVALID_LEGACY_SYNC_RESULT');
    const sourceAfter=DriveApp.getFileById(c.MASTER_ID).getLastUpdated().toISOString();
    if(sourceAfter!==revision){
      sheet.getRange(rowNo,8).setValue('REVIEW');
      sheet.getRange(rowNo,14).setValue('SOURCE_CHANGED_DURING_SYNC_CHECK_DB_BEFORE_RETRY');
      return {status:'review',reason:'SOURCE_CHANGED_DURING_SYNC'};
    }
    sheet.getRange(rowNo,8).setValue('WAIT_SYNC');
    sheet.getRange(rowNo,10,1,2).setValues([[new Date().toISOString(),status]]);
    sheet.getRange(rowNo,14).setValue(status==='success'?
      'GAS_RUN_FINISHED_DB_AND_AUTH_UI_READBACK_REQUIRED':
      'GAS_UNCHANGED_SOURCE_DB_AND_AUTH_UI_READBACK_REQUIRED');
    // WAIT_SYNC is intentionally NOT COMPLETE: GPT must independently verify
    // source→Supabase row identity→authenticated Web UI for SOP 06/13.
    return {status:'WAIT_SYNC',legacyResult:status,requestId:requestId};
  } catch(err){
    sheet.getRange(rowNo,8).setValue('ERROR');
    sheet.getRange(rowNo,10).setValue(new Date().toISOString());
    sheet.getRange(rowNo,14).setValue('EXECUTION_FAILED_REVIEW_GAS_LOGS_NO_AUTO_RETRY');
    console.error('GPT queue Materials executor failed; inspect GAS Execution log: '+String(err));
    return {status:'ERROR',requestId:requestId};
  }
}
function installGPTMaterialsSyncQueue20261027() {
  // Install separately; preserve all existing triggers. Must be called only
  // after live source comparison, QA and owner approval of this exact scope.
  gptMaterialsQueueOpen20261027_();
  const handler=GPT_MATERIALS_QUEUE_20261027.HANDLER;
  const existing=ScriptApp.getProjectTriggers();
  const owned=existing.filter(t=>t.getHandlerFunction()===handler);
  if(owned.length===1)return {status:'already_installed',triggers:existing.length};
  if(owned.length>1||existing.length>=20)throw new Error('GPT_QUEUE_TRIGGER_LIMIT_OR_DUPLICATE');
  ScriptApp.newTrigger(handler).timeBased().everyMinutes(5).create();
  const count=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===handler).length;
  if(count!==1)throw new Error('GPT_QUEUE_TRIGGER_INSTALL_QA_FAILED');
  return {status:'installed_disabled_until_Control_APPROVED',count:count};
}
function uninstallGPTMaterialsSyncQueue20261027() {
  // Surgical rollback; never delete or replace Shift/Defect/Daily/Calendar triggers.
  const handler=GPT_MATERIALS_QUEUE_20261027.HANDLER;
  const target=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===handler);
  target.forEach(t=>ScriptApp.deleteTrigger(t));
  return {status:'uninstalled',removed:target.length};
}
