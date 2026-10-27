/**
 * Express registry -> isolated Supabase read model.
 * Requires: Existing 3Kings sync3Kings GAS helpers; ExpressBridgeAppendQA,
 * ExpressBridgeFullQA, ExpressBridgeMasterImporter; SQL migration
 * 20261022220800_express_registry_read_model.sql applied after QA.
 * This never writes existing materials / procurement_items / tool_machine rows.
 * Must use existing Supabase GAS Script Properties, never embed keys in code.
 */
const EB_DB = Object.freeze({
  propsGate:'EXPRESS_BRIDGE_DB_SYNC_APPROVED',
  batchDocs:100,
  batchLines:180,
  maxDocCount:100000,
  maxLinesCount:1000000,
  maxScriptPage:200,
});
function EB_dbFetch_(ctx,method,path,body,prefer) {
 const opts={method:method,headers:sbHeaders_(ctx,method!=='get',prefer||''),
   contentType:'application/json',muteHttpExceptions:true};
 if(body!==undefined&&body!==null)opts.payload=JSON.stringify(body);
 const res=UrlFetchApp.fetch(ctx.supabaseUrl+'/rest/v1/'+path,opts);
 const status=res.getResponseCode();
 if(status<200||status>299)throw Error('EXPRESS_DB_HTTP_'+status+':'+String(res.getContentText()).slice(0,250));
 let data=[];const raw=res.getContentText();
 if(raw)data=JSON.parse(raw);
 return {data:data,headers:res.getAllHeaders(),status:status};
}
function EB_dbFingerprint_(files) {
 return EB_qaHashText_(files.slice().sort((a,b)=>a.name.localeCompare(b.name))
   .map(x=>x.id+'|'+x.name+'|'+x.hash).join('\n'));
}
function EB_dbShape_(parsed,batchId) {
 const docs=[],lines=[];
 parsed.docs.slice().sort((a,b)=>(a.group+'|'+a.docNo).localeCompare(b.group+'|'+b.docNo)).forEach(function(d){
  const status=d.qa.length?'SOURCE_LINE_REVIEW':d.plot.length===0?'HOLD_UNASSIGNED_PLOT':
   d.plot.length>1?'HOLD_MULTI_PLOT':'VERIFIED_SOURCE_ONLY';
  const src='https://drive.google.com/file/d/'+d.sourceId+'/view';
  const key=d.group+'|'+d.docNo;
  const search=[d.docNo,d.supplier,d.reference,d.plot.join(' '),
   d.lines.map(x=>x.code+' '+x.description).join(' ')].join(' ').slice(0,14000);
  docs.push({batch_id:batchId,document_group:d.group,document_no:d.docNo,line_seq:0,
   document_date:d.date,supplier:d.supplier,plot_codes:d.plot,qa_status:status,
   source_file:d.source,source_url:src,grand_total:d.total/100,search_text:search});
  d.lines.forEach(function(l){
   lines.push({batch_id:batchId,document_group:d.group,document_no:d.docNo,line_seq:l.seq,
    document_date:d.date,supplier:d.supplier,plot_codes:d.plot,qa_status:status,
    source_file:d.source,source_url:src,item_code:l.code,description:l.description,
    quantity:l.qty,unit:l.unit,unit_price:l.unitPrice/100,line_amount:l.amount/100,
    search_text:key+' '+l.code+' '+l.description});
  });
 });
 return {docs:docs,lines:lines};
}
function EB_dbCount_(ctx,batchId,lineFilter) {
 const path='express_register_rows?select=batch_id&batch_id=eq.'+encodeURIComponent(batchId)+
  '&line_seq='+lineFilter+'&limit=1';
 const res=UrlFetchApp.fetch(ctx.supabaseUrl+'/rest/v1/'+path,{
  method:'get',headers:Object.assign({},sbHeaders_(ctx,false,''),{'Prefer':'count=exact'}),
  muteHttpExceptions:true});
 if(res.getResponseCode()<200||res.getResponseCode()>299)throw Error('EXPRESS_DB_COUNT_READ_FAILED_'+res.getResponseCode());
 const heads=res.getAllHeaders(),header=Object.keys(heads).find(x=>x.toLowerCase()==='content-range');
 const range=header?String(heads[header]):'';
 const m=/\/(\d+)$/.exec(range);if(!m)throw Error('EXPRESS_DB_COUNT_MISSING');
 return Number(m[1]);
}
function EB_dbPreflight_(ctx){
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(ctx.supabaseUrl))throw Error('EXPRESS_DB_URL_CHANGED');
 // A 404 means the migration has not been applied; no Master write may occur yet.
 EB_dbFetch_(ctx,'get','express_register_runs?select=id&limit=1',null,null);
 EB_dbFetch_(ctx,'get','express_register_rows?select=document_no&limit=1',null,null);
}
function expressBridgeRegistrySyncDryRun20261022(){
 const ctx=buildContext_();EB_dbPreflight_(ctx);
 const master=EB_masterMakePayload_(false);
 if(master.status!=='NO_CHANGE')throw Error('MASTER_REGISTER_NOT_YET_CURRENT');
 const parsed=EB_mergeReports_(EB_qaReadFolder_());
 const data=EB_dbShape_(parsed,'00000000-0000-4000-8000-000000000001');
 if(data.docs.length<3706||data.lines.length<13114)throw Error('EXPRESS_REGISTRY_SOURCE_LOSS');
 const r={status:'DB_SYNC_DRY_RUN_PASS',documents:data.docs.length,lines:data.lines.length,
  sourceReview:parsed.counts.held,skippedCanceled:parsed.skippedCanceled,originalMutation:0,supabaseMutation:0};
 console.log('EXPRESS_BRIDGE_SUPABASE '+JSON.stringify(r));return r;
}
function expressBridgeRegistrySyncOnce20261022() {
 const lock=LockService.getScriptLock();if(!lock.tryLock(30000))throw Error('EXPRESS_DB_LOCK_BUSY');
 try{
  const ctx=buildContext_();EB_dbPreflight_(ctx);
  if(ctx.props.getProperty(EB_DB.propsGate)!=='true')throw Error('EXPRESS_DB_RELEASE_GATE_OFF');
  const master=EB_masterMakePayload_(false);
  if(master.status!=='NO_CHANGE')throw Error('MASTER_REGISTER_NOT_CURRENT_SYNC_MASTER_FIRST');
  const files=EB_qaReadFolder_(),parsed=EB_mergeReports_(files),fingerprint=EB_dbFingerprint_(files);
  const existing=EB_dbFetch_(ctx,'get','express_register_runs?select=*&source_fingerprint=eq.'+fingerprint+'&limit=1',null,null).data;
  if(existing.length&&existing[0].state==='complete'){
   const result={status:'DB_REGISTER_NO_CHANGE',fingerprint:fingerprint,documents:parsed.counts.docs,lines:parsed.counts.lines,supabaseMutation:0};
   console.log('EXPRESS_BRIDGE_SUPABASE '+JSON.stringify(result));return result;
  }
  const run={source_fingerprint:fingerprint,state:'importing',source_files:files.length,
   document_count:parsed.counts.docs,line_count:parsed.counts.lines,canceled_count:parsed.skippedCanceled,
   review_count:parsed.counts.held,completed_at:null};
  const rows=EB_dbFetch_(ctx,'post','express_register_runs?on_conflict=source_fingerprint',[run],
    'resolution=merge-duplicates,return=representation').data;
  if(!rows.length||!rows[0].id)throw Error('EXPRESS_DB_RUN_CREATE_FAILED');
  const batchId=rows[0].id,data=EB_dbShape_(parsed,batchId);
  if(data.docs.length!==run.document_count||data.lines.length!==run.line_count||
   data.docs.length<3706||data.lines.length<13114||data.docs.length>EB_DB.maxDocCount||
   data.lines.length>EB_DB.maxLinesCount)throw Error('EXPRESS_DB_COUNTS_INVALID');
  const upsert=function(arr,size){for(let offset=0;offset<arr.length;offset+=size){
    const slice=arr.slice(offset,offset+size);
    EB_dbFetch_(ctx,'post','express_register_rows?on_conflict=batch_id,document_group,document_no,line_seq',
     slice,'resolution=merge-duplicates,return=minimal');
  }};
  upsert(data.docs,EB_DB.batchDocs);upsert(data.lines,EB_DB.batchLines);
  const liveDocs=EB_dbCount_(ctx,batchId,'eq.0'),liveLines=EB_dbCount_(ctx,batchId,'gt.0');
  if(liveDocs!==data.docs.length||liveLines!==data.lines.length)throw Error('EXPRESS_DB_INCOMPLETE_HOLD');
  EB_qaVerifyFolderUnchanged_(files);
  // Revalidate source workbook and Excel register after the many REST calls.
  if(EB_masterMakePayload_(false).status!=='NO_CHANGE')throw Error('MASTER_CHANGED_DURING_DB_IMPORT');
  const completion=EB_dbFetch_(ctx,'patch','express_register_runs?id=eq.'+batchId,
   {state:'complete',completed_at:new Date().toISOString()},'return=representation').data;
  if(!completion.length||completion[0].state!=='complete')throw Error('EXPRESS_DB_FINAL_READBACK_FAILED');
  // No retained historical canceled documents: remove prior completed/abandoned batches,
  // confined to this dedicated registry. Current completed batch is never deleted.
  EB_dbFetch_(ctx,'delete','express_register_runs?id=neq.'+batchId,null,'return=minimal');
  const verify=EB_dbFetch_(ctx,'get','express_register_runs?select=id,state&id=eq.'+batchId,null,null).data;
  if(verify.length!==1||verify[0].state!=='complete')throw Error('EXPRESS_DB_COMPLETE_BATCH_DISAPPEARED');
  const result={status:'DB_REGISTER_READBACK_PASS',batchId:batchId,documents:liveDocs,lines:liveLines,
   sourceReview:run.review_count,skippedCanceled:run.canceled_count,fingerprint:fingerprint,
   sourceFiles:files.length,originalMutation:0,supabaseMutation:1,
   nextGate:'AUTHENTICATED_WEB_READBACK_AND_AUTO_TRIGGER'};
  console.log('EXPRESS_BRIDGE_SUPABASE '+JSON.stringify(result));return result;
 }finally{lock.releaseLock()}
}
