'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto')
const code=['ExpressBridgeAppendSafeQA_2026-10-22.gs','ExpressBridgeFullHistoryQA_2026-10-22.gs','ExpressBridgeMasterImporter_2026-10-22.gs'].map(n=>fs.readFileSync('docs/apps-script/'+n,'utf8')).join('\n')
function blob(value,name=''){const bytes=Buffer.from(value);return {getName:()=>name,getBytes:()=>bytes,getDataAsString:()=>bytes.toString()}}
function harness(){
 const props=new Map(),writes=[];let live='current',drift=false
 const ctx=vm.createContext({console:{log:()=>{}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},Utilities:{newBlob:(s,t,n)=>blob(s,n),zip:list=>({list,setContentType:()=>{},getBytes:()=>Buffer.from(JSON.stringify(list.map(p=>[p.getName(),p.getDataAsString()])))}),unzip:b=>JSON.parse(b.getBytes().toString()).map(([n,s])=>blob(s,n)),computeDigest:(a,b)=>[...crypto.createHash('sha256').update(b).digest()],DigestAlgorithm:{SHA_256:1}}})
 vm.runInContext(code,ctx)
 return {ctx,props,writes}
}
function original(ctx){
 const parts=[blob('<x:workbook><x:sheets>'+Array.from({length:11},(_,i)=>'<x:sheet name="Original '+i+'" sheetId="'+(i+1)+'"/>').join('')+'</x:sheets></x:workbook>','xl/workbook.xml'),blob('<Relationships></Relationships>','xl/_rels/workbook.xml.rels'),blob('<Types></Types>','[Content_Types].xml'),blob('human edit and formula','xl/worksheets/sheet1.xml'),blob('image bytes','xl/media/image1.png')]
 return {list:parts,map:Object.fromEntries(parts.map(p=>[p.getName(),p]))}
}
test('current Master append preserves manual sheet and image bytes; rejects modified workbook metadata',()=>{
 const {ctx}=harness(),before=original(ctx)
 const candidate=ctx.EB_masterAppendCandidate_(before,['<worksheet>docs</worksheet>','<worksheet>lines</worksheet>'])
 const after=ctx.expressBridgeAppendQAParts_(candidate)
 for(const n of ['xl/worksheets/sheet1.xml','xl/media/image1.png'])assert.deepEqual(after.map[n].getBytes(),before.map[n].getBytes())
 assert.equal(Object.keys(after.map).length,Object.keys(before.map).length+2)
 const corrupt={map:{...after.map,'xl/workbook.xml':blob('corrupted')}}
 assert.throws(()=>ctx.EB_masterSameParts_(after,corrupt),/QA_REGISTRY_SOURCE_MISMATCH_HOLD/)
})
test('path and relationship collisions stop the current-Master candidate',()=>{
 const {ctx}=harness(),before=original(ctx)
 before.map['xl/worksheets/sheet12.xml']=blob('manual sheet')
 assert.throws(()=>ctx.EB_masterAppendCandidate_(before,['d','l']),/QA_SHEET_PATH_ALREADY_EXISTS/)
 delete before.map['xl/worksheets/sheet12.xml']
 before.map['xl/_rels/workbook.xml.rels']=blob('<Relationships><Relationship Id="RExpressBridgeQA20261022Docs"/></Relationships>')
 assert.throws(()=>ctx.EB_masterAppendCandidate_(before,['d','l']),/MASTER_REGISTER_RELATION_COLLISION/)
})
test('QA receipt is saved only after byte readback and unchanged Master; production flags stay untouched',()=>{
 for(const drift of [false,true]){
  const {ctx,props}=harness(),before=original(ctx),candidate=ctx.EB_masterAppendCandidate_(before,['d','l'])
  let reads=0
  ctx.state={first:true,sources:[],candidate,originalHash:ctx.EB_qaHash_(Buffer.from('current')),file:{getBlob:()=>blob(drift&&++reads>1?'changed':'current')},documents:1,lines:1}
  ctx.DriveApp={getFolderById:()=>({createFile:()=>({getId:()=> 'synthetic-qa',getBlob:()=>candidate})})}
  vm.runInContext('EB_masterMakePayload_=()=>state; EB_qaVerifyFolderUnchanged_=()=>{}',ctx)
  if(drift){assert.throws(()=>ctx.expressBridgeMasterPrepareQA20261027(),/MASTER_CHANGED_DURING_QA/);assert.equal(props.size,0)}
  else{assert.equal(ctx.expressBridgeMasterPrepareQA20261027().mutationOriginal,0);assert.equal(props.size,1);assert.ok(props.has('EXPRESS_BRIDGE_PREPARED_QA_V2'))}
 }
})
test('source snapshot rejects additions, deletions and content drift even at equal sizes',()=>{
 const {ctx}=harness();ctx.current=[{id:'a',name:'PO.csv',size:3,hash:'new',modifiedAt:'same'}]
 vm.runInContext('EB_qaReadFolder_=()=>current',ctx)
 assert.throws(()=>ctx.EB_qaVerifyFolderUnchanged_([{...ctx.current[0],hash:'old'}]),/SOURCE_FOLDER_CHANGED/)
 assert.throws(()=>ctx.EB_qaVerifyFolderUnchanged_([]),/SOURCE_FOLDER_CHANGED/)
 ctx.EB_qaVerifyFolderUnchanged_(ctx.current)
})
test('date-ordered CSV retains source uncertainty and excludes explicit cancellations',()=>{
 const {ctx}=harness()
 const source={name:'POPRD.csv',id:'synthetic',modifiedAt:'2026-10-27'}
 const text=['รายงานใบสั่งซื้อ เรียงตามวันที่','  01/09/69  PL0000932    AP-2322    01/09/69       2    100.00    7.00    107.00  Y','                 1 D5320-09 item              1.00pcs        100.00                 100.00','  01/09/69 *PO690901002  AP-0220    01/09/69    7  1    0.00    0.00    0.00  N'].join('\n')
 const result=ctx.EB_mergeReports_([{...source,text}])
 assert.equal(result.docs.length,1);assert.equal(result.counts.lines,1);assert.equal(result.skippedCanceled,1)
 assert.ok(result.docs[0].qa.includes('SUPPLIER_NAME_NOT_IN_EXPORT'))
 assert.equal(result.docs[0].supplier,'AP-2322')
 assert.throws(()=>ctx.EB_parseFile_('รายงานใบสั่งซื้อ unknown layout',source),/UNSUPPORTED_REPORT_LAYOUT/)
 assert.equal(vm.runInContext('EB_FULL_QA.allowedSource.test("POPRD.csv")',ctx),true)
})
test('first import requires a current-base QA receipt and still rejects newer source or QA changes',()=>{
 const {ctx,props}=harness(),before=original(ctx)
 const originalBlob=ctx.Utilities.zip(before.list)
 const candidate=ctx.EB_masterAppendCandidate_(before,['docs','lines'])
 const ids=vm.runInContext('({original:EB_MASTER_WRITE.original,name:EB_MASTER_WRITE.expectedName,prop:EB_MASTER_WRITE.preparedProp})',ctx)
 const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 let qaBlob=candidate
 ctx.DriveApp={getFileById:id=>id===ids.original?{getId:()=>id,getName:()=>ids.name,getMimeType:()=>mime,getBlob:()=>originalBlob}:{getMimeType:()=>mime,getBlob:()=>qaBlob}}
 vm.runInContext(`EB_qaReadFolder_=()=>[{name:'PO2023-211020260935.csv'},{name:'PR2023-211020260935.csv'}]; EB_mergeReports_=()=>({counts:{held:0},docs:[],skippedCanceled:0}); EB_qaMapRegisters_=()=>({documents:3706,lines:13114,docRows:'docs',itemRows:'lines'}); EB_qaWorksheetXml_=rows=>rows;`,ctx)
 assert.throws(()=>ctx.EB_masterMakePayload_(false),/MASTER_BASE_REVISION_HOLD/)
 const receipt={masterSha:ctx.EB_qaHash_(originalBlob.getBytes()),qaId:'synthetic-qa',candidateHash:ctx.EB_qaHash_(candidate.getBytes())}
 props.set(ids.prop,JSON.stringify(receipt))
 assert.equal(ctx.EB_masterMakePayload_(false).status,'DELTA_READY')
 props.set(ids.prop,JSON.stringify({...receipt,masterSha:'stale'}))
 assert.throws(()=>ctx.EB_masterMakePayload_(false),/MASTER_BASE_REVISION_HOLD/)
 props.set(ids.prop,JSON.stringify(receipt))
 qaBlob=blob('changed')
 assert.throws(()=>ctx.EB_masterMakePayload_(false),/QA_REFERENCE_IDENTITY_HOLD/)
 qaBlob=candidate
 vm.runInContext(`EB_qaWorksheetXml_=rows=>rows+'new source'`,ctx)
 assert.throws(()=>ctx.EB_masterMakePayload_(false),/QA_REGISTRY_SOURCE_MISMATCH_HOLD/)
})
