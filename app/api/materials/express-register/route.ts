import {NextRequest,NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {resolveAccessRole,canAccessPath} from '@/lib/accessControl'
import {readPermissionSnapshot} from '@/lib/permissionServer'
import {expressDateISO,compareExpressDocumentsNewestFirst} from '@/lib/expressRegisterDisplay'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const HEADERS={'cache-control':'private, no-store'}
const respond=(data:unknown,status:number)=>NextResponse.json(data,{status,headers:HEADERS})
const SELECT='document_group,document_no,document_date,supplier,plot_codes,qa_status,grand_total,source_file,has_verified_project_override,project_evidence_url'

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
 try{
  const matrix=await readPermissionSnapshot(client)
  const materials=role&&matrix.rows?.find(p=>p.role===role&&p.module==='materials')
  const procurement=role&&matrix.rows?.find(p=>p.role===role&&p.module==='procurement')
  // Procurement history can include vendor rates: require BOTH existing view grants.
  if(!materials||materials.level==='none'||!procurement||procurement.level==='none'||
   !canAccessPath(role,'/materials',matrix)||!canAccessPath(role,'/procurement',matrix))
   return respond({error:'FORBIDDEN'},403)
 }catch{return respond({error:'PERMISSION_CHECK_UNAVAILABLE'},503)}

 const params=request.nextUrl.searchParams
 const pageText=params.get('page')||'0',group=params.get('group')||''
 const plot=params.get('plot')||'',q=(params.get('q')||'').trim()
 const view=params.get('view')||'',from=params.get('from')||'',to=params.get('to')||''
 const procurementView=view==='procurement'
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
   .select('id,completed_at,source_files,document_count,line_count,canceled_count,review_count')
   .eq('state','complete').order('completed_at',{ascending:false}).limit(1).maybeSingle()
  if(runError)return respond({error:'REGISTER_NOT_READY'},503)
  if(!latest)return respond({status:'no_import',documents:[],total:0,page,hasMore:false,latest:null},200)
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
    return respond({status:'read_only',latest:{
     completedAt:latest.completed_at,sourceFiles:latest.source_files,
     documentCount:latest.document_count,lineCount:latest.line_count,
     skippedCanceled:latest.canceled_count,reviewCount:latest.review_count},
     documents:rows||[],page,pageSize:limit,total,hasMore:(page+1)*limit<total,
     note:'Express source-only QA register. PO is not received; PR is not ordered.'},200)
  }

  // Procurement-only view: sort true document dates BEFORE pagination.
  // Express stores DD/MM/YY Buddhist-year text, which cannot be sorted lexically.
  const FETCH_CHUNK=1000,MAX_HEADERS=20000
  const headers:Array<{
   document_group:string;document_no:string;document_date:string|null;
   supplier:string|null;plot_codes:string[];qa_status:string;grand_total:number|null;
   source_file:string|null;has_verified_project_override?:boolean;
   project_evidence_url?:string|null
  }>=[]
  for(let offset=0;offset<MAX_HEADERS;offset+=FETCH_CHUNK){
   let headerQuery=client.from('express_register_effective_rows').select(SELECT)
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
  type Detail={document_group:string;document_no:string;line_seq:number;
   item_code:string|null;description:string|null;quantity:number|null;unit:string|null}
  const itemsByDocument=new Map<string,Detail[]>()
  const key=(group:string,no:string)=>group+'|'+no
  for(const row of selected)itemsByDocument.set(key(row.document_group,row.document_no),[])
  // Cap lookup batches below the source-observed maximum, and fail closed if truncated.
  for(let index=0;index<selected.length;index+=8){
   const selectedBatch=selected.slice(index,index+8)
   const {data,error}=await client.from('express_register_effective_rows')
    .select('document_group,document_no,line_seq,item_code,description,quantity,unit')
    .eq('batch_id',latest.id).gt('line_seq',0)
    .in('document_no',selectedBatch.map(row=>row.document_no))
    .order('document_no').order('line_seq').range(0,999)
   if(error||!data||data.length>=1000)return respond({error:'REGISTER_DETAILS_UNAVAILABLE'},503)
   for(const item of data){
    const list=itemsByDocument.get(key(item.document_group,item.document_no))
    if(list)list.push(item)
   }
  }
  return respond({status:'read_only',latest:{
   completedAt:latest.completed_at,sourceFiles:latest.source_files,
   documentCount:latest.document_count,lineCount:latest.line_count,
   skippedCanceled:latest.canceled_count,reviewCount:latest.review_count},
   documents:selected.map(row=>({...row,items:itemsByDocument.get(key(row.document_group,row.document_no))||[]})),
   page,pageSize:limit,total,hasMore:(page+1)*limit<total,
   note:'Express source-only QA register. Document type is derived from PO/PL/PR/PC prefix.'},200)
 }catch{return respond({error:'REGISTER_READ_FAILED'},503)}
}
