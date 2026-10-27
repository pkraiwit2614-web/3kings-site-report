'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const script=fs.readFileSync(require('node:path').join(__dirname,'../docs/apps-script/GPTMaterialsSyncQueue_2026-10-27.gs'),'utf8');
const owner='owner@example.com';
const qid='17mc-xMCiXUID4bmuT8cj5LlS1PYGdZdsnW5UWK6PpE0';
const masterId='1Yr9iNVo54g4PrB2ntFb6E_ouI_ohHqSn';
const project='1sKddwvs-DOav0ltdrcxyqPXYinXE3uCgFKmDzGu_XEb4VvMvYVwDUDeT';
const revision='2026-10-27T07:32:09.245Z';
const headers=['request_id','action','source_file_id','source_modified_at','requested_at','expires_at','requester','status','started_at','finished_at','sync_status','rows_read','rows_written','message','worker_version'];
const id='b8fc9a65-9f00-4c26-91ae-adeb80151519';
const iso=t=>new Date(t).toISOString();
function harness({active=false,valid=true,duplicate=false,badAcl=false,sourceChanged=false,outcome='success',initialStatus='REQUESTED',race=false}={}) {
  const time=Date.now();
  const request=[id,'MATERIALS_SYNC',masterId,revision,iso(time-10000),iso(time+1800000),owner,initialStatus,'','','','','','',''];
  const requestRows=[headers,request];if(duplicate)requestRows.push(request.slice());
  const controlRows=[['key','value','description'],
    ['queue_state',active?'LIVE_APPROVED':'STAGING_DISABLED',''],['worker_active',active?'TRUE':'FALSE',''],
    ['allowed_action','MATERIALS_SYNC',''],['allowed_source_file_id',masterId,''],
    ['allowed_script_project_id',project,''],['schema_version','1',''],['owner_email',owner,'']];
  const stats={sync:0,write:0,createTrigger:0,deleteTrigger:0};
  const requests={getLastRow:()=>requestRows.length,getRange:(r,c,nr=1,nc=1)=>({
    getDisplayValues:()=>requestRows.slice(r-1,r-1+nr).map(v=>v.slice(c-1,c-1+nc)),
    setValue:v=>{requestRows[r-1][c-1]=v;stats.write++},
    setValues:matrix=>{matrix.forEach((row,i)=>row.forEach((v,j)=>{requestRows[r-1+i][c-1+j]=v;stats.write++}))}
  })};
  const control={getDataRange:()=>({getDisplayValues:()=>controlRows})};
  const ss={getSheetByName:n=>n==='Requests'?requests:n==='Control'?control:null};
  const canonicalFile={getName:()=> 'ABOVE_MATERIALS_STATUS_Stock_Updated_2026-09-20.xlsx',
    getMimeType:()=> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    getLastUpdated:()=>new Date((sourceChanged||race&&stats.sync)?'2026-10-27T07:50:00.000Z':revision),getId:()=>masterId};
  const queueFile={getOwner:()=>({getEmail:()=>owner}),getSharingAccess:()=>badAcl?'PUBLIC':'PRIVATE',getEditors:()=>[],getId:()=>qid};
  const otherTrigger={getHandlerFunction:()=> 'syncShiftHourly20261013'};
  const created={getHandlerFunction:()=> 'processGPTMaterialsSyncQueue20261027'};
  const triggers=[otherTrigger];
  const ctx={
    Date,console:{error:()=>{}},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},getFileById:id=>id===qid?queueFile:id===masterId?canonicalFile:null},
    Session:{getEffectiveUser:()=>({getEmail:()=>owner})},
    SpreadsheetApp:{openById:id=>id===qid?ss:null,flush:()=>{}},
    ScriptApp:{getScriptId:()=>project,getProjectTriggers:()=>triggers.slice(),newTrigger:fn=>({timeBased:()=>({everyMinutes:n=>({create:()=>{assert.equal(fn,'processGPTMaterialsSyncQueue20261027');assert.equal(n,5);stats.createTrigger++;triggers.push(created)}})})}),deleteTrigger:t=>{stats.deleteTrigger++;triggers.splice(triggers.indexOf(t),1)}},
    LockService:{getUserLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    buildContext_:()=>({rootFolder:{}}),getUniqueChildFolderByName_:()=>({}),
    findLatestFile_:()=>canonicalFile,CFG:{ABOVE_FOLDER_NAME:'Above',MATERIALS_FOLDER_NAME:'0-Materials and Equipment',MATERIAL_FILE_RE:/^ABOVE_MATERIALS_STATUS.*\.xlsx$/},
    materialsSyncProduction:()=>{stats.sync++;if(outcome==='throws')throw new Error('test forced error');return {status:outcome}},
  };
  vm.createContext(ctx);vm.runInContext(script,ctx);
  return {ctx,stats,requestRows,controlRows,triggers,request};
}
function validate(row,now=Date.now()) {const h=harness();return h.ctx.gptValidateMaterialsRequest20261027_(row,owner,now)}

