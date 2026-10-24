/**
 * Express -> existing XLSX Materials Master; owner-executed, fail-closed.
 * Dependencies: previously approved ExpressBridgeAppendQA and ExpressBridgeFullQA.
 * Does not touch Supabase, existing Materials follow-up data, or GAS triggers.
 * DRY RUN: expressBridgeMasterImportDryRun20261022()
 * WRITE (after release gate approval): expressBridgeMasterImportOnce20261022()
 * Keep all source CSVs unchanged. Canceled records are excluded.
 */
const EB_MASTER_WRITE = Object.freeze({
 original:'1Yr9iNVo54g4PrB2ntFb6E_ouI_ohHqSn',
 qaCopy:'1GeZZHQdrLPv83xtPx1pgA4HipFSEvtWF',
 qaFolder:'1jjjd1Xlw9xEbGpbH533ZAWSvPEyHKbgZ',
 firstOriginalSha:'3ab818826c1a4da6dd4848ec94c5b857d5af7aadbd71085b95928e1e692b7394',
 expectedName:'ABOVE_MATERIALS_STATUS_Stock_Updated_2026-09-20.xlsx',
 prop:'EXPRESS_BRIDGE_MASTER_REGISTER_LAST_XML_SHA_V1',
 maxBytes:20000000,
 paths:['xl/worksheets/sheet12.xml','xl/worksheets/sheet13.xml'],
});
function EB_masterMakePayload_(isWrite) {
 const file=DriveApp.getFileById(EB_MASTER_WRITE.original);
 if(file.getId()!==EB_MASTER_WRITE.original||file.getName()!==EB_MASTER_WRITE.expectedName||
    file.getMimeType()!=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
   throw Error('MASTER_FILE_IDENTITY_HOLD');
 const srcBlob=file.getBlob(),srcBytes=srcBlob.getBytes(),srcHash=EB_qaHash_(srcBytes);
 if(srcBytes.length>EB_MASTER_WRITE.maxBytes)throw Error('MASTER_SIZE_HOLD');
 const before=expressBridgeAppendQAParts_(srcBlob),p=before.map;
 const sources=EB_qaReadFolder_(),merged=EB_mergeReports_(sources),map=EB_qaMapRegisters_(merged);
 if(!sources.some(x=>x.name==='PO2023-211020260935.csv')||
    !sources.some(x=>x.name==='PR2023-211020260935.csv')||
    map.documents<3706||map.lines<13114)throw Error('SOURCE_DATA_LOSS_HOLD');
 const xml=[EB_qaWorksheetXml_(map.docRows,EB_FULL_QA.docColumns.length),
            EB_qaWorksheetXml_(map.itemRows,EB_FULL_QA.itemColumns.length)];
 const wanted=xml.map(EB_qaHashText_).join('|');
 const has=EB_MASTER_WRITE.paths.map(x=>Boolean(p[x]));
 if(has[0]!==has[1])throw Error('MASTER_PARTIAL_REGISTRY_HOLD');
 const first=!has[0];let zip=null;
 const prop=PropertiesService.getScriptProperties();
 if(first){
  if(srcHash!==EB_MASTER_WRITE.firstOriginalSha)throw Error('MASTER_BASE_REVISION_HOLD');
  const qa=DriveApp.getFileById(EB_MASTER_WRITE.qaCopy);
  if(qa.getName()!=='QA_Express_Append_OriginalWorkbook_SameID_2026-10-22.xlsx')throw Error('QA_REFERENCE_IDENTITY_HOLD');
  const candidate=qa.getBlob();zip=candidate;
  const parts=expressBridgeAppendQAParts_(candidate);
  EB_qaUnchangedOriginal_(before,parts);
  EB_qaProveSheetNames_(parts);
  EB_MASTER_WRITE.paths.forEach((path,i)=>{
   if(parts.map[path].getDataAsString('UTF-8')!==xml[i])throw Error('QA_REGISTRY_SOURCE_MISMATCH_HOLD');
  });
 }else{
  EB_qaProveSheetNames_(before);
  const current=EB_MASTER_WRITE.paths.map(x=>EB_qaHashText_(p[x].getDataAsString('UTF-8'))).join('|');
  if(current===wanted)return {status:'NO_CHANGE',first:false,file:file,sources:sources,
   originalHash:srcHash,wanted:wanted,documents:map.documents,lines:map.lines,sourceReview:merged.counts.held,unassigned:merged.docs.filter(x=>!x.plot.length).length,skippedCanceled:merged.skippedCanceled};
  if(prop.getProperty(EB_MASTER_WRITE.prop)!==current)throw Error('MASTER_REGISTER_MANUAL_EDIT_OR_STATE_MISSING_HOLD');
  const patch=new Map(EB_MASTER_WRITE.paths.map((s,i)=>[s,xml[i]]));
  zip=Utilities.zip(before.list.map(part=>patch.has(part.getName())?
    Utilities.newBlob(patch.get(part.getName()),'text/xml',part.getName()):part),'Express_Master_Register_Update.xlsx');
  EB_qaOnlyTwoWorksheetsChanged_(before,expressBridgeAppendQAParts_(zip));
 }
 if(zip.getBytes().length>EB_MASTER_WRITE.maxBytes)throw Error('MASTER_PATCH_SIZE_HOLD');
 return {status:'DELTA_READY',first:first,file:file,sourceBlob:srcBlob,originalHash:srcHash,
  candidate:zip,sources:sources,wanted:wanted,xml:xml,documents:map.documents,lines:map.lines,
  sourceReview:merged.counts.held,unassigned:merged.docs.filter(x=>!x.plot.length).length,skippedCanceled:merged.skippedCanceled};
}
function expressBridgeMasterImportDryRun20261022(){
 const state=EB_masterMakePayload_(false);
 const result={status:state.status==='NO_CHANGE'?'MASTER_REGISTER_ALREADY_CURRENT':'MASTER_IMPORT_PREFLIGHT_PASS',
  action:state.first?'APPEND_TWO_NEW_TABS':'UPDATE_ONLY_TWO_TABS',sourceFiles:state.sources.length,
  documents:state.documents,lines:state.lines,sourceReview:state.sourceReview,
  unassigned:state.unassigned,skippedCanceled:state.skippedCanceled,
  originalFileId:EB_MASTER_WRITE.original,originalSha256:state.originalHash,
  intendedWriteBytes:state.candidate?state.candidate.getBytes().length:0,
  mutationOriginal:0,mutationSupabase:0};
 console.log('EXPRESS_BRIDGE_MASTER_IMPORT '+JSON.stringify(result));return result;
}
function expressBridgeMasterImportOnce20261022(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(30000))throw Error('MASTER_IMPORT_LOCK_BUSY');
 try{
  if(PropertiesService.getScriptProperties().getProperty('EXPRESS_BRIDGE_MASTER_WRITE_APPROVED')!=='true')
   throw Error('OWNER_RELEASE_GATE_NOT_ENABLED');
  const state=EB_masterMakePayload_(true);
  if(state.status==='NO_CHANGE'){
   const r={status:'MASTER_IMPORT_NO_CHANGE',documents:state.documents,lines:state.lines,
    originalFileId:EB_MASTER_WRITE.original,mutationOriginal:0,mutationSupabase:0};
   console.log('EXPRESS_BRIDGE_MASTER_IMPORT '+JSON.stringify(r));return r;
  }
  EB_qaVerifyFolderUnchanged_(state.sources);
  if(EB_qaHash_(state.file.getBlob().getBytes())!==state.originalHash)throw Error('MASTER_CHANGED_PRE_COMMIT');
  let backupId=null;
  if(state.first){
   const backup=state.file.makeCopy('BACKUP_BEFORE_EXPRESS_REGISTER_2026-10-22.xlsx',
    DriveApp.getFolderById(EB_MASTER_WRITE.qaFolder));
   if(EB_qaHash_(backup.getBlob().getBytes())!==state.originalHash)throw Error('MASTER_BACKUP_READBACK_HOLD');
   backupId=backup.getId();
  }
  const r=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(EB_MASTER_WRITE.original)+'?uploadType=media&fields=id',{
   method:'patch',contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},payload:state.candidate.getBytes(),muteHttpExceptions:true});
  if(r.getResponseCode()<200||r.getResponseCode()>299)throw Error('MASTER_DRIVE_WRITE_HTTP_'+r.getResponseCode());
  const result=JSON.parse(r.getContentText());if(result.id!==EB_MASTER_WRITE.original)throw Error('MASTER_ID_CHANGED');
  // Roll back a failed post-write readback only when no intervening human edit occurred.
  let afterFile,after;
  try{
   afterFile=DriveApp.getFileById(EB_MASTER_WRITE.original);
   after=expressBridgeAppendQAParts_(afterFile.getBlob());
   if(state.first){
    const before=expressBridgeAppendQAParts_(state.sourceBlob);
    EB_qaUnchangedOriginal_(before,after);
   }else EB_qaOnlyTwoWorksheetsChanged_(expressBridgeAppendQAParts_(state.sourceBlob),after);
   EB_MASTER_WRITE.paths.forEach((p,i)=>{
    if(after.map[p].getDataAsString('UTF-8')!==state.xml[i])throw Error('MASTER_REGISTER_READBACK_HOLD');
   });
   EB_qaVerifyFolderUnchanged_(state.sources);
  }catch(readbackError){
   const live=DriveApp.getFileById(EB_MASTER_WRITE.original),liveSha=EB_qaHash_(live.getBlob().getBytes());
   const candidateSha=EB_qaHash_(state.candidate.getBytes());
   if(liveSha!==candidateSha)throw Error('MASTER_READBACK_FAILED_INTERVENING_EDIT_DO_NOT_ROLLBACK: '+readbackError);
   const rollback=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(EB_MASTER_WRITE.original)+'?uploadType=media&fields=id',{
    method:'patch',contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},payload:state.sourceBlob.getBytes(),muteHttpExceptions:true});
   if(rollback.getResponseCode()<200||rollback.getResponseCode()>299||
      EB_qaHash_(DriveApp.getFileById(EB_MASTER_WRITE.original).getBlob().getBytes())!==state.originalHash)
      throw Error('MASTER_READBACK_FAILED_ROLLBACK_FAILED_OWNER_ACTION_REQUIRED');
   throw Error('MASTER_READBACK_FAILED_ROLLED_BACK: '+readbackError);
  }
  PropertiesService.getScriptProperties().setProperty(EB_MASTER_WRITE.prop,state.wanted);
  const resultLog={status:'MASTER_REGISTER_WRITE_READBACK_PASS',originalFileId:EB_MASTER_WRITE.original,
   originalShaBefore:state.originalHash,originalShaAfter:EB_qaHash_(afterFile.getBlob().getBytes()),
   backupId:backupId,sourceFiles:state.sources.length,documents:state.documents,lines:state.lines,
   sourceReview:state.sourceReview,unassigned:state.unassigned,skippedCanceled:state.skippedCanceled,
   mutationOriginal:1,mutationSupabase:0,nextGate:'REGISTER_TO_SUPABASE_WEB_RELEASE'};
  console.log('EXPRESS_BRIDGE_MASTER_IMPORT '+JSON.stringify(resultLog));return resultLog;
 }finally{lock.releaseLock()}
}
