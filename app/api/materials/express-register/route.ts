import {NextRequest,NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {resolveAccessRole,canAccessPath} from '@/lib/accessControl'
import {readPermissionSnapshot} from '@/lib/permissionServer'
import {expressDateISO,compareExpressDocumentsNewestFirst} from '@/lib/expressRegisterDisplay'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const HEADERS={'cache-control':'private, no-store'}
const respond=(data:unknown,status:number)=>NextResponse.json(data,{status,headers:HEADERS})
const SELECT='document_group,document_no,document_date,supplier,plot_codes,qa_status,grand_total,source_file,source_url,has_verified_project_override,project_evidence_url,search_text'
const PROCUREMENT_SELECT=SELECT
// Independently checked against existing Excel Master on 2026-11-04.
// A future Express import is NOT automatically verified.
const RECONCILED_BATCH={
 id:'932a7527-0d24-4011-baf1-f88dac2fd977',
 sourceFingerprint:'6747a66b88622e300f45251120fccd4073d0b30a3556aba41732292ec5f1f0fa',
 documentCount:3768,lineCount:13288,asOf:'2026-11-04'
}

type ExpressHeader={document_group:string;document_no:string}
type ExpressItem={document_group:string;document_no:string;line_seq:number;item_code:string|null;description:string|null;quantity:number|null;unit:string|null}
type ExpressEvidence={document_type:string;document_no:string;drive_file_id:string;file_name:string;file_format:string;evidence_scope:string}

/** Read-only, user-JWT/RLS-bound Express historical register; never a procurement write route. */
export async function GET(request:NextRequest){
 if(process.env.EXPRESS_REGISTER_DISPLAY_ENABLED!=='true')
  return respond({error:'EXPRESS_REGISTER_DISPLAY_DISABLED'},503)

 const authorization=request.headers.get('authorization')||''
 const token=authorization.toLowerCase().startsWith('bearer ')?authorization.slice(7).trim():''
 if(!token)return respond({error:'UNAUTHORIZED'},401)
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 if(!url||!key)return respond({error:'DATA_CONFIG_UNAVAILABLE'},503)
 // No service-role key: the caller's JWT is deliberately used for every DB request.
 const client=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},
  auth:{persistSession:false,autoRefreshToken:false}})

 const {data:{user},error:authError}=await client.auth.getUser(token)
 if(authError||!user)return respond({error:'UNAUTHORIZED'},401)
 const {data:profile,error:profileError}=await client.from('profiles')
  .select('role,active').eq('user_id',user.id).maybeSingle()
 if(profileError||!profile?.active)return respond({error:'FORBIDDEN'},403)
 const role=resolveAccessRole(profile.role,user.id)
 // Procurement-only history uses the existing procurement VIEW grant.
 const procurementView=request.nextUrl.searchParams.get('view')==='procurement'
 try{
  const matrix=await readPermissionSnapshot(client)
  const materials=role&&matrix.rows?.find(p=>p.role===role&&p.module==='materials')
  const procurement=role&&matrix.rows?.find(p=>p.role===role&&p.module==='procurement')
  // Procurement view requires procurement permission. The unchanged Materials
  // view retains both grants; JWT and database RLS still apply to both.
  if(!procurement||procurement.level==='none'||!canAccessPath(role,'/procurement',matrix)||
   (!procurementView&&(!materials||materials.level==='none'||!canAccessPath(role,'/materials',matrix))))
   return respond({error:'FORBIDDEN'},403)
 }catch{return respond({error:'PERMISSION_CHECK_UNAVAILABLE'},503)}

 const params=request.nextUrl.searchParams
 const pageText=params.get('page')||'0',group=params.get('group')||''
 const plot=params.get('plot')||'',q=(params.get('q')||'').trim()
 const view=params.get('view')||'',from=params.get('from')||'',to=params.get('to')||''
 const validDate=(value:string)=>!value||(/^\d{4}-\d{2}-\d{2}$/.test(value)&&expressDateISO(value)===value)
 if((view!==''&&!procurementView)||!validDate(from)||!validDate(to)||
   (from&&to&&from>to)||(!procurementView&&(from||to))||
   !/^(0|[1-9]\d{0,4})$/.test(pageText)||
   (group!==''&&group!=='PO_PL'&&group!=='PR_PC')||
   plot.length>35||!/^[\w-]*$/.test(plot)||q.length>80)
  return respond({error:'INVALID_FILTER'},400)
 const page=Number(pageText),limit=50
 try{
  // Fail closed if the isolated migration is not present or no completed batch exists.
  const {data:latest,error:runError}=await client.from('express_register_runs')
   .select('id,completed_at,source_fingerprint,source_files,document_count,line_count,canceled_count,review_count')
   .eq('state','complete').order('completed_at',{ascending:false}).limit(1).maybeSingle()
  if(runError)return respond({error:'REGISTER_NOT_READY'},503)
  if(!latest)return respond({status:'no_import',documents:[],total:0,page,hasMore:false,latest:null,masterQa:{verified:false,asOf:null}},200)
  const masterQa=latest.id===RECONCILED_BATCH.id &&
   latest.source_fingerprint===RECONCILED_BATCH.sourceFingerprint &&
   latest.document_count===RECONCILED_BATCH.documentCount &&
   latest.line_count===RECONCILED_BATCH.lineCount
    ? {verified:true,asOf:RECONCILED_BATCH.asOf}
    : {verified:false,asOf:null}
  // Read related line descriptions and signed-file evidence ONLY for the selected page.
  // Keep original Express values/statuses and legacy Materials/Procurement tables read-only.
  const hydrate=async(selected:ExpressHeader[])=>{
   const itemsByDocument=new Map<string,ExpressItem[]>()
   const evidenceByDocument=new Map<string,ExpressEvidence[]>()
   const key=(group:string,no:string)=>group+'|'+no
   for(const row of selected){
    itemsByDocument.set(key(row.document_group,row.document_no),[])
    evidenceByDocument.set(key(row.document_group,row.document_no),[])
   }
   // Bounded RLS reads; a missing detail is an error, not a false "no items" claim.
   for(let index=0;index<selected.length;index+=8){
    const selectedBatch=selected.slice(index,index+8)
    const {data,error}=await client.from('express_register_effective_rows')
     .select('document_group,document_no,line_seq,item_code,description,quantity,unit')
     .eq('batch_id',latest.id).gt('line_seq',0)
     .in('document_no',selectedBatch.map(row=>row.document_no))
     .order('document_no').order('line_seq').range(0,999)
    if(error||!data||data.length>=1000)
     return {itemsByDocument,evidenceByDocument,error:'REGISTER_DETAILS_UNAVAILABLE'}
    for(const item of data){
     const list=itemsByDocument.get(key(item.document_group,item.document_no))
     if(list)list.push(item)
    }
   }
   if(selected.length){
    // Evidence links have exact document identity and existing procurement RLS.
    // Never infer that a quotation/PO belongs to a PC from the vendor name alone.
    const {data,error}=await client.from('procurement_evidence_links')
     .select('document_type,document_no,drive_file_id,file_name,file_format,evidence_scope')
     .in('document_no',[...new Set(selected.map(row=>row.document_no))])
    if(error||!data)return {itemsByDocument,evidenceByDocument,error:'REGISTER_EVIDENCE_UNAVAILABLE'}
    for(const doc of data){
     const group=/^(?:PO|PL)$/.test(doc.document_type)?'PO_PL':'PR_PC'
     const list=evidenceByDocument.get(key(group,doc.document_no))
     if(list&&doc.document_no.startsWith(doc.document_type))list.push(doc)
    }
   }
   return {itemsByDocument,evidenceByDocument,error:null}
  }
  // Security-invoker view resolves approved evidence mappings without changing raw Express batch rows.
  // If migration is absent, fail closed instead of silently displaying stale source mapping.
  if(!procurementView){
    let query=client.from('express_register_effective_rows').select(SELECT,{count:'exact'})
     .eq('batch_id',latest.id).eq('line_seq',0)
    if(group)query=query.eq('document_group',group)
    if(plot)query=query.contains('plot_codes',[plot])
    if(q)query=query.ilike('search_text','%'+q.replace(/[%_\\]/g,'\\$&')+'%')
    const {data:rows,error:rowError,count}=await query.order('document_group')
     .order('document_no').range(page*limit,page*limit+limit-1)
    if(rowError)return respond({error:'REGISTER_READ_FAILED'},503)
    const total=count??0
    const enriched=await hydrate(rows||[])
    if(enriched.error)return respond({error:enriched.error},503)
    return respond({status:'read_only',masterQa,latest:{
     completedAt:latest.completed_at,sourceFiles:latest.source_files,
     documentCount:latest.document_count,lineCount:latest.line_count,
     skippedCanceled:latest.canceled_count,reviewCount:latest.review_count},
     documents:(rows||[]).map(row=>({...row,
      items:enriched.itemsByDocument.get(row.document_group+'|'+row.document_no)||[],
      evidence:enriched.evidenceByDocument.get(row.document_group+'|'+row.document_no)||[]})),
     page,pageSize:limit,total,hasMore:(page+1)*limit<total,
     note:'Express source-only QA register. PO is not received; PR is not ordered.'},200)
  }

  // Procurement-only view: sort true document dates BEFORE pagination.
  // Express stores DD/MM/YY Buddhist-year text, which cannot be sorted lexically.
  const FETCH_CHUNK=1000,MAX_HEADERS=20000
  const headers:Array<{
   document_group:string;document_no:string;document_date:string|null;
   supplier:string|null;plot_codes:string[];qa_status:string;grand_total:number|null;
   source_file:string|null;has_verified_project_override?:boolean;
   project_evidence_url?:string|null;search_text?:string|null;source_url?:string|null
  }>=[]
  for(let offset=0;offset<MAX_HEADERS;offset+=FETCH_CHUNK){
   let headerQuery=client.from('express_register_effective_rows').select(PROCUREMENT_SELECT)
    .eq('batch_id',latest.id).eq('line_seq',0)
   if(group)headerQuery=headerQuery.eq('document_group',group)
   if(plot)headerQuery=headerQuery.contains('plot_codes',[plot])
   if(q)headerQuery=headerQuery.ilike('search_text','%'+q.replace(/[%_\\]/g,'\\$&')+'%')
   const {data,error}=await headerQuery.order('document_group').order('document_no')
    .range(offset,offset+FETCH_CHUNK-1)
   if(error)return respond({error:'REGISTER_READ_FAILED'},503)
   headers.push(...(data||[]))
   if((data||[]).length<FETCH_CHUNK)break
   if(offset+FETCH_CHUNK>=MAX_HEADERS)return respond({error:'REGISTER_TOO_LARGE'},503)
  }
  const matching=headers.filter(row=>{
   const date=expressDateISO(row.document_date)
   if(from&&(!date||date<from))return false
   if(to&&(!date||date>to))return false
   return true
  }).sort(compareExpressDocumentsNewestFirst)
  const total=matching.length
  const selected=matching.slice(page*limit,(page+1)*limit)
  const enriched=await hydrate(selected)
  if(enriched.error)return respond({error:enriched.error},503)
  return respond({status:'read_only',masterQa,latest:{
   completedAt:latest.completed_at,sourceFiles:latest.source_files,
   documentCount:latest.document_count,lineCount:latest.line_count,
   skippedCanceled:latest.canceled_count,reviewCount:latest.review_count},
   documents:selected.map(row=>({...row,
    items:enriched.itemsByDocument.get(row.document_group+'|'+row.document_no)||[],
    evidence:enriched.evidenceByDocument.get(row.document_group+'|'+row.document_no)||[]})),
   page,pageSize:limit,total,hasMore:(page+1)*limit<total,
   note:'Express source-only QA register. Document type is derived from PO/PL/PR/PC prefix.'},200)
 }catch{return respond({error:'REGISTER_READ_FAILED'},503)}
}
