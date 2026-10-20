import {NextRequest,NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {OWNER_USER_ID,resolveAccessRole} from '@/lib/accessControl'
import {readPermissionSnapshot} from '@/lib/permissionServer'
import {AgentGateError,evaluateSopGate} from '@/lib/agentCore'
import {createLiveSopSource} from '@/lib/agentGoogleDrive'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const HEADERS={'cache-control':'no-store, private'}
function respond(data:unknown,status:number){return NextResponse.json(data,{status,headers:HEADERS})}

export async function POST(request:NextRequest){
  // Only an Owner-initiated Production SOP 13 preflight. This cannot enable or operate Agent.
  if(process.env.VERCEL_ENV!=='production')return respond({error:'BLOCK_NOT_PRODUCTION'},404)
  if(!request.headers.get('content-type')?.toLowerCase().includes('application/json'))
    return respond({error:'UNSUPPORTED_CONTENT_TYPE'},415)
  let body:unknown
  try{body=await request.json()}catch{return respond({error:'INVALID_JSON'},400)}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==0)
    return respond({error:'BLOCK_UNSUPPORTED_FIELD'},400)
  const bearer=request.headers.get('authorization')||''
  const token=bearer.toLowerCase().startsWith('bearer ')?bearer.slice(7).trim():''
  if(!token)return respond({error:'UNAUTHORIZED'},401)
  const client=createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL||'https://wtqubwdduzedmcvyhbgs.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX',
    {global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}}
  )
  const {data:{user},error}=await client.auth.getUser(token)
  if(error||!user)return respond({error:'UNAUTHORIZED'},401)
  if(user.id!==OWNER_USER_ID)return respond({error:'FORBIDDEN'},403)
  const {data:profile,error:profileError}=await client.from('profiles')
    .select('role,active').eq('user_id',user.id).maybeSingle()
  if(profileError||!profile?.active||resolveAccessRole(profile.role,user.id)!=='owner')
    return respond({error:'FORBIDDEN'},403)
  try{
    const matrix=await readPermissionSnapshot(client)
    if(!matrix.rows.some(p=>p.role==='owner'&&p.module==='reconciliation'&&p.level!=='none'))
      return respond({error:'FORBIDDEN_MATRIX'},403)
  }catch{return respond({error:'PERMISSION_CHECK_UNAVAILABLE'},503)}
  try{
    // probeOnly=true is a server-owned literal, NEVER accepted from request.
    // The normal Agent route still requires AGENT_PRODUCTION_ENABLED=true.
    const source=await createLiveSopSource(request.headers.get('x-vercel-oidc-token')||'',true)
    const gate=await evaluateSopGate(13,'preflight',source)
    if(!gate.ok)return respond({gate:{ok:false,code:gate.code},note:'No data changed.'},424)
    return respond({gate:{ok:true,code:gate.code,sop:gate.sop&&{
      fileId:gate.sop.fileId,modifiedAt:gate.sop.modifiedAt,
      sha256Prefix:gate.sop.sha256.slice(0,12)
    }},note:'Production OIDC to Google Drive readback, no Agent execution, no mutation.'},200)
  }catch(e){return respond({gate:{ok:false,code:e instanceof AgentGateError?e.code:'BLOCK_SOP_SOURCE_UNAVAILABLE'},
    note:'Production probe failed closed; Agent remains disabled.'},503)}
}
