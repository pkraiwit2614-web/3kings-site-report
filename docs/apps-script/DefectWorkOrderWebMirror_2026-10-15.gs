/**
 * Above Condo | Work Order status mirror from the approved Defect Master XLSX.
 * Read-only toward Defect Master, Web App, Supabase, Hotel OOO/OOS and Work Plan.
 * Writes ONLY new AL:AQ cells in Work Order's `รายการ Defect` sheet and
 * new L:O cells in its `ใบแจกงานคงค้าง 151026` sheet.
 * Never rewrites item-level Work Status (X), manual follow-up, contractor/PIC,
 * dates, evidence, existing formulas, or the printable original columns.
 *
 * INSTALL in the SAME Apps Script project as DefectExcelWriteback_2026-10-13.
 * Execute defectWorkOrderDryRun20261015(); then defectWorkOrderInstall20261015().
 * Existing script scopes must include Google Drive and external requests.
 */
const DEFECT_WORK_ORDER_MIRROR_20261015 = Object.freeze({
  SOURCE: {id:'1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',
    name:'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
    xml:'xl/worksheets/sheet4.xml', room:'C', status:'F', group:'I', action:'L'},
  TARGET: {id:'18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',
    name:'Defect_Work_Order_Updated_2026-10-15.xlsx',
    master:'xl/worksheets/sheet1.xml', dispatch:'xl/worksheets/sheet8.xml'},
  MIME:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  EXPECTED_ROOM_COUNT:263,
  EXPECTED_MASTER_ITEMS:67,
  EXPECTED_DISPATCH_ITEMS:54,
  MAX_BYTES:12*1024*1024
});

