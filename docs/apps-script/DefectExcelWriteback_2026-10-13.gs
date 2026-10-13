/**
 * 3Kings Above Condo — Web Defect -> two original Excel workbooks (2026-10-13).
 * INSTALL IN EXISTING Google Apps Script PROJECT with the existing Defect SmartSync.
 * No Google Sheet conversion, no whole-sheet rewrite, no removal of formulas.
 * Requires Script Properties: SUPABASE_PUBLISHABLE_KEY, DEFECT_SYNC_KEY
 * Requires Apps Script OAuth scopes: drive, script.external_request.
 * IMPORTANT: first run runDefectWritebackDryRun() before enabling trigger.
 */
const DEFECT_WB = Object.freeze({
  SUPABASE_URL: 'https://wtqubwdduzedmcvyhbgs.supabase.co',
  FILES: [
    {id:'1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',
     name:'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
     sheet:'ข้อมูลจำแนก', sheetPath:'xl/worksheets/sheet4.xml', roomCol:'C'},
    {id:'16JuK26rn7HGPDtSlnMMS2aljYGWyn0Y3',
     name:'Status ภาพรวม รายห้อง-Building-A-B-Done_Updated_28-09-2026.xlsx',
     sheet:'Room Data', sheetPath:'xl/worksheets/sheet4.xml', roomCol:'D'}
  ],
  MAX_BATCH: 8,
  XLSX_MIME: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});
