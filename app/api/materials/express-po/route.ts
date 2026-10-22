import {NextRequest,NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {resolveAccessRole,canAccessPath} from '@/lib/accessControl'
import {readPermissionSnapshot} from '@/lib/permissionServer'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=30
const HEADERS={'cache-control':'private, no-store'}
const respond=(data:unknown,status:number)=>NextResponse.json(data,{status,headers:HEADERS})
const PAGE_SIZE=50
const clean=(v:string|null,max=120)=>String(v||'').trim().slice(0,max)
const pattern=/^(AV-P(?:2|3|6|7|8|9|10)|CONDO-[AB]|MIRAGE|HENNESSY)$/
const searchLiteral=(v:string)=>v.replace(/[\\%_]/g,'\\$&')
export async function GET(request:NextRequest){
 if(process.env.EXPRESS_PO_DISPLAY_ENABLED!=='true')
  return respond({error:'EXPRESS_PO_DISPLAY_DISABLED'},503)
 const authorization=request.headers.get('authorization')||''
 const token=authorization.toLowerCase().startsWith('bearer ')?authorization.slice(7).trim():''
 if(!token)return respond({error:'UNAUTHORIZED'},401)
 const client=createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL||'https://wtqubwdduzedmcvyhbgs.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'',
  {global:{headers:{Authorization:'Bearer '+token}},
   auth:{persistSession:false,autoRefreshToken:false}}
 )
 const {data:{user},error:authError}=await client.auth.getUser(token)
 if(authError||!user)return respond({error:'UNAUTHORIZED'},401)
 const {data:profile,error:profileError}=await client.from('profiles')
  .select('role,active').eq('user_id',user.id).maybeSingle()
 if(profileError||!profile?.active)return respond({error:'FORBIDDEN'},403)
 const role=resolveAccessRole(profile.role,user.id)
 try{
  const matrix=await readPermissionSnapshot(client)
  const grant=role&&matrix.rows?.find(p=>p.role===role&&p.module==='procurement')
  if(!grant||grant.level==='none'||!canAccessPath(role,'/materials',matrix))
   return respond({error:'FORBIDDEN'},403)
 }catch{return respond({error:'PERMISSION_CHECK_UNAVAILABLE'},503)}
 const search=request.nextUrl.searchParams
 const n=Number(search.get('page')||'0')
 if(!Number.isSafeInteger(n)||n<0||n>1000)return respond({error:'INVALID_PAGE'},400)
 const project=clean(search.get('project'),24)
 if(project&&!pattern.test(project))return respond({error:'INVALID_PROJECT'},400)
 const query=clean(search.get('q'))
 const docNo=clean(search.get('docNo'),16)
 const docGroup=clean(search.get('docGroup'),8)
 if(docNo && (!/^(PO|PL|PR|PC)\d{6,9}[A-Z]?$/.test(docNo)||
  !['PO_PL','PR_PC'].includes(docGroup)))return respond({error:'INVALID_DOCUMENT'},400)
 if(!docNo&&docGroup)return respond({error:'INVALID_DOCUMENT'},400)
 try{
  const {data:batch,error:batchError}=await client.from('express_register_runs')
   .select('id,source_fingerprint,source_files,document_count,line_count,review_count,completed_at')
   .eq('state','complete').order('completed_at',{ascending:false}).limit(1).maybeSingle()
  if(batchError)throw batchError
  if(!batch)return respond({status:'no_import',source:null,documents:[],items:[],count:0},200)
  if(docNo){
   const {data,count,error}=await client.from('express_register_rows')
    .select('line_seq,item_code,description,quantity,unit,unit_price,line_amount',{count:'exact'})
    .eq('batch_id',batch.id).eq('document_group',docGroup).eq('document_no',docNo)
    .gt('line_seq',0).order('line_seq').range(n*200,(n+1)*200-1)
   if(error)throw error
   return respond({status:'verified_register',source:batch,items:data||[],count:count||0,
    receiptEvidence:'unverified'},200)
  }
  let read=client.from('express_register_rows').select(
   'document_group,document_no,document_date,supplier,plot_codes,qa_status,source_url,grand_total',{count:'exact'}
  ).eq('batch_id',batch.id).eq('line_seq',0)
  if(project)read=read.contains('plot_codes',[project])
  if(query)read=read.ilike('search_text','%'+searchLiteral(query)+'%')
  const {data,count,error}=await read.order('document_no').range(n*PAGE_SIZE,(n+1)*PAGE_SIZE-1)
  if(error)throw error
  const documents=(data||[]).map(row=>({...row,
   source_url:row.source_url?.startsWith('https://drive.google.com/file/d/')?row.source_url:null,
   receiptEvidence:'unverified'}))
  return respond({status:'verified_register',source:batch,documents,count:count||0,
    page:n,pageSize:PAGE_SIZE,receiptEvidence:'unverified'},200)
 }catch{
  return respond({error:'EXPRESS_REGISTER_READ_FAILED'},503)
 }
}