function defectWorkOrderDryRun20261015() { return woMirrorRun20261015_(true); }
function defectWorkOrderScheduled20261015() { return woMirrorRun20261015_(false); }
function defectWorkOrderInstall20261015() {
  // Install only this feature's trigger; never alter existing Defect/Hotel triggers.
  defectWorkOrderDryRun20261015();
  const fn='defectWorkOrderScheduled20261015';
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===fn)
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(fn).timeBased().everyMinutes(15).create();
  return {installed:true,handler:fn,cadenceMinutes:15};
}
function woMirrorRun20261015_(dryRun) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1500)) return {ok:false,reason:'another-sync-running'};
  try {
    const conf=DEFECT_WORK_ORDER_MIRROR_20261015;
    const sourceFile=DriveApp.getFileById(conf.SOURCE.id);
    const targetFile=DriveApp.getFileById(conf.TARGET.id);
    woMirrorAssertFile_(sourceFile,conf.SOURCE,conf);
    woMirrorAssertFile_(targetFile,conf.TARGET,conf);
    const sourceStamp=sourceFile.getLastUpdated().getTime();
    const targetStamp=targetFile.getLastUpdated().getTime();
    const source=woMirrorOpen_(sourceFile.getBlob(),conf);
    const target=woMirrorOpen_(targetFile.getBlob(),conf);
    woMirrorRequireSheets_(source,['ข้อมูลจำแนก'],[conf.SOURCE.xml]);
    woMirrorRequireSheets_(target,['รายการ Defect','ใบแจกงานคงค้าง 151026'],
      [conf.TARGET.master,conf.TARGET.dispatch]);
    const rooms=woMirrorCanonicalRooms_(source.files[conf.SOURCE.xml].getDataAsString(),source.strings,conf);
    const sourceDate=new Date(sourceStamp).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'});
    const work=woMirrorPatch_(target.files[conf.TARGET.master].getDataAsString(),target.strings,rooms,
      {idCol:'B',roomCol:'D',combineCol:'C',firstRow:6,cols:['AL','AM','AN','AO','AP','AQ'],
        headings:['สถานะห้อง (Web ผ่าน Defect Master)','กลุ่มสถานะ Defect','ต้องทำต่อจาก Web','ตรวจสอบก่อนแจกงาน','ข้อขัดแย้ง / Combine','ซิงก์ต้นทางล่าสุด'],
        fileStamp:sourceDate},conf.EXPECTED_MASTER_ITEMS);
    const dispatch=woMirrorPatch_(target.files[conf.TARGET.dispatch].getDataAsString(),target.strings,rooms,
      {idCol:'C',roomCol:'D',firstRow:6,cols:['L','M','N','O'],
        headings:['สถานะห้อง (Web ผ่าน Defect Master)','ผลตรวจแจกงาน','ซิงก์ต้นทางล่าสุด','ข้อขัดแย้ง / Combine'],
        fileStamp:sourceDate,dispatch:true},conf.EXPECTED_DISPATCH_ITEMS);
    // Expand only used-range metadata; all other XLSX components stay untouched.
    work.xml=woMirrorDimension_(work.xml,'A1:AK72','A1:AQ72');
    dispatch.xml=woMirrorDimension_(dispatch.xml,'A1:K61','A1:O61');
    const conflicts=work.conflicts.concat(dispatch.conflicts);
    const result={ok:conflicts.length===0,dryRun:dryRun,webSource:'verified Master Excel writeback',
      sourceModifiedAt:new Date(sourceStamp).toISOString(),workItems:work.count,
      dispatchItems:dispatch.count,changedCells:work.writes+dispatch.writes,
      conflicts:conflicts.slice(0,40),wroteFile:false};
    // A changed work-order inventory is a safety gate, not a permission to delete rows.
    if(conflicts.length || dryRun || result.changedCells===0){
      console.log(JSON.stringify(result));return result;
    }
    // Preserve original XLSX members by changing only the two identified sheet XMLs.
    target.files[conf.TARGET.master]=Utilities.newBlob(work.xml,'text/xml',conf.TARGET.master);
    target.files[conf.TARGET.dispatch]=Utilities.newBlob(dispatch.xml,'text/xml',conf.TARGET.dispatch);
    if(targetFile.getLastUpdated().getTime()!==targetStamp ||
       sourceFile.getLastUpdated().getTime()!==sourceStamp)
      throw Error('Drive file changed during sync; no upload performed');
    woMirrorOneBackup_(targetFile);
    const zipped=Utilities.zip(target.entries.map(b=>target.files[b.getName()]),conf.TARGET.name);
    const http=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/'+conf.TARGET.id+'?uploadType=media',{
      method:'patch',contentType:conf.MIME,headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
      payload:zipped.getBytes(),muteHttpExceptions:true
    });
    if(http.getResponseCode()<200||http.getResponseCode()>=300)
      throw Error('Drive Work Order upload failed HTTP '+http.getResponseCode()+': '+http.getContentText().slice(0,150));
    const readback=woMirrorOpen_(DriveApp.getFileById(conf.TARGET.id).getBlob(),conf);
    if(readback.files[conf.TARGET.master].getDataAsString()!==work.xml ||
       readback.files[conf.TARGET.dispatch].getDataAsString()!==dispatch.xml)
      throw Error('Work Order XLSX readback mismatch');
    result.wroteFile=true;
    console.log(JSON.stringify(result));return result;
  } finally {lock.releaseLock();}
}
function woMirrorAssertFile_(file,meta,config){
  if(file.getId()!==meta.id||file.getName()!==meta.name||file.getMimeType()!==config.MIME)
    throw Error('Pinned filename, type or ID changed. Stop without writing: '+meta.id);
  if(file.getSize()>config.MAX_BYTES)throw Error('File too large for safe Apps Script XLSX sync');
}
function woMirrorOpen_(blob,config){
  // Google Apps Script Utilities.unzip requires a ZIP-typed Blob even for XLSX files.
  // Retype a separate in-memory Blob; do not change the original Drive file MIME.
  const zipBlob=Utilities.newBlob(blob.getBytes(),'application/zip',blob.getName());
  const entries=Utilities.unzip(zipBlob),files={};
  entries.forEach(b=>{if(files[b.getName()])throw Error('Duplicate ZIP member');files[b.getName()]=b;});
  if(!files['xl/workbook.xml']||!files['xl/sharedStrings.xml'])throw Error('Missing workbook metadata');
  return {entries:entries,files:files,strings:woMirrorStrings_(files['xl/sharedStrings.xml'].getDataAsString())};
}
function woMirrorRequireSheets_(o,names,paths){
  const xml=o.files['xl/workbook.xml'].getDataAsString();
  names.forEach(n=>{if(!xml.includes('name="'+n+'"'))throw Error('Sheet renamed: '+n);});
  paths.forEach(p=>{if(!o.files[p])throw Error('Missing pinned worksheet: '+p);});
}
function woMirrorStrings_(xml){
  return (xml.match(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g)||[]).map(si=>
    (si.match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g)||[]).map(t=>
      woMirrorUnescape_(t.replace(/^<t[^>]*>/,'').replace(/<\/t>$/,''))).join(''));
}
function woMirrorRows_(xml){return xml.match(/<row\b[^>]*\br="\d+"[^>]*>[\s\S]*?<\/row>/g)||[];}
function woMirrorRead_(row,col,num,strings){
  const m=row.match(new RegExp('<c\\b[^>]*\\br="'+col+num+'"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)'));
  if(!m)return '';
  const cell=m[0],typ=(cell.match(/\bt="([^"]+)"/)||[])[1],v=(cell.match(/<v>([\s\S]*?)<\/v>/)||[])[1]||'';
  if(typ==='s')return strings[+v]||'';
  if(typ==='inlineStr')return woMirrorUnescape_((cell.match(/<t[^>]*>([\s\S]*?)<\/t>/)||[])[1]||'');
  return woMirrorUnescape_(v);
}
function woMirrorCanonicalRooms_(xml,strings,config){
  const map={},seen=new Set();let a=0,b=0;
  woMirrorRows_(xml).forEach(row=>{
    const nr=+(row.match(/<row\b[^>]*\br="(\d+)"/)||[])[1];
    if(nr<2||nr>264)return;
    const id=woMirrorRead_(row,'C',nr,strings);
    if(!/^[AB]\d{3}$/.test(id)||seen.has(id))throw Error('Defect Master inventory mismatch at '+nr);
    seen.add(id);if(id[0]==='A')a++;else b++;
    map[id]={status:woMirrorRead_(row,'F',nr,strings),group:woMirrorRead_(row,'I',nr,strings),
      next:woMirrorRead_(row,'L',nr,strings)};
  });
  if(seen.size!==config.EXPECTED_ROOM_COUNT||a!==162||b!==101)
    throw Error('Defect Master inventory changed: '+seen.size+' rooms, A '+a+', B '+b);
  return map;
}
function woMirrorPatch_(xml,strings,rooms,settings,expected){
  const rows=woMirrorRows_(xml),ids=new Set(),conflicts=[];
  let writes=0,count=0,next=xml;
  // Validate ALL work identifiers and room references BEFORE touching a single cell.
  const updates=[];
  rows.forEach(row=>{
    const nr=+(row.match(/<row\b[^>]*\br="(\d+)"/)||[])[1];
    if(nr<settings.firstRow)return;
    const workId=woMirrorRead_(row,settings.idCol,nr,strings);
    if(!workId)return;
    if(!/^DF-[AB]/.test(workId)||ids.has(workId)){
      conflicts.push('Work ID invalid or duplicate at row '+nr);return;
    }
    ids.add(workId);count++;
    const roomLabel=woMirrorRead_(row,settings.roomCol,nr,strings);
    const combined=settings.combineCol?woMirrorRead_(row,settings.combineCol,nr,strings):roomLabel;
    const names=[...new Set((combined.match(/[AB]\d{3}/g)||[]))];
    if(!names.length)names.push(...new Set(roomLabel.match(/[AB]\d{3}/g)||[]));
    const reference=(roomLabel.match(/[AB]\d{3}/)||[])[0];
    if(!reference||!names.includes(reference)){
      conflicts.push(workId+': Work Order room '+roomLabel+' does not match Combine '+combined);return;
    }
    const members=names.map(id=>rooms[id]).filter(Boolean);
    if(!names.length||members.length!==names.length){
      conflicts.push(workId+': unknown room/combine '+combined);return;
    }
    const base=members[0],consistent=members.every(x=>x.group===base.group&&x.status===base.status);
    const note=consistent?'':('Combine status conflict: '+names.join('+'));
    if(note) conflicts.push(workId+': '+note);
    // Room-level status is NOT evidence that each Work ID was individually completed.
    const isOpen=base.group==='Hotel - Incomplete';
    const dispatchState=note?'ต้องตรวจ Combine ก่อน':isOpen?'ตรวจรายการรายจุดก่อนแจกงาน':'ชะลอแจก • ตรวจรายการรายจุด/หลักฐาน';
    const values=settings.dispatch?
      [base.status,dispatchState,settings.fileStamp,note]:
      [base.status,base.group,base.next,dispatchState,note,settings.fileStamp];
    updates.push({nr:nr,values:values});
  });
  if(count!==expected) conflicts.push('Work Order item count changed from '+expected+' to '+count);
  if(conflicts.length)return {xml:xml,writes:0,count:count,conflicts:conflicts};
  settings.cols.forEach((c,i)=>{
    const addr=c+(settings.firstRow-1);
    if(woMirrorExisting_(next,addr,strings)!==settings.headings[i]){
      next=woMirrorCell_(next,addr,settings.headings[i]);writes++;
    }
  });
  updates.forEach(u=>u.values.forEach((v,i)=>{
    const addr=settings.cols[i]+u.nr;
    if(woMirrorExisting_(next,addr,strings)!==String(v||'')){
      next=woMirrorCell_(next,addr,v||'');writes++;
    }
  }));
  return {xml:next,writes:writes,count:count,conflicts:conflicts};
}
function woMirrorExisting_(xml,addr,strings){
  const rowNo=+(addr.match(/\d+/)||[])[0];
  const match=woMirrorRows_(xml).find(row=>new RegExp('<row\\b[^>]*\\br="'+rowNo+'"').test(row));
  return match?woMirrorRead_(match,addr.replace(/\d+/g,''),rowNo,strings):'';
}
function woMirrorCell_(xml,addr,value){
  const nr=+(addr.match(/\d+/)||[])[0];
  const re=new RegExp('(<row\\b[^>]*\\br="'+nr+'"[^>]*>)([\\s\\S]*?)(<\\/row>)');
  const m=xml.match(re);if(!m)throw Error('Pinned work-order row absent: '+nr);
  const pattern=new RegExp('<c\\b[^>]*\\br="'+addr+'"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)');
  const previous=m[2].match(pattern);
  if(previous&&/<f(?:\s|>)/.test(previous[0]))throw Error('Refusing to overwrite manual formula '+addr);
  const style=previous?(previous[0].match(/\bs="(\d+)"/)||[])[1]:null;
  const node='<c r="'+addr+'"'+(style?' s="'+style+'"':'')+
    ' t="inlineStr"><is><t xml:space="preserve">'+woMirrorEscape_(String(value))+'</t></is></c>';
  return xml.replace(re,()=>m[1]+(previous?m[2].replace(pattern,node):m[2]+node)+m[3]);
}
function woMirrorDimension_(xml,oldDim,newDim){
  // Never replace a dimension unrelated to the pinned template; stale/incompatible
  // templates are rejected instead of overwritten.
  const match=xml.match(/<dimension\b[^>]*\bref="([^"]+)"[^>]*\/>/);
  if(!match||![oldDim,newDim].includes(match[1]))throw Error('Unexpected worksheet dimension: '+(match?match[1]:'missing'));
  return match[1]===newDim?xml:xml.replace(match[0],match[0].replace(oldDim,newDim));
}
function woMirrorEscape_(s){return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function woMirrorUnescape_(s){return s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');}
function woMirrorOneBackup_(file){
  const key='DEFECT_WORK_ORDER_MIRROR_BACKUP_'+file.getId(),p=PropertiesService.getScriptProperties();
  if(p.getProperty(key))return;
  const parents=file.getParents();if(!parents.hasNext())throw Error('No Work Order parent folder');
  const parent=parents.next();const folders=parent.getFoldersByName('Backup');
  const folder=folders.hasNext()?folders.next():parent.createFolder('Backup');
  const name='BACKUP_before_WorkOrderAutoSync_2026-10-15_'+file.getName();
  const old=folder.getFilesByName(name);const backup=old.hasNext()?old.next():file.makeCopy(name,folder);
  if(!backup||!backup.getId())throw Error('Backup failed');
  p.setProperty(key,backup.getId());
}