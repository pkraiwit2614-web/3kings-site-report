/**
 * Above Element Work Plan XLSX 2-way executor — isolated from Defect and Hotel OOO/OOS.
 * Install as ONE NEW .gs file in the EXISTING 3 Kings Apps Script project.
 * Uses existing SUPABASE_PUBLISHABLE_KEY and DEFECT_SYNC_KEY Script Properties.
 *
 * Safe sequence: preview -> validate all 276 keys -> Excel->DB guarded import ->
 * reread DB -> guarded write of ONLY sheet7.xml -> compare other ZIP parts byte-for-byte
 * -> readback -> DB revision ACK. Never overwrite on conflict.
 *
 * Entry points: hotelWorkPlanDryRun(), hotelWorkPlanSyncNow(), hotelWorkPlanInstallTrigger().
 */
const HOTEL_WORK_PLAN_SYNC=Object.freeze({
 FILE_ID:'1KZ-VMDssYeMmTE-TNLYU0d8fwQkSUtuS',
 FILE_NAME:'Above_Element_Hotel_vs_Defect_2026-10-13.xlsx',
 MIME:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 URL:'https://wtqubwdduzedmcvyhbgs.supabase.co',
 TARGET:'xl/worksheets/sheet7.xml',
 SOURCE:'xl/worksheets/sheet4.xml',
 REL_ID:'rIdHotelWorkPlan20261014',
 TAB:'Hotel_Work_Plan',
 TZ:'Asia/Bangkok',
 STATUS:{pending:'รอกำหนด',confirmed:'ยืนยันนัดหมาย',in_progress:'กำลังทำ',completed:'ทำงานตามแผนแล้ว',postponed:'เลื่อนแผน'}
});
function hpConfig_(){
 const p=PropertiesService.getScriptProperties();
 const apikey=p.getProperty('SUPABASE_PUBLISHABLE_KEY'),key=p.getProperty('DEFECT_SYNC_KEY');
 if(!apikey||!key)throw Error('Missing existing SUPABASE_PUBLISHABLE_KEY/DEFECT_SYNC_KEY');
 return {apikey,key};
}
function hpRPC_(c,method,payload){
 const resp=UrlFetchApp.fetch(HOTEL_WORK_PLAN_SYNC.URL+'/rest/v1/rpc/'+method,{
  method:'post',contentType:'application/json',headers:{apikey:c.apikey,Authorization:'Bearer '+c.apikey},
  payload:JSON.stringify(Object.assign({p_key:c.key,p_file_id:HOTEL_WORK_PLAN_SYNC.FILE_ID},payload||{})),
  muteHttpExceptions:true});
 if(resp.getResponseCode()!==200)throw Error(method+' '+resp.getResponseCode()+': '+resp.getContentText().slice(0,350));
 const data=JSON.parse(resp.getContentText());
 if(!data||data.ok!==true)throw Error(method+' invalid response');
 return data;
}
function hpEscape_(s){return String(s==null?'':s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'')
 .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function hpUnescape_(s){return String(s||'').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')}
function hpUnzip_(blob){
 return Utilities.unzip(Utilities.newBlob(blob.getBytes(),'application/zip','hotel-work-plan.zip'));
}
function hpParts_(blobs){const map={};blobs.forEach(b=>map[b.getName()]=b);return map}
function hpShared_(map){
 const item=map['xl/sharedStrings.xml'];if(!item)throw Error('Excel sharedStrings.xml missing');
 return (item.getDataAsString().match(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g)||[]).map(si=>
  (si.match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g)||[]).map(t=>hpUnescape_(t.replace(/^<t[^>]*>/,'').replace(/<\/t>$/,''))).join(''));
}
function hpCellPattern_(address){
 if(!/^[A-Z]{1,3}[1-9]\d*$/.test(address))throw Error('Invalid cell address '+address);
 return new RegExp('<c\\b(?=[^>]*\\br="'+address+'"(?=[\\s/>]))[^>]*?(?:\\/\\s*>|(?<!\\/)>(?:[\\s\\S]*?)<\\/c>)');
}
function hpRaw_(xml,address,shared){
 const m=xml.match(hpCellPattern_(address));if(!m)return '';
 const cell=m[0],type=(cell.match(/\bt="([^"]+)"/)||[])[1]||'';
 if(/<f(?:\s|>)/.test(cell))throw Error('Formula detected in editable cell '+address);
 if(type==='inlineStr')return (cell.match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g)||[]).map(part=>hpUnescape_(part.replace(/^<t[^>]*>/,'').replace(/<\/t>$/,''))).join('');
 const value=(cell.match(/<v>([\s\S]*?)<\/v>/)||[])[1]||'';
 return type==='s'?(shared[Number(value)]||''):value;
}
function hpIsoDate_(value){
 const s=String(value==null?'':value).trim();if(!s)return '';
 let x=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 let iso;
 if(x)iso=s;
 else {x=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(x){let year=Number(x[3]);if(year>2400)year-=543;iso=year+'-'+x[2].padStart(2,'0')+'-'+x[1].padStart(2,'0')}
  else if(/^\d+(?:\.\d+)?$/.test(s)){
   const serial=Number(s);if(serial<1||serial>120000)throw Error('Excel date serial out of range: '+s);
   iso=new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86400000).toISOString().slice(0,10);
  }else throw Error('Date must be DD/MM/YYYY or YYYY-MM-DD: '+s);
 }
 const date=new Date(iso+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==iso)throw Error('Invalid Excel date '+s);
 return iso;
}
function hpDateText_(iso){return iso?String(iso).slice(8,10)+'/'+String(iso).slice(5,7)+'/'+String(iso).slice(0,4):''}
function hpStatus_(value){
 const str=String(value||'').trim();if(!str)return 'pending';
 const entry=Object.keys(HOTEL_WORK_PLAN_SYNC.STATUS).find(k=>k===str||HOTEL_WORK_PLAN_SYNC.STATUS[k]===str);
 if(!entry)throw Error('Invalid Work Plan status '+str);
 return entry;
}
function hpCell_(address,value){
 return '<c r="'+address+'" t="inlineStr"><is><t xml:space="preserve">'+hpEscape_(value)+'</t></is></c>';
}
function hpPut_(xml,address,value){
 const row=Number((address.match(/\d+/)||[])[0]);
 const rowMatch=xml.match(new RegExp('<row\\b[^>]*\\br="'+row+'"(?=[\\s>])[^>]*>[\\s\\S]*?<\\/row>'));
 if(!rowMatch)throw Error('Target Excel row absent: '+row);
 const c=rowMatch[0].match(hpCellPattern_(address));
 if(!c)throw Error('Target Excel cell absent: '+address);
 if(/<f(?:\s|>)/.test(c[0]))throw Error('Refusing to replace formula '+address);
 const style=(c[0].match(/\bs="(\d+)"/)||[])[1];
 const newCell='<c r="'+address+'"'+(style?' s="'+style+'"':'')+' t="inlineStr"><is><t xml:space="preserve">'+hpEscape_(value)+'</t></is></c>';
 return xml.replace(rowMatch[0],rowMatch[0].replace(c[0],newCell));
}
function hpBuildSheet_(snapshot){
 const byDay={};snapshot.days.forEach(d=>byDay[d.day_no]=d);
 if(snapshot.days.length!==9||snapshot.rooms.length!==267)throw Error('Expected exactly 9 days and 267 rooms');
 const rows=[];
 const heads=['Seq.','Room (Hotel)','Day','Plan Date (เฉพาะห้อง)','Actual Date','Work Status','Note','Last Editor','Updated At','Revision','Day','Plan Date (ทั้ง Day)','Note (ทั้ง Day)'];
 rows.push('<row r="1">'+heads.map((s,i)=>hpCell_(String.fromCharCode(65+i)+'1',s)).join('')+'</row>');
 snapshot.rooms.forEach((r,i)=>{
  if(r.seq_no!==i+1||r.source_row!==i+5)throw Error('Database source identity invalid '+i);
  const n=i+2;const day=byDay[i+1];
  const values=[r.seq_no,r.source_room,r.day_no,hpDateText_(r.planned_date_override),hpDateText_(r.actual_date),
   HOTEL_WORK_PLAN_SYNC.STATUS[r.work_status],r.note||'',r.updated_by_name||'',
   r.updated_at?String(r.updated_at).slice(0,19):'',r.revision,
   day?day.day_no:'',day?hpDateText_(day.planned_date):'',day?(day.note||''):''];
  rows.push('<row r="'+n+'">'+values.map((v,i)=>hpCell_(String.fromCharCode(65+i)+n,v)).join('')+'</row>');
 });
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
 '<dimension ref="A1:M268"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+
 '<sheetFormatPr defaultRowHeight="17"/><cols>'+
 ['9','18','9','22','18','23','44','20','22','10','9','22','44'].map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+
 '</cols><sheetData>'+rows.join('')+'</sheetData><pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.3" footer="0.3"/></worksheet>';
}
function hpCheckCanonical_(map,snapshot,shared){
 const source=map[HOTEL_WORK_PLAN_SYNC.SOURCE];if(!source)throw Error('Original source sheet4 missing');
 const xml=source.getDataAsString();
 snapshot.rooms.forEach(r=>{
  const row=r.source_row,seq=hpRaw_(xml,'A'+row,shared),room=hpRaw_(xml,'D'+row,shared);
  if(Number(seq)!==r.seq_no||room!==r.source_room)throw Error('Original source identity changed at Seq '+r.seq_no);
 });
}
/**
 * Resolve the Work Plan worksheet by its real workbook relationship.
 * Editing an XLSX through Google Sheets can reassign r:id, e.g.
 * rIdHotelWorkPlan20261014 -> rId7, with sheet7.xml unchanged.
 * Never treat the relationship ID as a permanent source identifier.
 */