test('syntax and dry preflight returns no writes',()=>{const h=harness();const x=h.ctx.preflightGPTMaterialsQueue20261027();assert.equal(x.status,'PREFLIGHT_ONLY');assert.equal(h.stats.sync,0);assert.equal(h.stats.write,0)});
test('disabled queue does not claim or run',()=>{const h=harness();assert.equal(h.ctx.processGPTMaterialsSyncQueue20261027().status,'disabled');assert.equal(h.stats.sync,0);assert.equal(h.stats.write,0)});
test('valid request calls existing importer once and waits for independent QA',()=>{const h=harness({active:true});const x=h.ctx.processGPTMaterialsSyncQueue20261027();assert.equal(x.status,'WAIT_SYNC');assert.equal(h.stats.sync,1);assert.equal(h.requestRows[1][7],'WAIT_SYNC');assert.equal(h.requestRows[1][10],'success');assert.equal(h.ctx.processGPTMaterialsSyncQueue20261027().status,'no_pending');assert.equal(h.stats.sync,1)});
test('already-imported revision is WAIT_SYNC not fake completed',()=>{const h=harness({active:true,outcome:'skipped'});assert.equal(h.ctx.processGPTMaterialsSyncQueue20261027().status,'WAIT_SYNC');assert.match(h.requestRows[1][13],/DB_AND_AUTH_UI_READBACK_REQUIRED/)});
test('stale source fails closed before invoking legacy importer',()=>{const h=harness({active:true,sourceChanged:true});assert.equal(h.ctx.processGPTMaterialsSyncQueue20261027().status,'review');assert.equal(h.stats.sync,0);assert.equal(h.requestRows[1][7],'REVIEW')});
test('source changes during import => review rather than complete',()=>{const h=harness({active:true,race:true});assert.equal(h.ctx.processGPTMaterialsSyncQueue20261027().status,'review');assert.equal(h.stats.sync,1);assert.equal(h.requestRows[1][7],'REVIEW')});
test('bad ACL refuses to access queue',()=>{const h=harness({active:true,badAcl:true});assert.throws(()=>h.ctx.processGPTMaterialsSyncQueue20261027(),/NOT_PRIVATE/);assert.equal(h.stats.sync,0)});
test('malformed id, action, source, owner rejected',()=>{const h=harness();assert.equal(validate({...h.request,0:'invalid'}),'INVALID_REQUEST_ID');const r=h.request.slice();r[1]='DEFECT_SYNC';assert.equal(validate(r),'INVALID_ACTION_OR_SOURCE');r[1]='MATERIALS_SYNC';r[2]='other';assert.equal(validate(r),'INVALID_ACTION_OR_SOURCE');r[2]=masterId;r[6]='attacker@example.com';assert.equal(validate(r),'INVALID_REQUESTER')});
test('expired or dirty request rejected',()=>{const h=harness();const r=h.request.slice();r[5]=iso(Date.now()-1000);assert.equal(validate(r),'EXPIRED_OR_FUTURE_REQUEST');r[5]=iso(Date.now()+100000);r[8]='forged';assert.equal(validate(r),'DIRTY_REQUEST_ROW')});
test('duplicate id is quarantined without imports',()=>{const h=harness({active:true,duplicate:true});assert.equal(h.ctx.processGPTMaterialsSyncQueue20261027().status,'review');assert.equal(h.stats.sync,0);assert.equal(h.requestRows[1][7],'REVIEW');assert.equal(h.requestRows[2][7],'REQUESTED')});
test('legacy failure does not retry automatically',()=>{const h=harness({active:true,outcome:'throws'});assert.equal(h.ctx.processGPTMaterialsSyncQueue20261027().status,'ERROR');assert.equal(h.ctx.processGPTMaterialsSyncQueue20261027().status,'no_pending');assert.equal(h.stats.sync,1)});
test('install and rollback modify only dedicated trigger',()=>{const h=harness();assert.equal(h.ctx.installGPTMaterialsSyncQueue20261027().status,'installed_disabled_until_Control_APPROVED');assert.equal(h.triggers.length,2);assert.equal(h.ctx.installGPTMaterialsSyncQueue20261027().status,'already_installed');assert.equal(h.stats.createTrigger,1);assert.equal(h.ctx.uninstallGPTMaterialsSyncQueue20261027().removed,1);assert.equal(h.triggers.length,1);assert.equal(h.triggers[0].getHandlerFunction(),'syncShiftHourly20261013')});