function runDefectWritebackDryRun() {
  // Always verify both existing workbook schemas, even if the queue is empty.
  const fixture={room_no:'A212',revision:'DRY_RUN',current_status:'DRY RUN',
    status_group:'Hotel - Incomplete',next_action:'Dry run & verification',
    latest_source:'DRY_RUN',source_note:'No actual file modification',
    defect_detail:'Test-only; never uploaded'};
  DEFECT_WB.FILES.forEach(function(meta){defectWbPrepare_(meta,fixture,true);});
  return defectWbRun_(true);
}
function runDefectWritebackScheduled() {
  return defectWbRun_(false);
}
function installDefectWritebackTrigger() {
  // Do not touch the preexisting Smart Sync trigger.
  const fn = 'runDefectWritebackScheduled';
  ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===fn;})
    .forEach(function(t){ScriptApp.deleteTrigger(t);});
  ScriptApp.newTrigger(fn).timeBased().everyMinutes(5).create();
  return fn;
}
function defectWbConfig_() {
  const p=PropertiesService.getScriptProperties();
  const pub=p.getProperty('SUPABASE_PUBLISHABLE_KEY');
  const key=p.getProperty('DEFECT_SYNC_KEY');
  if (!pub || !key) throw Error('Missing SUPABASE_PUBLISHABLE_KEY or DEFECT_SYNC_KEY Script Property');
  return {pub:pub,key:key};
}
function defectWbRpc_(config,method,arg) {
  const response=UrlFetchApp.fetch(DEFECT_WB.SUPABASE_URL+'/rest/v1/rpc/'+method,{
    method:'post',contentType:'application/json',
    headers:{apikey:config.pub,Authorization:'Bearer '+config.pub},
    payload:JSON.stringify(Object.assign({p_sync_key:config.key},arg)),
    muteHttpExceptions:true
  });
  const body=response.getContentText();
  if(response.getResponseCode()!==200)throw Error(method+' HTTP '+response.getResponseCode()+' '+body.slice(0,200));
  const data=JSON.parse(body);
  if(data && data.ok===false)throw Error(method+': '+JSON.stringify(data).slice(0,260));
  return data;
}
function defectWbRun_(dryRun) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000)) return {ok:false,reason:'executor-already-running'};
  try {
    const config=defectWbConfig_();
    const batch=defectWbRpc_(config,'defect_writeback_pull',{p_limit:DEFECT_WB.MAX_BATCH});
    const rows=batch.rows||[];
    let synced=0;const errors=[];
    rows.forEach(function(change){
      try {
        if(!/^[AB][0-9]{3}$/.test(change.room_no))throw Error('Invalid room ID');
        if(dryRun) {
          DEFECT_WB.FILES.forEach(function(meta){defectWbPrepare_(meta,change,true);});
          return;
        }
        // Each file uses its exact Drive ID. Both must be saved and read back.
        DEFECT_WB.FILES.forEach(function(meta){defectWbPrepare_(meta,change,false);});
        const ack=defectWbRpc_(config,'defect_writeback_ack',{
          p_room_no:change.room_no,p_revision:change.revision,
          p_master_file_id:DEFECT_WB.FILES[0].id,
          p_overview_file_id:DEFECT_WB.FILES[1].id
        });
        if(!ack.ok)throw Error('Newer web edit exists: retry newest revision');
        synced++;
      } catch(err){
        errors.push(change.room_no+': '+String(err).slice(0,260));
        if(!dryRun) {
          try { defectWbRpc_(config,'defect_writeback_failure',{
            p_room_no:change.room_no,p_revision:change.revision,p_error:String(err)
          }); } catch(ignore){console.error('Writeback error reporting failed: '+ignore);}
        }
      }
    });
    const result={ok:errors.length===0,dryRun:dryRun,pendingRead:rows.length,
      excelVerifiedAndAcknowledged:synced,errors:errors};
    console.log(JSON.stringify(result));
    return result;
  } finally {lock.releaseLock();}
}
function defectWbPrepare_(meta,change,dryRun) {
  const file=DriveApp.getFileById(meta.id);
  if(file.getName()!==meta.name || file.getMimeType()!==DEFECT_WB.XLSX_MIME)
    throw Error('Drive name/type mismatch: '+meta.id);
  const initialModified=file.getLastUpdated().getTime();
  const blobs=Utilities.unzip(file.getBlob());
  const lookup={};blobs.forEach(function(b){lookup[b.getName()]=b;});
  if(!lookup[meta.sheetPath]||!lookup['xl/workbook.xml'])
    throw Error('Original workbook missing required worksheet');
  if(lookup['xl/workbook.xml'].getDataAsString().indexOf('name="'+meta.sheet+'"')<0)
    throw Error('Workbook sheet identity changed');
  const before=lookup[meta.sheetPath].getDataAsString();
  const shared=defectWbSharedStrings_(lookup['xl/sharedStrings.xml']);
  const idx=defectWbFindRoomRow_(before,shared,meta.roomCol,change.room_no);
  const values=meta.roomCol==='C'?
    {F:change.current_status,I:change.status_group,L:change.next_action,
     M:change.latest_source,N:change.source_note,Q:change.defect_detail}:
    {R:change.current_status,S:change.status_group,T:change.next_action,
     U:change.defect_detail,V:change.revision};
  const headers=meta.roomCol==='C'?{Q:'Defect Detail (Web App)'}:
    {R:'Web Defect Status',S:'Web Status Group',T:'Web Next Action',
     U:'Web Defect Detail',V:'Web Confirmed At'};
  let xml=before;
  Object.keys(headers).forEach(function(col){xml=defectWbPutCell_(xml,col+'1',headers[col]);});
  Object.keys(values).forEach(function(col){xml=defectWbPutCell_(xml,col+idx,values[col]||'');});
  if(xml===before)throw Error('Workbook write produced no change');
  lookup[meta.sheetPath]=Utilities.newBlob(xml,'text/xml',meta.sheetPath);
  // Formula components and other workbook members remain untouched.
  const output=Utilities.zip(blobs.map(function(b){return lookup[b.getName()];}),meta.name)
    .setContentType(DEFECT_WB.XLSX_MIME);
  if(dryRun) {
    const verify=defectWbVerifyXml_(xml,meta,idx,values);
    if(!verify)throw Error('Dry-run XML validation failed');
    return {row:idx,dryRun:true};
  }
  if(file.getLastUpdated().getTime()!==initialModified)
    throw Error('Workbook changed during read; refusing to overwrite.');
  const resp=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/'+meta.id+'?uploadType=media',{
    method:'patch',contentType:DEFECT_WB.XLSX_MIME,
    headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
    payload:output.getBytes(),muteHttpExceptions:true
  });
  if(resp.getResponseCode()<200||resp.getResponseCode()>=300)
    throw Error('Drive upload '+resp.getResponseCode()+': '+resp.getContentText().slice(0,150));
  // Re-fetch the original same ID; never acknowledge an upload response alone.
  const actual=DriveApp.getFileById(meta.id);
  const fresh=Utilities.unzip(actual.getBlob());
  const target=fresh.filter(function(b){return b.getName()===meta.sheetPath;})[0];
  if(!target||!defectWbVerifyXml_(target.getDataAsString(),meta,idx,values))
    throw Error('Drive read-back does not match saved Defect values');
  return {row:idx,verified:true};
}
function defectWbFindRoomRow_(xml,shared,col,roomNo) {
  const rows=xml.match(/<row\b[^>]*\br="\d+"[^>]*>[\s\S]*?<\/row>/g)||[];
  let match=null,unique=0,a=0,b=0;
  rows.forEach(function(row){
    const n=(row.match(/<row\b[^>]*\br="(\d+)"/)||[])[1];
    if(!n || +n<2 || +n>264)return;
    const value=defectWbReadCell_(row,col+n,shared);
    if(!/^[AB][0-9]{3}$/.test(value))throw Error('Unexpected room mapping at row '+n);
    unique++;if(value[0]==='A')a++;else b++;
    if(value===roomNo)match=+n;
  });
  if(unique!==263||a!==162||b!==101||!match)
    throw Error('Room-set safety gate failed: '+unique+' A='+a+' B='+b+' room='+roomNo);
  return match;
}
function defectWbSharedStrings_(blob) {
  if(!blob)throw Error('Missing shared strings');
  const xml=blob.getDataAsString(), list=[];
  const items=xml.match(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g)||[];
  items.forEach(function(si){
    const t=si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)||[];
    list.push(t.map(function(x){return defectWbUnescape_(x.replace(/^<t[^>]*>/,'').replace(/<\/t>$/,''));}).join(''));
  });
  return list;
}
function defectWbReadCell_(xml,addr,shared) {
  const pattern=new RegExp('<c\\b[^>]*\\br="'+addr+'"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)');
  const m=xml.match(pattern);if(!m)return '';
  const cell=m[0],type=(cell.match(/\bt="([^"]+)"/)||[])[1]||'';
  if(type==='inlineStr'){
    const v=(cell.match(/<t[^>]*>([\s\S]*?)<\/t>/)||[])[1]||'';
    return defectWbUnescape_(v);
  }
  const raw=(cell.match(/<v>([\s\S]*?)<\/v>/)||[])[1]||'';
  return type==='s'?(shared[Number(raw)]||''):defectWbUnescape_(raw);
}
function defectWbVerifyXml_(xml,meta,row,values) {
  const fakeShared=[];
  return Object.keys(values).every(function(col){
    return defectWbReadCell_(xml,col+row,fakeShared)===String(values[col]||'');
  });
}
function defectWbPutCell_(xml,addr,value) {
  const rowNum=(addr.match(/\d+/)||[])[0];
  const pattern=new RegExp('(<row\\b[^>]*\\br="'+rowNum+'"[^>]*>)([\\s\\S]*?)(<\\/row>)');
  const rowMatch=xml.match(pattern);
  if(!rowMatch)throw Error('Row missing: '+rowNum);
  const cellPattern=new RegExp('<c\\b[^>]*\\br="'+addr+'"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)');
  const prev=rowMatch[2].match(cellPattern);
  if(prev && /<f(?:\s|>)/.test(prev[0]))throw Error('Refusing to replace Excel formula: '+addr);
  const style=prev?(prev[0].match(/\bs="(\d+)"/)||[])[1]:null;
  const element='<c r="'+addr+'"'+(style?' s="'+style+'"':'')+
    ' t="inlineStr"><is><t xml:space="preserve">'+defectWbEscape_(String(value))+'</t></is></c>';
  const newBody=prev?rowMatch[2].replace(cellPattern,element):rowMatch[2]+element;
  const updated=rowMatch[1]+newBody+rowMatch[3];
  return xml.replace(pattern,function(){return updated;});
}
function defectWbEscape_(value) {
  // Reject characters that cannot be serialized in an Excel XML cell.
  const cleaned=value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
  return cleaned.replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function defectWbUnescape_(value) {
  return value.replace(/&quot;/g,'"').replace(/&apos;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
}