function hpCheckExistingSheet_(parts){
 const workbook=parts['xl/workbook.xml']?.getDataAsString();
 const rels=parts['xl/_rels/workbook.xml.rels']?.getDataAsString();
 const types=parts['[Content_Types].xml']?.getDataAsString();
 if(!workbook||!rels||!types||!parts[HOTEL_WORK_PLAN_SYNC.TARGET]){
  throw Error('Work Plan XLSX worksheet or metadata missing');
 }
 const sheets=(workbook.match(/<sheet\\b[^>]*\\/>/g)||[])
  .filter(tag=>tag.includes('name="'+HOTEL_WORK_PLAN_SYNC.TAB+'"'));
 if(sheets.length!==1)throw Error('Work Plan sheet name not unique or missing');
 const relationId=(sheets[0].match(/\\br:id="([^"]+)"/)||[])[1];
 if(!relationId||!/^[A-Za-z0-9_.-]+$/.test(relationId))throw Error('Work Plan relationship ID invalid');
 const relations=(rels.match(/<Relationship\\b[^>]*\\/>/g)||[])
  .filter(tag=>tag.includes('Id="'+relationId+'"'));
 if(relations.length!==1)throw Error('Work Plan relationship missing or ambiguous');
 const target=(relations[0].match(/\\bTarget="([^"]+)"/)||[])[1];
 const type=(relations[0].match(/\\bType="([^"]+)"/)||[])[1];
 if(target!=='worksheets/sheet7.xml'||type!=='http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet'){
  throw Error('Work Plan relationship points to an unexpected worksheet');
 }
 if(!types.includes('PartName="/xl/worksheets/sheet7.xml"')){
  throw Error('Work Plan XLSX content type missing');
 }
 return {relationId,target};
}
function hpEnsureNewSheet_(map,snapshot){
 const file='xl/workbook.xml',rel='xl/_rels/workbook.xml.rels',types='[Content_Types].xml';
 let w=map[file].getDataAsString(),r=map[rel].getDataAsString(),t=map[types].getDataAsString();
 if(w.includes('name="'+HOTEL_WORK_PLAN_SYNC.TAB+'"'))throw Error('Sheet exists but target sheet7.xml missing');
 if(map[HOTEL_WORK_PLAN_SYNC.TARGET]||r.includes('Id="'+HOTEL_WORK_PLAN_SYNC.REL_ID+'"'))throw Error('Work Plan sheet ID already occupied');
 if(!w.includes('</sheets>')||!r.includes('</Relationships>')||!t.includes('</Types>'))throw Error('Unexpected XLSX workbook structure');
 const ids=[...w.matchAll(/\bsheetId="(\d+)"/g)].map(m=>Number(m[1]));
 const nextId=Math.max.apply(null,ids)+1;
 w=w.replace('</sheets>','<sheet name="'+HOTEL_WORK_PLAN_SYNC.TAB+'" sheetId="'+nextId+'" r:id="'+HOTEL_WORK_PLAN_SYNC.REL_ID+'"/></sheets>');
 r=r.replace('</Relationships>','<Relationship Id="'+HOTEL_WORK_PLAN_SYNC.REL_ID+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet7.xml"/></Relationships>');
 t=t.replace('</Types>','<Override PartName="/xl/worksheets/sheet7.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
 map[file]=Utilities.newBlob(w,'text/xml',file);map[rel]=Utilities.newBlob(r,'text/xml',rel);
 map[types]=Utilities.newBlob(t,'text/xml',types);
 // Keep Excel extended-properties sheet counts and named-range titles consistent.
 const appPath='docProps/app.xml';
 if(!map[appPath])throw Error('Missing XLSX extended-properties metadata');
 let app=map[appPath].getDataAsString();
 if(!app.includes('<vt:i4>6</vt:i4>')||!app.includes('<TitlesOfParts><vt:vector size="9"')||
    !app.includes('<vt:lpstr>ครบทุกห้อง_263</vt:lpstr>'))throw Error('Unexpected Excel sheet-title metadata; refuse bootstrap');
 app=app.replace('<vt:i4>6</vt:i4>','<vt:i4>7</vt:i4>')
    .replace('<TitlesOfParts><vt:vector size="9"','<TitlesOfParts><vt:vector size="10"')
    .replace('<vt:lpstr>ครบทุกห้อง_263</vt:lpstr>',
      '<vt:lpstr>ครบทุกห้อง_263</vt:lpstr><vt:lpstr>'+HOTEL_WORK_PLAN_SYNC.TAB+'</vt:lpstr>');
 map[appPath]=Utilities.newBlob(app,'text/xml',appPath);
 map[HOTEL_WORK_PLAN_SYNC.TARGET]=Utilities.newBlob(hpBuildSheet_(snapshot),'text/xml',HOTEL_WORK_PLAN_SYNC.TARGET);
}
function hpReadSheet_(xml,shared,snapshot){
 const days=[],rooms=[];const statuses=HOTEL_WORK_PLAN_SYNC.STATUS;
 snapshot.days.forEach((d,i)=>{
  const row=i+2,n=Number(hpRaw_(xml,'K'+row,shared));
  if(n!==i+1)throw Error('Work Plan day identity changed K'+row);
  days.push({id:n,kind:'day',date:hpIsoDate_(hpRaw_(xml,'L'+row,shared)),note:hpRaw_(xml,'M'+row,shared).trim()});
 });
 snapshot.rooms.forEach((r,i)=>{
  const n=i+2,seq=Number(hpRaw_(xml,'A'+n,shared)),sourceRoom=hpRaw_(xml,'B'+n,shared);
  if(seq!==r.seq_no||sourceRoom!==r.source_room)throw Error('Work Plan Seq/Room identity mismatch at row '+n);
  const day=Number(hpRaw_(xml,'C'+n,shared));
  if(!Number.isInteger(day)||day<1||day>9)throw Error('Invalid Day row '+n);
  rooms.push({kind:'room',id:seq,day,override:hpIsoDate_(hpRaw_(xml,'D'+n,shared)),
   actual:hpIsoDate_(hpRaw_(xml,'E'+n,shared)),status:hpStatus_(hpRaw_(xml,'F'+n,shared)),
   note:hpRaw_(xml,'G'+n,shared).trim()});
 });
 return {days,rooms};
}
function hpNormalize_(v){return String(v==null?'':v).trim()}
function hpDayValue_(d){return [hpNormalize_(d.date),hpNormalize_(d.note)].join('|')}
function hpRoomValue_(r){return [hpNormalize_(r.day),hpNormalize_(r.override),hpNormalize_(r.actual),hpNormalize_(r.status),hpNormalize_(r.note)].join('|')}
function hpReconcile_(snapshot,excel){
 const imports=[],conflicts=[],issues=[];
 snapshot.days.forEach((d,i)=>{
  const e=excel.days[i];
  const baseline=hpDayValue_({date:d.source_synced_date,note:d.source_synced_note});
  const current=hpDayValue_({date:d.planned_date,note:d.note});
  const actual=hpDayValue_(e);
  if(actual!==baseline){
   if(current===baseline&&d.sync_state==='synced')imports.push({...e,revision:d.revision});
   else if(actual!==current){conflicts.push('Day '+d.day_no);issues.push({kind:'day',id:d.day_no,revision:d.revision})}
  }
 });
 snapshot.rooms.forEach((r,i)=>{
  const e=excel.rooms[i];
  const baseline=hpRoomValue_({day:r.source_synced_day,override:r.source_synced_override,
   actual:r.source_synced_actual,status:r.source_synced_status,note:r.source_synced_note});
  const current=hpRoomValue_({day:r.day_no,override:r.planned_date_override,
   actual:r.actual_date,status:r.work_status,note:r.note});
  const actual=hpRoomValue_(e);
  if(actual!==baseline){
   if(current===baseline&&r.sync_state==='synced')imports.push({...e,revision:r.revision});
   else if(actual!==current){conflicts.push('Seq '+r.seq_no+' ('+r.room_no+')');issues.push({kind:'room',id:r.seq_no,revision:r.revision})}
  }
 });
 return {imports,conflicts,issues};
}
function hpDesired_(snapshot){
 return {
 days:snapshot.days.map(d=>({kind:'day',id:d.day_no,date:d.planned_date||'',note:d.note||'',revision:d.revision})),
 rooms:snapshot.rooms.map(r=>({kind:'room',id:r.seq_no,day:r.day_no,override:r.planned_date_override||'',
  actual:r.actual_date||'',status:r.work_status,note:r.note||'',revision:r.revision,
  updated_by_name:r.updated_by_name||'',updated_at:r.updated_at||''}))
 };
}
function hpUpdateXml_(xml,shared,desired){
 let changed=0;
 function update(cell,value){
  const current=hpRaw_(xml,cell,shared),target=String(value==null?'':value);
  let same=current===target;
  if(!same&&/^[DEL]\d+$/.test(cell))same=hpIsoDate_(current)===hpIsoDate_(target);
  if(!same){xml=hpPut_(xml,cell,target);changed++}
 }
 desired.days.forEach((d,i)=>{const row=i+2;update('L'+row,hpDateText_(d.date));update('M'+row,d.note)});
 desired.rooms.forEach((r,i)=>{
  const n=i+2;
  update('C'+n,String(r.day));update('D'+n,hpDateText_(r.override));update('E'+n,hpDateText_(r.actual));
  update('F'+n,HOTEL_WORK_PLAN_SYNC.STATUS[r.status]);update('G'+n,r.note);
  update('H'+n,r.updated_by_name);update('I'+n,r.updated_at?String(r.updated_at).slice(0,19):'');update('J'+n,String(r.revision));
 });
 return {xml,changed};
}
function hpCheckReadback_(map,desired,identities){
 const ss=hpShared_(map),xml=map[HOTEL_WORK_PLAN_SYNC.TARGET].getDataAsString();
 const records=hpReadSheet_(xml,ss,{
  days:desired.days.map(d=>({day_no:d.id})),
  rooms:desired.rooms.map((r,i)=>({seq_no:r.id,source_room:identities.rooms[i].source_room}))
 });
 desired.days.forEach((d,i)=>{
  if(hpDayValue_(records.days[i])!==hpDayValue_(d))throw Error('Excel Day readback mismatch: '+d.id);
 });
 desired.rooms.forEach((r,i)=>{
  if(hpRoomValue_(records.rooms[i])!==hpRoomValue_(r))throw Error('Excel Room readback mismatch: '+r.id);
 });
}
function hpDigest_(blob){
 return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,blob.getBytes()).map(n=>(n+256)%256).join(',');
}
function hpUnchangedOthers_(before,after){
 for(const path in before){
  if(path===HOTEL_WORK_PLAN_SYNC.TARGET||path==='xl/workbook.xml'||
    path==='xl/_rels/workbook.xml.rels'||path==='[Content_Types].xml'||path==='docProps/app.xml')continue;
  if(!after[path]||hpDigest_(before[path])!==hpDigest_(after[path]))throw Error('Non-target Excel part changed: '+path);
 }
}
function hpBackup_(file){
 const itr=file.getParents();if(!itr.hasNext())throw Error('No Excel folder for Backup');
 const folder=itr.next(),folders=folder.getFoldersByName('Backup');
 const backupFolder=folders.hasNext()?folders.next():folder.createFolder('Backup');
 const label=Utilities.formatDate(new Date(),HOTEL_WORK_PLAN_SYNC.TZ,'yyyyMMdd_HHmmss');
 const backup=file.makeCopy('BACKUP_WorkPlan_'+label+'_'+file.getName(),backupFolder);
 if(!backup.getId())throw Error('Cannot verify backup');
 return backup.getId();
}
function hpWriteFile_(file,originalParts,parts,modifiedAt,desired,identities){
 if(file.getLastUpdated().getTime()!==modifiedAt)throw Error('Excel changed during preflight; retry');
 hpUnchangedOthers_(originalParts,parts);
 const backupId=hpBackup_(file);
 const all=Object.keys(parts).map(name=>parts[name]);
 const archive=Utilities.zip(all,file.getName());
 const rsp=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/'+HOTEL_WORK_PLAN_SYNC.FILE_ID+'?uploadType=media',{
  method:'patch',contentType:HOTEL_WORK_PLAN_SYNC.MIME,headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
  payload:archive.getBytes(),muteHttpExceptions:true});
 if(rsp.getResponseCode()<200||rsp.getResponseCode()>=300)throw Error('Drive upload failed '+rsp.getResponseCode()+': '+rsp.getContentText().slice(0,250));
 const newFile=DriveApp.getFileById(HOTEL_WORK_PLAN_SYNC.FILE_ID);
 const readback=hpParts_(hpUnzip_(newFile.getBlob()));
 hpUnchangedOthers_(originalParts,readback);
 hpCheckReadback_(readback,desired,identities);
 return backupId;
}
function hpRun_(dryRun){
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(5000))return {ok:false,error:'existing_work_plan_sync_in_progress'};
 try{
  const c=hpConfig_();
  const file=DriveApp.getFileById(HOTEL_WORK_PLAN_SYNC.FILE_ID);
  if(file.getName()!==HOTEL_WORK_PLAN_SYNC.FILE_NAME||file.getMimeType()!==HOTEL_WORK_PLAN_SYNC.MIME)
   throw Error('PINNED_WORKBOOK_ID_NAME_MIME_MISMATCH');
  const modified=file.getLastUpdated().getTime();
  const original=hpParts_(hpUnzip_(file.getBlob()));
  const parts=Object.assign({},original);
  const snapshot=hpRPC_(c,'hotel_work_plan_sync_snapshot');
  if(snapshot.days.length!==9||snapshot.rooms.length!==267)throw Error('Incomplete Work Plan DB snapshot');
  const shared=hpShared_(parts);
  hpCheckCanonical_(parts,snapshot,shared);
  const hadSheet=Boolean(parts[HOTEL_WORK_PLAN_SYNC.TARGET]);
  if(!hadSheet){
   if(dryRun)return {ok:true,dryRun:true,bootstrapRequired:true,sourceRows:267};
   hpEnsureNewSheet_(parts,snapshot);
   const desired=hpDesired_(snapshot);
   const backupId=hpWriteFile_(file,original,parts,modified,desired,snapshot);
   const ack=hpRPC_(c,'hotel_work_plan_sync_ack',{p_days:desired.days,p_rooms:desired.rooms});
   return {ok:ack.ok,bootstrapped:true,backupId,verified:ack.verified_rooms};
  }
  // Google Sheets rewrites XLSX relationship IDs during normal Excel edits.
  // Verify the *resolved sheet relationship*, not the original bootstrap r:id.
  hpCheckExistingSheet_(parts);
  const read=hpReadSheet_(parts[HOTEL_WORK_PLAN_SYNC.TARGET].getDataAsString(),shared,snapshot);
  const plan=hpReconcile_(snapshot,read);
  if(plan.conflicts.length){
   if(!dryRun)hpRPC_(c,'hotel_work_plan_sync_conflict',{p_issues:plan.issues});
   const result={ok:false,conflict:true,rooms:plan.conflicts,importsBlocked:plan.imports.length};
   console.error(JSON.stringify(result));return result;
  }
  if(file.getLastUpdated().getTime()!==modified)throw Error('Source file changed during read');
  if(dryRun)return {ok:true,dryRun:true,imports:plan.imports.length,bootstrapRequired:false};
  if(plan.imports.length){
   hpRPC_(c,'hotel_work_plan_sync_import',{p_changes:plan.imports});
   // Recheck the DB after import: all new revisions must be read before any Excel write.
  }
  const fresh=plan.imports.length?hpRPC_(c,'hotel_work_plan_sync_snapshot'):snapshot;
  if(fresh.rooms.length!==267||fresh.days.length!==9)throw Error('Incomplete refreshed snapshot');
  const desired=hpDesired_(fresh);
  const changed=hpUpdateXml_(parts[HOTEL_WORK_PLAN_SYNC.TARGET].getDataAsString(),shared,desired);
  let backupId=null;
  if(changed.changed){
   parts[HOTEL_WORK_PLAN_SYNC.TARGET]=Utilities.newBlob(changed.xml,'text/xml',HOTEL_WORK_PLAN_SYNC.TARGET);
   backupId=hpWriteFile_(file,original,parts,modified,desired,fresh);
  }else{
   // A no-write ACK must still be based on a fresh Drive read, not stale memory.
   if(file.getLastUpdated().getTime()!==modified)throw Error('Excel changed before no-write readback');
   const latest=hpParts_(hpUnzip_(DriveApp.getFileById(HOTEL_WORK_PLAN_SYNC.FILE_ID).getBlob()));
   hpUnchangedOthers_(original,latest);
   hpCheckReadback_(latest,desired,fresh);
  }
  const ack=hpRPC_(c,'hotel_work_plan_sync_ack',{p_days:desired.days,p_rooms:desired.rooms});
  const result={ok:ack.ok,imported:plan.imports.length,writtenCells:changed.changed,verified:ack.verified_rooms,backupId};
  console.log(JSON.stringify(result));return result;
 }catch(e){const result={ok:false,error:String(e)};console.error(JSON.stringify(result));return result}
 finally{lock.releaseLock()}
}
function hotelWorkPlanDryRun(){return hpRun_(true)}
function hotelWorkPlanSyncNow(){return hpRun_(false)}
function hotelWorkPlanInstallTrigger(){
 const handler='hotelWorkPlanSyncNow';
 ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===handler).forEach(t=>ScriptApp.deleteTrigger(t));
 ScriptApp.newTrigger(handler).timeBased().everyMinutes(15).create();
 const count=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===handler).length;
 if(count!==1)throw Error('Work Plan trigger count wrong');
 return {ok:true,handler,count,intervalMinutes:15,fileId:HOTEL_WORK_PLAN_SYNC.FILE_ID};
}
