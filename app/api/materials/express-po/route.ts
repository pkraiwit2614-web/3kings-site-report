import {NextRequest,NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {resolveAccessRole,canAccessPath} from '@/lib/accessControl'
import {readPermissionSnapshot} from '@/lib/permissionServer'
import {exchangeVercelOidcToken} from '@/lib/agentGoogleDrive'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=30
const HEADERS={'cache-control':'private, no-store'}
const respond=(data:unknown,status:number)=>NextResponse.json(data,{status,headers:HEADERS})
type SheetCells={values?:string[][]}
type SheetMeta={properties?:{title?:string}}
type ImportedPo={
 poNo:string;orderedDate:string;supplier:string;subtotal:string;vat:string;total:string;
 projectCodes:string[];decision:'staged_verified'|'hold_mapping'|'hold_qa';
 receiptEvidence:'unverified';source:string;itemCount:number
}
export async function GET(request:NextRequest){
 // Strictly a read-only separate view; no fallback to public Google Sheets or client credentials.
 if(process.env.EXPRESS_PO_DISPLAY_ENABLED!=='true')
  return respond({error:'EXPRESS_PO_DISPLAY_DISABLED'},503)
 const authorization=request.headers.get('authorization')||''
 const token=authorization.toLowerCase().startsWith('bearer ')?authorization.slice(7).trim():''
 if(!token)return respond({error:'UNAUTHORIZED'},401)
 const client=createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL||'https://wtqubwdduzedmcvyhbgs.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX',
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
  const grant=role&&matrix.rows?.find(p=>p.role===role&&p.module==='materials')
  if(!grant||grant.level==='none'||!canAccessPath(role,'/materials',matrix))
   return respond({error:'FORBIDDEN'},403)
 }catch{return respond({error:'PERMISSION_CHECK_UNAVAILABLE'},503)}
 const sheetId=String(process.env.EXPRESS_PO_STAGING_SHEET_ID||'').trim()
 if(!/^[a-zA-Z0-9_-]{25,100}$/.test(sheetId))
  return respond({error:'EXPRESS_PO_SHEET_UNCONFIGURED'},503)
 try{
  // Workload Identity enforces the current environment and production enable gate;
  // this service token is Drive/Sheets read-only and is never sent to the browser.
  const googleToken=await exchangeVercelOidcToken(request.headers.get('x-vercel-oidc-token')||'')
  const base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sheetId)
  const get=async <T>(path:string):Promise<T>=>{
   const res=await fetch(base+path,{headers:{Authorization:'Bearer '+googleToken},
    cache:'no-store',signal:AbortSignal.timeout(10000)})
   if(!res.ok)throw Error('SHEETS_READ_FAILED')
   return res.json() as Promise<T>
  }
  const meta=await get<SheetMeta>('?fields=properties(title)')
  if(meta.properties?.title!=='Express_PO_Preview_Staging_2026-10-19')
   throw Error('SHEETS_ID_MISMATCH')
  const [runData,docData]=await Promise.all([
   get<SheetCells>('/values/'+encodeURIComponent("'Runs'!A1:H1000")),
   get<SheetCells>('/values/'+encodeURIComponent("'Documents'!A1:N1000"))
  ])
  const runRows=runData.values||[],docRows=docData.values||[]
  if(runRows[0]?.[0]!=='Source SHA256'||docRows[0]?.[1]!=='PO Number')
   throw Error('SHEETS_HEADER_MISMATCH')
  const last=runRows.slice(1).filter(row=>/^[a-f0-9]{64}$/.test(row[0]||'')).at(-1)
  if(!last)return respond({status:'no_import',documents:[],source:null},200)
  const sourceHash=last[0]
  const rows=docRows.slice(1).filter(row=>row[0]===sourceHash)
  const declared=Number(last[4])
  if(!Number.isSafeInteger(declared)||declared!==rows.length||rows.length>500)
   throw Error('SHEETS_COUNT_MISMATCH')
  const seen=new Set<string>()
  const docs:ImportedPo[]=rows.map(row=>{
   const poNo=String(row[1]||'')
   if(!/^(PO\d{9}|PL\d{7}[A-Z]?)$/.test(poNo)||seen.has(poNo))throw Error('INVALID_SHEET_PO')
   seen.add(poNo)
   const decision=row[10]
   if(!['staged_verified','hold_mapping','hold_qa'].includes(decision))
    throw Error('INVALID_IMPORT_DECISION')
   return {poNo,orderedDate:String(row[2]||''),supplier:String(row[4]||''),
    subtotal:String(row[5]||''),vat:String(row[6]||''),total:String(row[7]||''),
    projectCodes:String(row[9]||'').split('|').map(s=>s.trim()).filter(Boolean),
    decision:decision as ImportedPo['decision'],receiptEvidence:'unverified',source:String(last[1]||''),
    itemCount:Number(row[13]||0)}
  })
  return respond({status:'staged_read_only',source:{
   fileName:String(last[1]||''),fileModifiedAt:String(last[2]||''),
   importedAt:String(last[3]||''),hash:sourceHash},
   documents:docs,counts:{documents:docs.length,items:Number(last[5]||0),
    holdQa:docs.filter(d=>d.decision==='hold_qa').length,
    holdMapping:docs.filter(d=>d.decision==='hold_mapping').length},
   note:'Report-only PO evidence; no materials or receipt status writeback.'},200)
 }catch{
  return respond({error:'EXPRESS_PO_READ_FAILED'},503)
 }
}
