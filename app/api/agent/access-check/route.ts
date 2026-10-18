import {NextRequest,NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {OWNER_USER_ID,resolveAccessRole} from '@/lib/accessControl'
import {readPermissionSnapshot} from '@/lib/permissionServer'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const HEADERS={'cache-control':'no-store, private'}
function respond(data:unknown,status:number){return NextResponse.json(data,{status,headers:HEADERS})}

export async function POST(request:NextRequest){
  // Independent diagnostic: no Google Cloud exchange and no Agent activation/write path.
  if(request.headers.get('content-type')?.toLowerCase().includes('application/json')){
    let body:unknown
    try{body=await request.json()}catch{return respond({error:'INVALID_JSON'},400)}
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==0)
      return respond({error:'BLOCK_UNSUPPORTED_FIELD'},400)
  } else if(request.headers.has('content-type')){
    return respond({error:'UNSUPPORTED_CONTENT_TYPE'},415)
  }
  const auth=request.headers.get('authorization')||''
  const jwt=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():''
  if(!jwt)return respond({ok:false,code:'UNAUTHORIZED'},401)
  const client=createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL||'https://wtqubwdduzedmcvyhbgs.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX',
    {global:{headers:{Authorization:'Bearer '+jwt}},auth:{persistSession:false,autoRefreshToken:false}}
  )
  const {data:{user},error}=await client.auth.getUser(jwt)
  if(error||!user)return respond({ok:false,code:'UNAUTHORIZED'},401)
  // Return the same generic refusal for any authenticated non-owner or inactive identity.
  if(user.id!==OWNER_USER_ID)return respond({ok:false,code:'FORBIDDEN'},403)
  const {data:profile,error:profileError}=await client.from('profiles')
    .select('role,active').eq('user_id',user.id).maybeSingle()
  if(profileError||!profile?.active||resolveAccessRole(profile.role,user.id)!=='owner')
    return respond({ok:false,code:'FORBIDDEN'},403)
  try{
    const matrix=await readPermissionSnapshot(client)
    if(!matrix.rows.some(p=>p.role==='owner'&&p.module==='reconciliation'&&p.level!=='none'))
      return respond({ok:false,code:'FORBIDDEN_MATRIX'},403)
  }catch{return respond({ok:false,code:'PERMISSION_CHECK_UNAVAILABLE'},503)}
  return respond({ok:true,code:'OWNER_AUTHORIZATION_VERIFIED',
    environment:process.env.VERCEL_ENV||'unknown',
    agentEnabled:process.env.VERCEL_ENV==='production'?
      process.env.AGENT_PRODUCTION_ENABLED==='true':false,
    note:'Authentication and RLS-backed permission preflight only. No Google STS or SOP read performed.'},200)
}
