/**
 * QA ONLY: copies approved Work Order XLSX to a pre-authorized private
 * DO_NOT_SYNC folder, tests the staged writer against that COPY, reads it back,
 * and restores the COPY to its original bytes (same QA file ID).
 *
 * No Defect/Supabase/Web mutation. No production XLSX write, property changes,
 * new triggers, or automatic cleanup. Manually set the existing Script Property
 * WORK_ORDER_QA_FOLDER_ID to the private owner-only QA folder ID before running.
 *
 * Never add real secrets, file IDs or copied XLSX bytes to GitHub/CI.
 * Run workOrderIsolatedQaWriteRestore20261021() manually ONCE with the exact
 * reviewed current Single Writer source installed in this GAS project.
 */
function workOrderIsolatedQaWriteRestore20261021() {
  const gate=workOrderSingleWriterPreflight20261021();
  if(!gate.ok||gate.enabled||gate.importerTriggers!==1||
      gate.mirrorTriggers!==0||gate.writerTriggers!==0)
    throw Error('QA HOLD: Preflight requires importer=1, mirror=0, writer=0 and writer disabled');
  if(typeof workOrderWbApply20261015_!=='function')
    throw Error('QA HOLD: current Single Writer source missing');

  const prod=workOrderConfig20261015_();
  const props=PropertiesService.getScriptProperties();
  const folderId=props.getProperty('WORK_ORDER_QA_FOLDER_ID');
  if(!folderId||!(/^[A-Za-z0-9_-]{20,200}$/.test(folderId)))
    throw Error('QA HOLD: set WORK_ORDER_QA_FOLDER_ID to the private QA folder');
  const folder=DriveApp.getFolderById(folderId);
  if(folder.getName()!=='QA_Excel_Writeback_Test_2026-10-19_DO_NOT_SYNC')
    throw Error('QA HOLD: unexpected QA folder; no copy created');
  const source=DriveApp.getFileById(prod.id);
  if(source.getName()!==WORK_ORDER_AUTO_20261015.FILE_NAME ||
      source.getMimeType()!==WORK_ORDER_WB_20261015.MIME)
    throw Error('QA HOLD: approved XLSX identity mismatch');
  const srcModified=source.getLastUpdated().getTime();
  const srcFolder=source.getParents();
  if(!srcFolder.hasNext()||srcFolder.next().getId()===folderId)
    throw Error('QA HOLD: the configured original is already in the QA folder');

  const lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw Error('QA HOLD: another sync holds the project lock');
  let copy=null,originalBytes=null,attemptedWrite=false,restored=false,report=null;
  try {
    // Test the current approved XLSX layout; only the new COPY will be changed.
    copy=source.makeCopy(source.getName(),folder);
    if(copy.getId()===prod.id || copy.getName()!==source.getName())
      throw Error('QA HOLD: copy identity mismatch');
    const parents=copy.getParents();
    if(!parents.hasNext()||parents.next().getId()!==folderId)
      throw Error('QA HOLD: copy was not created inside the private QA folder');
    originalBytes=copy.getBlob().getBytes();
    const before=workOrderQaZipParts20261021_(originalBytes,copy.getName());
    const dispatch=workOrderWbSheetPath20261015_(before);
    const shared=workOrderWbShared20261015_(before['xl/sharedStrings.xml']);
    const oldSheet=before[dispatch].getDataAsString();
    const header=workOrderWbHeader20261015_(oldSheet,shared);
    let candidate=null;
    for(let i=header.row+1;i<=500;i++){
      const row=workOrderWbRow20261015_(oldSheet,i);
      if(!row)continue;
      const workId=workOrderWbCell20261015_(row,header.idCol+i,shared);
      const status=workOrderWbCell20261015_(row,header.statusCol+i,shared);
      const completed=workOrderWbCell20261015_(row,'P'+i,shared);
      if(/^DF-[A-Za-z0-9()_-]+$/.test(workId) &&
         !/เสร็จแล้ว|งดแจก|ยกเลิก/.test(status) && !completed){
        candidate={work_id:workId,web_completed_at:new Date().toISOString(),row:i};
        break;
      }
    }
    if(!candidate)throw Error('QA HOLD: no eligible open Work ID in QA copy; leave source unchanged');
    const qaConfig={id:copy.getId(),apikey:prod.apikey,syncKey:prod.syncKey};
    const dry=workOrderWbApply20261015_(qaConfig,candidate,true);
    if(!dry.verified||!dry.dryRun||dry.row!==candidate.row)
      throw Error('QA HOLD: isolated dry-run did not verify the chosen Work ID');
    attemptedWrite=true; // restore even if a partial write throws
    const result=workOrderWbApply20261015_(qaConfig,candidate,false);
    if(!result.verified||result.row!==candidate.row)
      throw Error('QA FAIL: isolated same-ID upload/readback did not verify');
    const after=workOrderQaZipParts20261021_(copy.getBlob().getBytes(),copy.getName());
    const beforeNames=Object.keys(before).sort(),afterNames=Object.keys(after).sort();
    if(JSON.stringify(beforeNames)!==JSON.stringify(afterNames))
      throw Error('QA FAIL: XLSX member inventory changed');
    beforeNames.forEach(name=>{
      if(name===dispatch)return;
      if(workOrderQaDigest20261021_(before[name].getBytes())!==
         workOrderQaDigest20261021_(after[name].getBytes()))
        throw Error('QA FAIL: unexpected modified XLSX member '+name);
    });
    const newSheet=after[dispatch].getDataAsString();
    const strip=xml=>{
      // Whitelist only status, new date header/date and worksheet dimension.
      const refs=[header.statusCol+candidate.row,'P'+header.row,'P'+candidate.row];
      refs.forEach(ref=>{
        const pattern=new RegExp('<c\\b(?=[^>]*\\br="'+ref+'")[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)','g');
        xml=xml.replace(pattern,'');
      });
      return xml.replace(/(<dimension\b[^>]*\bref=")[^"]+/, '$1QA_DIM');
    };
    if(strip(oldSheet)!==strip(newSheet))
      throw Error('QA FAIL: unrelated worksheet XML changed');
    const countFormula=s=>(s.match(/<f(?:\s[^>]*)?>/g)||[]).length;
    if(countFormula(oldSheet)!==countFormula(newSheet))
      throw Error('QA FAIL: formula inventory changed');
    // Already-completed on the COPY must be a zero-write idempotent no-op.
    const repeat=workOrderWbApply20261015_(qaConfig,candidate,true);
    if(!repeat.unchanged||!repeat.verified)
      throw Error('QA FAIL: idempotent readback mismatch');
    if(source.getLastUpdated().getTime()!==srcModified)
      throw Error('QA HOLD: canonical source modified during QA, investigate separately');
    report={status:'QA_WRITE_READBACK_PASS_PENDING_RESTORE',
      work_id:candidate.work_id,qa_copy_id:copy.getId(),source_modified_unchanged:true,
      zip_members:beforeNames.length,formula_count:countFormula(oldSheet),idempotent:true};
  } catch(e){
    console.error('WORK_ORDER_QA_ERROR: '+String(e));
    throw e;
  } finally {
    try {
      if(copy && originalBytes && attemptedWrite){
        if(copy.getId()===prod.id)throw Error('QA RESTORE BLOCKED: unexpected original ID');
        const restore=UrlFetchApp.fetch(
          'https://www.googleapis.com/upload/drive/v3/files/'+copy.getId()+'?uploadType=media',{
            method:'patch',contentType:WORK_ORDER_WB_20261015.MIME,
            headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
            payload:originalBytes,muteHttpExceptions:true
          });
        if(restore.getResponseCode()<200||restore.getResponseCode()>=300)
          throw Error('QA RESTORE FAILED HTTP '+restore.getResponseCode());
        const restoredBytes=DriveApp.getFileById(copy.getId()).getBlob().getBytes();
        if(workOrderQaDigest20261021_(restoredBytes)!==
           workOrderQaDigest20261021_(originalBytes))
          throw Error('QA RESTORE FAILED: same-ID ZIP SHA-256 does not match');
        restored=true;
      } else if(copy && originalBytes) {
        restored=workOrderQaDigest20261021_(copy.getBlob().getBytes())===
          workOrderQaDigest20261021_(originalBytes);
      }
      if(copy && restored){
        // Rename to make this proof file unmistakably different from the master.
        copy.setName('QA_RESTORED_DO_NOT_SYNC_'+source.getName());
      }
      console.log('WORK_ORDER_QA_RESULT: '+JSON.stringify({
        status:report && restored?'QA_SAME_ID_WRITE_AND_RESTORE_PASS':'HOLD',
        qa_copy_id:copy?copy.getId():null,
        restored:restored,report:report
      }));
    } finally {
      lock.releaseLock();
    }
  }
  if(!restored)throw Error('QA HOLD: copy restore unverified; inspect QA folder');
  return {...report,status:'QA_SAME_ID_WRITE_AND_RESTORE_PASS',restored:true};
}
function workOrderQaZipParts20261021_(bytes,name) {
  const parts={};
  Utilities.unzip(Utilities.newBlob(bytes,'application/zip',name)).forEach(blob=>{
    if(parts[blob.getName()])throw Error('QA FAIL: duplicate ZIP member '+blob.getName());
    parts[blob.getName()]=blob;
  });
  if(!parts['xl/workbook.xml'] || !parts['xl/_rels/workbook.xml.rels'])
    throw Error('QA FAIL: incomplete XLSX container');
  return parts;
}
function workOrderQaDigest20261021_(bytes) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes));
}
