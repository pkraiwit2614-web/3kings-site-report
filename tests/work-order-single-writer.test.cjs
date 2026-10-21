const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const source = fs.readFileSync('docs/apps-script/WorkOrderSingleWriterCompletion_2026-10-21.gs','utf8')
const importer = fs.readFileSync('docs/apps-script/WorkOrderAutoSync_2026-10-15.gs','utf8')

test('Single-writer Apps Script is valid and fail-closed until enabled', () => {
  assert.doesNotThrow(()=>new vm.Script(source))
  assert.match(source,/function workOrderSingleWriterPreflight20261021\(/)
  assert.match(source,/WORK_ORDER_SINGLE_WRITER_ENABLED/)
  assert.match(source,/if\(!dryRun&&!gate\.enabled\)/)
  assert.match(source,/if\(!gate\.ok\|\|!gate\.enabled\)/)
  assert.match(source,/mirror===0&&importer===1&&writer<=1/)
  assert.match(source,/defectWorkOrderScheduled20261015/)
  assert.doesNotMatch(source,/function defectWorkOrderScheduled20261015\(/)
  assert.match(source,/function syncWorkOrderCompletion20261015\(/)
  assert.match(source,/LockService\.getScriptLock\(\)/)
  assert.match(importer,/LockService\.getScriptLock\(\)/)
  assert.match(importer,/everyHours\(2\)/)
})

test('Only exact Work ID is written to original XLSX, acknowledged after readback', () => {
  assert.match(source,/found!==1/)
  assert.match(source,/Work ID missing or duplicated/)
  assert.match(source,/getLastUpdated\(\)\.getTime\(\)!==modified/)
  assert.match(source,/workOrderWbBaseline20261015_\(file\)/)
  assert.match(source,/Saved Excel Work ID \/ status \/ date mismatch/)
  const readbackIndex=source.indexOf('Saved Excel Work ID / status / date mismatch')
  const ackIndex=source.indexOf("'defect_work_order_writeback_ack'")
  assert.ok(readbackIndex>=0&&ackIndex>readbackIndex)
  assert.match(source,/writeback_fail/)
  assert.doesNotMatch(source,/UPDATE public\.condo_room_status|function defectWorkOrderScheduled20261015|HotelOOO|PayRoll/)
})

test('Surgical XLSX edit preserves other cells and blocks formulas',()=>{
  const ctx=vm.createContext({})
  vm.runInContext(source,ctx)
  const cell=ctx.workOrderWbCell20261015_
  const row=ctx.workOrderWbRow20261015_
  const put=ctx.workOrderWbPutCell20261015_
  const original='<worksheet><sheetData><row r="4"><c r="C4" t="inlineStr"><is><t>Work ID</t></is></c><c r="J4" t="inlineStr"><is><t>สถานะล่าสุด</t></is></c></row><row r="5"><c r="C5" t="inlineStr"><is><t>DF-A212-01</t></is></c><c r="D5" t="inlineStr"><is><t>keep</t></is></c><c r="J5" t="inlineStr"><is><t>ยังไม่เริ่ม</t></is></c></row></sheetData></worksheet>'
  const changed=put(original,'J5','เสร็จแล้ว')
  assert.equal(cell(row(changed,5),'C5',[]),'DF-A212-01')
  assert.equal(cell(row(changed,5),'D5',[]),'keep')
  assert.equal(cell(row(changed,5),'J5',[]),'เสร็จแล้ว')
  assert.equal(cell(row(original,5),'J5',[]),'ยังไม่เริ่ม')
  const formula='<worksheet><sheetData><row r="5"><c r="J5"><f>SUM(A1:A3)</f><v>0</v></c></row></sheetData></worksheet>'
  assert.throws(()=>put(formula,'J5','เสร็จแล้ว'),/Refusing to overwrite Excel formula/)
})

test('Optional Web completion is disabled by default, keeps server-side RPC role gate and print intact',()=>{
  const page=fs.readFileSync('app/work-order/page.tsx','utf8')
  const css=fs.readFileSync('app/work-order/work-order.css','utf8')
  assert.match(page,/NEXT_PUBLIC_WORK_ORDER_COMPLETION_ENABLED==='true'/)
  assert.match(page,/canComplete=permitted&&canEditDefect\(role\)&&completionEnabled/)
  assert.match(page,/if\(!canComplete\|\|!confirmRow\|\|saving\)return/)
  assert.match(page,/rpc\('defect_work_order_complete',\{p_work_id:confirmRow.work_id\}\)/)
  assert.match(page,/aria-modal="true"/)
  assert.match(page,/setConfirmRow\(null\)/)
  assert.match(page,/Work ID/)
  assert.match(css,/@media print\{\.wo-complete-btn,\.wo-modal-backdrop,\.wo-completion-notice\{display:none!important\}\}/)
  assert.doesNotMatch(page,/\.from\('condo_room_status'\)\.update\(/)
})


test('QA isolated: ZIP-typed XLSX, single Work ID write/readback/ACK, formula preservation, and restore',()=>{
  const workbook='<workbook><sheets><sheet name="ใบแจกงานคงค้าง 151026" sheetId="8" r:id="rId8"/></sheets></workbook>';
  const relationships='<Relationships><Relationship Id="rId8" Target="worksheets/sheet8.xml"/></Relationships>';
  const sheet='<worksheet><dimension ref="A1:O5"/><sheetData>'+
    '<row r="4"><c r="C4" t="inlineStr"><is><t>Work ID</t></is></c>'+
    '<c r="J4" t="inlineStr"><is><t>สถานะล่าสุด</t></is></c></row>'+
    '<row r="5"><c r="C5" t="inlineStr"><is><t>DF-A212-01</t></is></c>'+
    '<c r="E5"><f>SUM(A1:A3)</f><v>9</v></c>'+
    '<c r="J5" t="inlineStr"><is><t>กำลังดำเนินการ</t></is></c></row>'+
    '</sheetData></worksheet>';
  const names=['xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/worksheets/sheet8.xml','xl/styles.xml'];
  const originals=[workbook,relationships,sheet,'<styleSheet><fonts count="1"/></styleSheet>'];
  function entry(name,content,type){
    return {
      type:type||'text/xml',getName:()=>name,getBytes:()=>[80,75,3,4],
      getDataAsString:()=>content
    };
  }
  let current=names.map((name,i)=>entry(name,originals[i]));
  const pristine=current.slice();
  let pending=null,modified=Date.UTC(2026,9,21,9),acks=0,fails=0,uploads=0,backups=0;
  let queue=[{work_id:'DF-A212-01',web_completed_at:'2026-10-21T12:00:00Z'}];
  let enabled='false';
  const response=(data,code)=>({getResponseCode:()=>code||200,getContentText:()=>JSON.stringify(data)});
  const folder={getFilesByName:()=>({hasNext:()=>false})};
  const parent={getName:()=> 'QA_ONLY',getFoldersByName:()=>({hasNext:()=>false}),
    createFolder:()=>folder};
  const file={
    getName:()=> 'Defect_Work_Order_Updated_2026-10-15.xlsx',
    getMimeType:()=> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    getLastUpdated:()=>new Date(modified),
    getBlob:()=>({type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      getName:()=> 'Defect_Work_Order_Updated_2026-10-15.xlsx',getBytes:()=>[80,75,3,4]}),
    getParents:()=>({hasNext:()=>true,next:()=>parent}),
    makeCopy:()=>{backups++;return {getId:()=> 'QA_COPY',getMimeType:()=>file.getMimeType()}}
  };
  const mock={
    console:{log() {},error() {}},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock() {}})},
    ScriptApp:{getProjectTriggers:()=>[{getHandlerFunction:()=> 'syncWorkOrderHourly20261015'}],
      getOAuthToken:()=> 'QA_FAKE_TOKEN'},
    PropertiesService:{getScriptProperties:()=>({getProperty:(n)=>n==='WORK_ORDER_SINGLE_WRITER_ENABLED'?enabled:null})},
    DriveApp:{getFileById:(id)=>{assert.equal(id,'QA_WORKBOOK');return file}},
    Utilities:{
      newBlob:(data,type,name)=>entry(name,typeof data==='string'?data:'',type),
      unzip:(blob)=>{assert.equal(blob.type,'application/zip','must convert original XLSX MIME to ZIP in memory');return current.slice()},
      zip:(blobs,name)=>{assert.equal(name,file.getName());pending=blobs.slice();
        return {getBytes:()=>[80,75,3,4]}},
      formatDate:()=> '21/10/2026 19:00:00'
    },
    UrlFetchApp:{fetch:(url,opt)=>{
      if(url.includes('defect_work_order_writeback_pull'))
        return response({ok:true,rows:queue.slice()});
      if(url.includes('defect_work_order_writeback_ack')){
        assert.ok(uploads>0,'queue ACK must be strictly after XLSX upload/readback');
        acks++;queue=[];return response({ok:true});
      }
      if(url.includes('defect_work_order_writeback_fail')){fails++;return response({ok:true})}
      if(url.includes('/upload/drive/v3/files/QA_WORKBOOK')){
        assert.equal(opt.method,'patch');assert.ok(pending);
        uploads++;current=pending.slice();modified+=1000;return response({id:'QA_WORKBOOK'});
      }
      throw new Error('unexpected synthetic network call '+url);
    }}
  };
  const env=vm.createContext(mock);
  const setup="const WORK_ORDER_AUTO_20261015={DB_URL:'https://qa.invalid',"+
    "FILE_NAME:'Defect_Work_Order_Updated_2026-10-15.xlsx',"+
    "SHEET_NAME:'ใบแจกงานคงค้าง 151026',TZ:'Asia/Bangkok',"+
    "HANDLER:'syncWorkOrderHourly20261015'};"+
    "function workOrderConfig20261015_(){return {id:'QA_WORKBOOK',"+
    "apikey:'QA_FAKE_KEY',syncKey:'QA_FAKE_SYNC'};}";
  vm.runInContext(setup+'\n'+source,env);
  const disabled=env.workOrderCompletionSyncNow20261015();
  assert.equal(disabled.status,'disabled');assert.equal(uploads,0);
  enabled='true'; // Synthetic QA environment only; never a GAS or Production property.
  const run=env.workOrderCompletionSyncNow20261015();
  assert.equal(run.status,'success');assert.equal(run.queued,1);
  assert.equal(run.verified,1);assert.equal(run.errors.length,0);
  assert.equal(uploads,1);assert.equal(acks,1);assert.equal(fails,0);
  assert.equal(backups,1);
  assert.equal(current.length,pristine.length);
  for(const i of [0,1,3])
    assert.equal(current[i].getDataAsString(),pristine[i].getDataAsString(),
      'unrelated XLSX ZIP member changed: '+names[i]);
  const edited=current[2].getDataAsString();
  assert.match(edited,/<f>SUM\(A1:A3\)<\/f>/);
  assert.match(edited,/<t>DF-A212-01<\/t>/);
  assert.match(edited,/r="J5"[^>]*>[\s\S]*?<t[^>]*>เสร็จแล้ว<\/t>/);
  assert.match(edited,/r="P5"/);
  assert.match(edited,/r="P4"/);
  assert.match(edited,/dimension ref="A1:P5"/);
  // QA restore never modifies Google Drive: restore only this in-memory fixture.
  current=pristine.slice();assert.equal(current[2].getDataAsString(),sheet);
  queue=[{work_id:'DF-A213-99',web_completed_at:'2026-10-21T12:00:00Z'}];
  const failed=env.workOrderCompletionSyncNow20261015();
  assert.equal(failed.status,'partial');
  assert.equal(failed.queued,1);assert.equal(failed.verified,0);
  assert.equal(failed.errors.length,1);
  assert.match(failed.errors[0].error,/Work ID missing or duplicated/);
  assert.equal(acks,1,'a failed Work ID must not be acknowledged');
  assert.equal(uploads,1,'a failed Work ID must not rewrite XLSX');
  assert.equal(fails,1,'failed item must be reported for retry');
  assert.equal(current[2].getDataAsString(),sheet);
  queue=[{work_id:'DF-A212-01',web_completed_at:'2026-10-21T12:00:00Z'}];
  const retry=env.workOrderCompletionSyncNow20261015();
  assert.equal(retry.status,'success');assert.equal(retry.verified,1);
  assert.equal(acks,2);assert.equal(uploads,2);
  // Clear synthetic state; neither a real queue nor an approved XLSX was touched.
  current=pristine.slice();assert.equal(current[2].getDataAsString(),sheet);
});
