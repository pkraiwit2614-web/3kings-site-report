import {NextRequest,NextResponse} from 'next/server'
import {createHash,timingSafeEqual} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
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
type Parsed={sourceSha256:string;documents:Document[];qa:Issue[];
 summary:{reportedDocuments:number;validDocuments:number;cancelledDocuments:number;lineItems:number;
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
async function latestCsv(token:string):Promise<{file:DriveFile;bytes:Buffer}>{
 const folder=required('EXPRESS_PO_SOURCE_FOLDER_ID')
 if(!/^[\w-]{15,100}$/.test(folder))throw Error('INVALID_SOURCE_FOLDER')
 const params=new URLSearchParams({q:"'"+folder+"' in parents and trashed = false",
  fields:'nextPageToken,files(id,name,mimeType,modifiedTime,size,trashed)',
  pageSize:'100',orderBy:'modifiedTime desc'})
 const files=await json<{files?:DriveFile[];nextPageToken?:string}>(token,
  'https://www.googleapis.com/drive/v3/files?'+params)
 if(files.nextPageToken)throw Error('SOURCE_FOLDER_TOO_LARGE')
 const valid=(files.files||[]).filter(f=>f.mimeType==='text/csv'&&
  /^\d{12}\.csv$/i.test(f.name)&&Number(f.size)>0&&Number(f.size)<=2_000_000)
 if(!valid.length)throw Error('NO_VALID_EXPRESS_CSV')
 valid.sort((a,b)=>b.modifiedTime.localeCompare(a.modifiedTime))
 const file=valid[0]
 const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)
 const r=await fetch(url+'?alt=media',{headers:{Authorization:'Bearer '+token},
  cache:'no-store',signal:AbortSignal.timeout(15000)})
 if(!r.ok)throw Error('DRIVE_DOWNLOAD_FAILED')
 const bytes=Buffer.from(await r.arrayBuffer())
 if(bytes.byteLength!==Number(file.size))throw Error('SOURCE_FILE_CHANGED_DURING_READ')
 const reread=await json<DriveFile>(token,url+'?fields=id,name,mimeType,modifiedTime,size,trashed')
 if(reread.trashed||reread.modifiedTime!==file.modifiedTime||reread.size!==file.size)
  throw Error('SOURCE_FILE_CHANGED_DURING_READ')
 return {file,bytes}
}
function stagingDb(){
 if(process.env.VERCEL_ENV!=='preview'||process.env.EXPRESS_PO_ALLOW_STAGING_WRITE!=='true')
  throw Error('STAGING_WRITE_DISABLED')
 const url=required('EXPRESS_PO_STAGING_DB_URL'),host=new URL(url)
 const prod=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL||
  'https://wtqubwdduzedmcvyhbgs.supabase.co').hostname
 if(host.protocol!=='https:'||!host.hostname.endsWith('.supabase.co')||
  host.hostname===prod||host.hostname==='wtqubwdduzedmcvyhbgs.supabase.co')
  throw Error('STAGING_DATABASE_IS_PRODUCTION_OR_INVALID')
 return createClient(url,required('EXPRESS_PO_STAGING_SERVICE_ROLE_KEY'),
  {auth:{persistSession:false,autoRefreshToken:false}})
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
  Object.keys(body).some(k=>k!=='mode')||
  !['dry_run','stage_only'].includes(String((body as {mode?:unknown}).mode)))
  return reply({error:'INVALID_REQUEST'},400)
 const mode=String((body as {mode:string}).mode)
 try{
  const token=await exchangeVercelOidcToken(request.headers.get('x-vercel-oidc-token')||'')
  const {file,bytes}=await latestCsv(token)
  const report=parseExpressPoReport(bytes)
  const fatal=report.qa.some(q=>['REPORT_COUNT_MISMATCH','REPORT_SUM_MISMATCH',
   'PO_HEADER_UNREADABLE','ORPHAN_ITEM'].includes(q.code))
  if(fatal&&mode==='stage_only')throw Error('SOURCE_REPORT_QA_BLOCK')
  const hold=new Set(report.summary.quarantinedDocuments)
  const documents=report.documents.map(d=>({...d,receiptStatus:'unverified',
   importDecision:hold.has(d.poNo)?'hold_qa':d.projectMapping==='unmapped'?
    'hold_mapping':'staged_verified'}))
  const response={source:{fileName:file.name,modifiedTime:file.modifiedTime,
    sha256:report.sourceSha256},summary:report.summary,qa:report.qa,
   decisions:{verified:documents.filter(d=>d.importDecision==='staged_verified').length,
    holdMapping:documents.filter(d=>d.importDecision==='hold_mapping').length,
    holdQa:documents.filter(d=>d.importDecision==='hold_qa').length},
   note:'Express received-all flag is not confirmed physical receipt.'}
  if(mode==='dry_run')return reply({...response,result:'DRY_RUN_ONLY_NO_WRITES'},200)
  const staging=stagingDb()
  const {data,error}=await staging.rpc('express_po_stage_import',{
   p_source_file:file.name,p_source_modified_at:file.modifiedTime,
   p_source_sha256:report.sourceSha256,p_documents:documents,p_qa:report.qa,
   p_summary:report.summary})
  if(error)throw Error('STAGING_IMPORT_FAILED')
  return reply({...response,result:'STAGED_ONLY',stagingRunId:data},200)
 }catch(e){
  // Do not expose supplier names, private file text or privileged backend messages.
  const message=e instanceof Error?e.message:''
  const code=/^(CONFIG_REQUIRED_|INVALID_SOURCE_|DRIVE_|SOURCE_|NO_VALID_|UNSUPPORTED_|INVALID_|MISSING_|STAGING_|EXPRESS_PO_|BLOCK_)/.test(message)
   ?message:'EXPRESS_PO_SYNC_FAILED'
  return reply({error:code},503)
 }
}
