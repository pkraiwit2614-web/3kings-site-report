/**
 * Shift-only, quota-conscious sync schedule for EXISTING 3 Kings Apps Script.
 * INSTALL in the same Apps Script project as sync3Kings v1.1 and Defect SmartSync v1.3.
 * Thailand local time (Asia/Bangkok).
 *
 * Sun-Sat Photos: 08:00, 12:00, 17:00 (+/-15 min Apps Script scheduling tolerance).
 * Mon-Sat Schedule + Defect: once in each hour 08..18 inclusive (11 windows).
 * Mon-Sat Materials: 08, 11, 14, 17 (4 windows).
 *
 * Note: these are source-to-DB import jobs. The independent Web-to-Excel
 * Defect writeback queue is intentionally NOT touched here.
 * Existing source change gates, validations and identities are not modified.
 */
const SHIFT_SYNC_20261013 = Object.freeze({
  TZ:'Asia/Bangkok',
  OLD_HANDLERS:[
    'sync3Kings','smartSyncHourly','smartSyncDefects15m',
    'smartSyncDefectsV13_15m','smartSyncDailyFullPhotos',
    'syncShiftHourly20261013','syncShiftPhoto0800','syncShiftPhoto1200','syncShiftPhoto1700'
  ],
  PROPERTY_PREFIX:'SHIFT_SYNC_20261013_'
});
function shiftClock20261013_() {
  const now=new Date();
  const date=Utilities.formatDate(now,SHIFT_SYNC_20261013.TZ,'yyyy-MM-dd');
  const hour=Number(Utilities.formatDate(now,SHIFT_SYNC_20261013.TZ,'H'));
  const minute=Number(Utilities.formatDate(now,SHIFT_SYNC_20261013.TZ,'m'));
  const day=new Date(now.getTime()+7*3600000).getUTCDay(); // Thai local Sunday=0
  return {date:date,hour:hour,minute:minute,sunday:day===0};
}
function shiftOnce20261013_(name,slot,work) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(30000))return {status:'locked',name:name};
  const key=SHIFT_SYNC_20261013.PROPERTY_PREFIX+name+'_'+slot;
  try {
    const props=PropertiesService.getScriptProperties();
    if(props.getProperty(key)==='ok')return {status:'already-run',name:name};
    const outcome=work();
    if(outcome && (outcome.status==='error'||outcome.status==='partial-error'||outcome.status==='locked'))
      return {status:'error',name:name,result:outcome};
    props.setProperty(key,'ok');
    // Keys are date-scoped, but avoid keeping old daily markers forever.
    const old=props.getProperties();
    Object.keys(old).filter(k=>k.startsWith(SHIFT_SYNC_20261013.PROPERTY_PREFIX) &&
      k!==key && k.indexOf(slot.slice(0,10))<0).forEach(k=>props.deleteProperty(k));
    return {status:'success',name:name,result:outcome};
  }catch(err){console.error(name+': '+String(err));return {status:'error',name:name,error:String(err)}}
  finally{lock.releaseLock()}
}
function shiftProject20261013_(plot) {
  const ctx=buildContext_();
  const above=getUniqueChildFolderByName_(ctx.rootFolder,CFG.ABOVE_FOLDER_NAME);
  const villa=getUniqueChildFolderByName_(above,CFG.VILLA_FOLDER_NAME);
  const projects=loadProjectMap_(ctx);
  requireProjects_(projects,['AV-P'+plot]);
  return syncProgressPlot_(ctx,villa,projects,plot,{dryRun:false,force:false});
}
function shiftMaterials20261013_() {
  const ctx=buildContext_();
  const above=getUniqueChildFolderByName_(ctx.rootFolder,CFG.ABOVE_FOLDER_NAME);
  const folder=getUniqueChildFolderByName_(above,CFG.MATERIALS_FOLDER_NAME);
  const projects=loadProjectMap_(ctx);
  return syncMaterialsWorkbook_(ctx,folder,projects,{dryRun:false,force:false});
}
function syncShiftHourly20261013() {
  const clock=shiftClock20261013_();
  if(clock.sunday||clock.hour<8||clock.hour>18)return {status:'outside-shift',clock:clock};
  const slot=clock.date+'_'+('0'+clock.hour).slice(-2);
  const output={clock:clock,projects:{},materials:{status:'not-scheduled'},defect:{status:'not-scheduled'}};
  [6,7,8,9].forEach(plot=>{
    output.projects['P'+plot]=shiftOnce20261013_('project-P'+plot,slot,
      ()=>shiftProject20261013_(plot));
  });
  // Exactly 08:xx, 11:xx, 14:xx, 17:xx in local Bangkok time.
  if((clock.hour-8)%3===0) output.materials=shiftOnce20261013_('materials',slot,
    ()=>shiftMaterials20261013_());
  // Defect v1.3 has its own LockService; never call it under shiftOnce's lock.
  output.defect=shiftOnce20261013_('defect-slot',slot,()=>({status:'ok'}));
  // If the Defect slot was claimed, run the existing hardened 263-room importer.
  // We must NOT permanently mark a slot before the importer has succeeded.
  if(output.defect.status==='success'){
    try{
      const run=smartSyncDefectsV13_15m();
      if(run && (run.status==='error'||run.status==='locked'))throw Error(JSON.stringify(run));
      output.defect={status:'success',result:run};
    }catch(err){
      PropertiesService.getScriptProperties().deleteProperty(
        SHIFT_SYNC_20261013.PROPERTY_PREFIX+'defect-slot_'+slot);
      output.defect={status:'error',error:String(err)};
    }
  }
  console.log(JSON.stringify(output));
  return output;
}
function shiftPhoto20261013_(requestedHour) {
  const c=shiftClock20261013_();
  const delta=Math.abs((c.hour*60+c.minute)-requestedHour*60);
  if(delta>20)return {status:'outside-photo-slot',requestedHour:requestedHour,clock:c};
  const name='photos-'+requestedHour;
  const result=shiftOnce20261013_(name,c.date,()=>{
    const ctx=buildContext_();
    const above=getUniqueChildFolderByName_(ctx.rootFolder,CFG.ABOVE_FOLDER_NAME);
    const villa=getUniqueChildFolderByName_(above,CFG.VILLA_FOLDER_NAME);
    const projects=loadProjectMap_(ctx);
    const original=CFG.PHOTO_RECENT_DAYS;
    try {
      CFG.PHOTO_RECENT_DAYS=60; // Sep + Oct in the same candidate window
      return syncPictureProgress_(ctx,villa,projects,{
        dryRun:false,force:false,photoFullScan:requestedHour===8
      });
    } finally {CFG.PHOTO_RECENT_DAYS=original}
  });
  console.log(JSON.stringify(result));return result;
}
function syncShiftPhoto0800(){return shiftPhoto20261013_(8)}
function syncShiftPhoto1200(){return shiftPhoto20261013_(12)}
function syncShiftPhoto1700(){return shiftPhoto20261013_(17)}
function installShiftSync20261013() {
  const handlers=new Set(SHIFT_SYNC_20261013.OLD_HANDLERS);
  // Only replace automatic source-import triggers. Keep Defect Excel writeback,
  // Payroll, Daily Reports and unrelated handlers completely untouched.
  ScriptApp.getProjectTriggers().filter(t=>handlers.has(t.getHandlerFunction()))
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncShiftHourly20261013').timeBased().everyHours(1).create();
  [8,12,17].forEach(h=>{
    const fn=h===8?'syncShiftPhoto0800':h===12?'syncShiftPhoto1200':'syncShiftPhoto1700';
    ScriptApp.newTrigger(fn).timeBased().atHour(h).nearMinute(0)
      .everyDays(1).inTimezone(SHIFT_SYNC_20261013.TZ).create();
  });
  const status=getShiftSyncStatus20261013();
  if(status.shiftTriggerCount!==4)throw Error('EXPECTED_4_SHIFT_TRIGGERS');
  console.log(JSON.stringify(status));return status;
}
function getShiftSyncStatus20261013(){
  const all=ScriptApp.getProjectTriggers().map(t=>t.getHandlerFunction());
  const managed=all.filter(n=>[
    'syncShiftHourly20261013','syncShiftPhoto0800',
    'syncShiftPhoto1200','syncShiftPhoto1700'].includes(n));
  return {timezone:SHIFT_SYNC_20261013.TZ,shiftTriggerCount:managed.length,
    shiftTriggers:managed,allTriggerHandlers:all};
}