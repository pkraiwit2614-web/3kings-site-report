import {NextRequest,NextResponse} from 'next/server'
import {createHash,timingSafeEqual} from 'node:crypto'
// Node-only deterministic delta planner; does not write or authorize Materials.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {planExpressDelta}=require('../../../../lib/express-po/delta.cjs') as {
 planExpressDelta:(report:unknown,staged:unknown,canonical:unknown,options?:unknown)=>{
  summary:{[key:string]:number};pages:unknown[];gate:string
 }
}
import {exchangeVercelOidcToken} from '@/lib/agentGoogleDrive'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=60
// Node-only CJS parser also runs in the dependency-free CI test suite.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {parseExpressPoReport}=require('../../../../lib/express-po/parser.cjs') as {
 parseExpressPoReport:(bytes:Buffer)=>Parsed
}
type Issue={code:string;poNo?:string;line?:number;field?:string}
type Document={poNo:string;projectCodes:string[];projectMapping:string;items:unknown[]}
type Parsed={sourceSha256:string;reportType:'PO_PL'|'PR_PC';documents:Document[];qa:Issue[];
 summary:{reportedDocuments:number|null;validDocuments:number;cancelledDocuments:number;lineItems:number;
 reportedTotalCents:number;unmappedDocuments:number;quarantinedDocuments:string[]}}
type DriveFile={id:string;name:string;mimeType:string;modifiedTime:string;size:string;trashed?:boolean}
const headers={'cache-control':'private, no-store'}
const reply=(data:unknown,status:number)=>NextResponse.json(data,{status,headers})
function authorized(supplied:string,secret:string):boolean{
 if(!secret||!supplied||Buffer.byteLength(supplied)>2048)return false
 return timingSafeEqual(createHash('sha256').update(supplied).digest(),
  createHash('sha256').update(secret).digest())
}
function required(key:string):string{
 const value=String(process.env[key]||'').trim()
 if(!value)throw Error('CONFIG_REQUIRED_'+key)
 return value
}
async function json<T>(token:string,url:string):Promise<T>{
 const r=await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store',
  signal:AbortSignal.timeout(12000)})
 if(!r.ok)throw Error('DRIVE_READ_FAILED')
 return r.json() as Promise<T>
}
type SourceMode='po_history'|'pr_history'|'po_daily'|'pr_daily'
async function latestCsv(token:string,sourceMode:SourceMode):Promise<{file:DriveFile;bytes:Buffer}>{
 const folder=required('EXPRESS_PO_SOURCE_FOLDER_ID')
 if(!/^[\w-]{15,100}$/.test(folder))throw Error('INVALID_SOURCE_FOLDER')
 const params=new URLSearchParams({q:"'"+folder+"' in parents and trashed = false",
  fields:'nextPageToken,files(id,name,mimeType,modifiedTime,size,trashed)',
  pageSize:'100',orderBy:'modifiedTime desc'})
 const files=await json<{files?:DriveFile[];nextPageToken?:string}>(token,
  'https://www.googleapis.com/drive/v3/files?'+params)
 if(files.nextPageToken)throw Error('SOURCE_FOLDER_TOO_LARGE')
 const matches=(files.files||[]).filter(f=>f.mimeType==='text/csv'&&Number(f.size)>0&&
  Number(f.size)<=8_000_000&&(
   sourceMode==='po_history'?f.name==='PO2024-Now.csv':
   sourceMode==='pr_history'?f.name==='PR2024-Now.csv':
   sourceMode==='po_daily'?/^\d{12}\.csv$/i.test(f.name):
   /^PR-\d{12}\.csv$/i.test(f.name)))
 if(!matches.length)throw Error('NO_VALID_EXPRESS_CSV')
 matches.sort((a,b)=>b.modifiedTime.localeCompare(a.modifiedTime))
 if(sourceMode.endsWith('history')&&matches.length!==1)throw Error('SOURCE_AMBIGUOUS')
 const file=matches[0]
 const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)
 const r=await fetch(url+'?alt=media',{headers:{Authorization:'Bearer '+token},
  cache:'no-store',signal:AbortSignal.timeout(30000)})
 if(!r.ok)throw Error('DRIVE_DOWNLOAD_FAILED')
 const bytes=Buffer.from(await r.arrayBuffer())
 if(bytes.byteLength!==Number(file.size))throw Error('SOURCE_FILE_CHANGED_DURING_READ')
 const reread=await json<DriveFile>(token,url+'?fields=id,name,mimeType,modifiedTime,size,trashed')
 if(reread.trashed||reread.modifiedTime!==file.modifiedTime||
    reread.size!==file.size||reread.name!==file.name||reread.mimeType!==file.mimeType)
  throw Error('SOURCE_FILE_CHANGED_DURING_READ')
 return {file,bytes}
}

