/**
 * 3 Kings / Daily Site Report -> Supabase standalone importer (v1, 2026-10-19).
 * ADD this file to the existing Apps Script project; do not replace any existing .gs.
 * Installation creates ONE new trigger and never deletes/edits existing 9 triggers.
 * Script Property SUPABASE_SERVICE_ROLE_KEY is reused; never paste the key into code or chat.
 * Source rows <=353 are explicitly not imported or rewritten.
 */
const DAILY_SITE_20261019=Object.freeze({
 SOURCE_ID:'1-ZSZXulxaje4vDP1ztvUBXsjlmffjAcDu0w1OHRnpUw',
 SOURCE_TAB:'การตอบแบบฟอร์ม 1', MIN_ROW:354,MAX_SOURCE_ROWS:5000,
 TZ:'Asia/Bangkok',
 API:'https://wtqubwdduzedmcvyhbgs.supabase.co/rest/v1/rpc/daily_site_report_sync_v1',
 TRIGGER:'dailySiteSyncHourly20261019'
});
function dailySiteSyncIsoDate20261019_(value) {
 if (value instanceof Date && !isNaN(value.getTime()))
   return Utilities.formatDate(value,DAILY_SITE_20261019.TZ,'yyyy-MM-dd');
 const s=String(value||'').trim();
 if(/^20\d{2}-\d{2}-\d{2}$/.test(s))return s;
 if(/^\d{1,2}\/\d{1,2}\/20\d{2}$/.test(s)){
   const a=s.split('/');return a[2]+'-'+a[1].padStart(2,'0')+'-'+a[0].padStart(2,'0');
 }
 throw Error('BLOCK_INVALID_WORK_DATE');
}
function dailySiteSyncTimestamp20261019_(value) {
 if(!(value instanceof Date)||isNaN(value.getTime()))throw Error('BLOCK_INVALID_FORM_TIMESTAMP');
 return Utilities.formatDate(value,DAILY_SITE_20261019.TZ,"yyyy-MM-dd'T'HH:mm:ssXXX");
}
function dailySiteSyncInteger20261019_(value) {
 if(value===''||value==null)throw Error('BLOCK_MISSING_HEADCOUNT');
 const n=Number(value);
 if(!Number.isInteger(n)||n<0)throw Error('BLOCK_INVALID_HEADCOUNT');
 return n;
}
function dailySiteSyncCodes20261019_(project,area) {
 const s=String(area||'');const projectText=String(project||'');
 const codes=[];
 function add(code){if(codes.indexOf(code)<0)codes.push(code)}
 [3,6,7,8,9].forEach(n=>{
   if(new RegExp('(?:Above Villa\\s*)?(?:Plot|P)\\s*'+n+'(?!\\d)','i').test(s)
      &&(/Villa/i.test(s)||/Villa/i.test(projectText)||/^P\\s*\d+$/i.test(s.trim())))
     add('AV-P'+n);
 });
 if(/Above Condo\s*A/i.test(s))add('CONDO-A');
 if(/Above Condo\s*B/i.test(s))add('CONDO-B');
 if(/Mirage/i.test(s)||/Mirage/i.test(projectText))add('MIRAGE');
 if(/Henn?essy/i.test(s)||/Henn?essy/i.test(projectText))add('HENNESSY');
 if(/พื้นที่ส่วนกลาง/.test(s)&&/Villa/i.test(projectText)&&codes.length===0)add('AV-COMMON');
 return codes;
}
function dailySiteSyncRead20261019_(){
 const file=DriveApp.getFileById(DAILY_SITE_20261019.SOURCE_ID);
 if(file.getMimeType()!=='application/vnd.google-apps.spreadsheet')
   throw Error('BLOCK_SOURCE_MIME_MISMATCH');
 const sheet=SpreadsheetApp.openById(DAILY_SITE_20261019.SOURCE_ID)
  .getSheetByName(DAILY_SITE_20261019.SOURCE_TAB);
 if(!sheet)throw Error('BLOCK_SOURCE_TAB_MISSING');
 const names=['ประทับเวลา','ประจำวันที่','ชื่อโครงการ','ตึก/พื้นที่/ชั้น/หลังที่',
 'ชื่อผู้ควบคุมงาน/ผู้รับผิดชอบ','จำนวนคนงาน ผู้ชาย','จำนวนคนงาน ผู้หญิง',
 'จำนวนคนงานทั้งหมด','รายละเอียดงาน','สถานะของงาน','แผนงานสำหรับขั้นตอนต่อไป',
 'รายละเอียดงานช่วงบ่าย (หากวางแผนงานไว้ไม่ซ้ำกับช่วงเช้า ให้ระบุ)',
 'Specific Area/Room Worked'];
 const head=sheet.getRange(1,1,1,names.length).getDisplayValues()[0].map(s=>s.trim());
 names.forEach((n,i)=>{if(head[i]!==n)throw Error('BLOCK_SOURCE_HEADER_MISMATCH_AT_'+(i+1))});
 const last=sheet.getLastRow();
 if(last<DAILY_SITE_20261019.MIN_ROW)return {rows:[],revision:String(file.getLastUpdated().getTime()),read:last-1};
 if(last>DAILY_SITE_20261019.MAX_SOURCE_ROWS)throw Error('BLOCK_SOURCE_LIMIT');
 const cells=sheet.getRange(DAILY_SITE_20261019.MIN_ROW,1,
   last-DAILY_SITE_20261019.MIN_ROW+1,names.length).getValues();
 const rows=[];
 cells.forEach((r,i)=>{
   const rowNumber=DAILY_SITE_20261019.MIN_ROW+i;
   if(r.every(x=>x===''||x==null))return;
   const male=dailySiteSyncInteger20261019_(r[5]);
   const female=dailySiteSyncInteger20261019_(r[6]);
   const total=dailySiteSyncInteger20261019_(r[7]);
   if(male+female!==total)throw Error('BLOCK_HEADCOUNT_MISMATCH_ROW_'+rowNumber);
   const txt=v=>v==null?'':String(v);
   rows.push({source_row:rowNumber,source_timestamp:dailySiteSyncTimestamp20261019_(r[0]),
     work_date:dailySiteSyncIsoDate20261019_(r[1]),project_name_raw:txt(r[2]),
     area_raw:txt(r[3]),supervisor_raw:txt(r[4]),male_count:male,
     female_count:female,total_manpower:total,work_detail:txt(r[8]),
     status_text:txt(r[9]),next_plan:txt(r[10]),afternoon_detail:txt(r[11]),
     specific_area:txt(r[12]),project_codes:dailySiteSyncCodes20261019_(r[2],r[3])});
 });
 return {rows:rows,revision:String(file.getLastUpdated().getTime()),read:last-1};
}
function dailySiteSyncRpc20261019_(data){
 const key=PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY');
 if(!key)throw Error('BLOCK_MISSING_EXISTING_SERVICE_ROLE_PROPERTY');
 const res=UrlFetchApp.fetch(DAILY_SITE_20261019.API,{
   method:'post',contentType:'application/json',
   headers:{apikey:key,Authorization:'Bearer '+key},
   payload:JSON.stringify(data),muteHttpExceptions:true
 });
 const code=res.getResponseCode();
 if(code!==200)throw Error('DSR_RPC_FAILED_HTTP_'+code); // no secret or body logged
 const result=JSON.parse(res.getContentText());
 if(!result||typeof result!=='object'||typeof result.blocked!=='number')
   throw Error('DSR_RPC_INVALID_RESPONSE');
 return result;
}
function dailySiteSyncRun20261019_(commit){
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(5000))return {status:'BLOCK_LOCKED'};
 try{
   const source=dailySiteSyncRead20261019_();
   if(!source.rows.length)return {status:'NO_NEW_ROWS',rows_read:source.read};
   const request={p_rows:source.rows,p_mode:'dry_run',p_expected:{},
     p_source_rows_read:source.read,p_source_revision:source.revision};
   const dry=dailySiteSyncRpc20261019_(request);
   if(dry.blocked>0)throw Error('BLOCK_REQUIRES_REVIEW_COUNT_'+dry.blocked);
   if(!commit)return {status:'DRY_RUN_OK',result:dry};
   // Source changed since dry-run => refuse to write a stale payload.
   const revision=String(DriveApp.getFileById(DAILY_SITE_20261019.SOURCE_ID)
      .getLastUpdated().getTime());
   if(source.revision!==revision)throw Error('BLOCK_SOURCE_REVISION_CHANGED');
   request.p_mode='commit';request.p_expected=dry.expected;
   const live=dailySiteSyncRpc20261019_(request);
   if(live.blocked!==0||live.verified!==source.rows.length
     ||live.would_insert_or_inserted!==dry.would_insert_or_inserted
     ||live.would_update_or_updated!==dry.would_update_or_updated)
     throw Error('BLOCK_POST_WRITE_VERIFICATION_MISMATCH');
   console.log('Daily Site Sync validated counts: '+JSON.stringify({
     read:live.rows_read,parsed:live.rows_parsed,inserted:live.would_insert_or_inserted,
     updated:live.would_update_or_updated,skipped:live.skipped,verified:live.verified
   }));
   return {status:'PASS_READBACK',result:live};
 } finally {lock.releaseLock()}
}
function dailySiteSyncDryRun20261019(){return dailySiteSyncRun20261019_(false)}
function dailySiteSyncNow20261019(){return dailySiteSyncRun20261019_(true)}
function dailySiteSyncHourly20261019(){return dailySiteSyncRun20261019_(true)}
function installDailySiteTrigger20261019(){
 const name=DAILY_SITE_20261019.TRIGGER;
 const all=ScriptApp.getProjectTriggers();
 const current=all.filter(t=>t.getHandlerFunction()===name);
 if(current.length>1)throw Error('BLOCK_DUPLICATE_DAILY_SITE_TRIGGERS');
 if(current.length===1)return {status:'ALREADY_INSTALLED',existingCount:all.length,dailyCount:1};
 // Add ONE; do not delete or edit any other trigger.
 const others=all.map(t=>t.getUniqueId()).sort();
 ScriptApp.newTrigger(name).timeBased().everyHours(1).create();
 const after=ScriptApp.getProjectTriggers();
 if(after.length!==all.length+1
   ||after.filter(t=>t.getHandlerFunction()===name).length!==1
   ||others.some(id=>!after.some(t=>t.getUniqueId()===id)))
   throw Error('BLOCK_TRIGGER_INSTALLATION_NOT_VERIFIED');
 return {status:'INSTALLED',before:all.length,after:after.length,dailyCount:1};
}