export async function POST(request:NextRequest){
 // Strict Preview-only API; no Production cron, Materials mutations, or client access.
 if(process.env.VERCEL_ENV!=='preview'||process.env.EXPRESS_PO_SYNC_ENABLED!=='true')
  return reply({error:'EXPRESS_PO_PREVIEW_DISABLED'},503)
 const bearer=(request.headers.get('authorization')||'').replace(/^Bearer /i,'')
 if(!authorized(bearer,process.env.EXPRESS_PO_SYNC_SECRET||''))
  return reply({error:'UNAUTHORIZED'},401)
 let body:unknown
 try{body=await request.json()}catch{return reply({error:'INVALID_REQUEST'},400)}
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).some(k=>!['mode','source'].includes(k))||
  !['dry_run','stage_only'].includes(String((body as {mode?:unknown}).mode)))
  return reply({error:'INVALID_REQUEST'},400)
 const mode=String((body as {mode:string}).mode)
 const source=String((body as {source?:unknown}).source||'po_history')
 if(!['po_history','pr_history','po_daily','pr_daily'].includes(source))
  return reply({error:'INVALID_SOURCE_MODE'},400)
 try{
  const token=await exchangeVercelOidcToken(request.headers.get('x-vercel-oidc-token')||'')
  const {file,bytes}=await latestCsv(token,source as SourceMode)
  const report=parseExpressPoReport(bytes)
  const fatal=report.qa.some(q=>['REPORT_COUNT_MISMATCH','REPORT_SUM_MISMATCH',
   'PO_HEADER_UNREADABLE','ORPHAN_ITEM','DOC_TYPE_CONFLICT',
   'DOCUMENT_HEADER_UNRECOGNIZED','DOCUMENT_DATE_UNREADABLE'].includes(q.code))
  if(fatal&&mode==='stage_only')throw Error('SOURCE_REPORT_QA_BLOCK')
  // Existing four-tab staging is deliberately limited to dated PO-only small batches.
  // History snapshots require a separately verified incremental, locked staging design.
  if(mode==='stage_only'&&(source!=='po_daily'||report.reportType!=='PO_PL'||
     report.documents.length>500||report.summary.lineItems>3000))
   throw Error('SOURCE_STAGING_DELTA_REQUIRED')
  // Canonical records are intentionally NOT inferred from a missing preview DB snapshot.
  // This preview-only classification blocks all import candidates until verified
  // source-to-existing-row identity is supplied to a separate controlled executor.
  const delta=planExpressDelta(report,[],null,{maxDocumentsPerPage:100,maxItemsPerPage:1000})
  const hold=new Set(report.summary.quarantinedDocuments)
  const documents=report.documents.map(d=>({...d,receiptStatus:'unverified',
   importDecision:hold.has(d.poNo)?'hold_qa':d.projectMapping==='unmapped'?
    'hold_mapping':'staged_verified'}))
  const response={source:{fileName:file.name,modifiedTime:file.modifiedTime,
    sha256:report.sourceSha256,sourceMode:source,reportType:report.reportType},
   summary:report.summary,qaTotal:report.qa.length,qa:report.qa.slice(0,100),
   delta:{gate:delta.gate,summary:delta.summary,pageCount:delta.pages.length},
   decisions:{verified:documents.filter(d=>d.importDecision==='staged_verified').length,
    holdMapping:documents.filter(d=>d.importDecision==='hold_mapping').length,
    holdQa:documents.filter(d=>d.importDecision==='hold_qa').length},
   note:'Express received-all flag is not confirmed physical receipt.'}
  if(mode==='dry_run')return reply({...response,result:'DRY_RUN_ONLY_NO_WRITES'},200)
  // Fail closed: the legacy Sheets append path is NOT cross-instance atomic.
  // A real distributed lease plus verified canonical+line snapshot must be
  // integrated before any staged import. Dry-run remains available.
  if(delta.gate!=='STAGING_CANDIDATES_ONLY')throw Error('SOURCE_CANONICAL_RECONCILIATION_REQUIRED')
  throw Error('SHEETS_ATOMIC_LOCK_REQUIRED')
 }catch(e){
  // Do not expose supplier names, private file text or privileged backend messages.
  const message=e instanceof Error?e.message:''
  const code=/^(CONFIG_REQUIRED_|INVALID_SOURCE_|DRIVE_|SOURCE_|NO_VALID_|UNSUPPORTED_|INVALID_|MISSING_|SHEETS_|EXPRESS_PO_|BLOCK_)/.test(message)
   ?message:'EXPRESS_PO_SYNC_FAILED'
  return reply({error:code},503)
 }
}
