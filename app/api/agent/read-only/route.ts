import {NextRequest,NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {OWNER_USER_ID,resolveAccessRole} from '@/lib/accessControl'
import {readPermissionSnapshot} from '@/lib/permissionServer'
import {AgentGateError,resolveCommand,validateAction,evaluateSopGate,type AgentMode} from '@/lib/agentCore'
import {createLiveSopSource} from '@/lib/agentGoogleDrive'
import {inspectSync,inspectProduction,inspectDefectCounts,inspectDefectSevenDays} from '@/lib/agentReadOnlyChecks'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const HEADERS={'cache-control':'no-store, private'}
function respond(data:unknown,status:number){return NextResponse.json(data,{status,headers:HEADERS})}
export async function POST(request:NextRequest){
  // Separate read-only surface. Never accepts URLs, SQL, changes, or any write/deploy payload.
  let payload:unknown
  try{payload=await request.json()}catch{return respond({error:'INVALID_JSON'},400)}
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return respond({error:'INVALID_REQUEST'},400)
  const body=payload as Record<string,unknown>
  if(Object.keys(body).some(k=>!['commandId','mode'].includes(k)))return respond({error:'BLOCK_UNSUPPORTED_FIELD'},400)
  const mode=body.mode
  let command
  try{
    command=resolveCommand(body.commandId)
    validateAction(command,mode as AgentMode)
  }catch(e){return respond({error:e instanceof AgentGateError?e.code:'BLOCK_INVALID_REQUEST'},400)}
  const bearer=request.headers.get('authorization')||''
  const token=bearer.toLowerCase().startsWith('bearer ')?bearer.slice(7).trim():''
  if(!token)return respond({error:'UNAUTHORIZED'},401)
  const client=createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL||'https://wtqubwdduzedmcvyhbgs.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX',
    {global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}}
  )
  const {data:{user},error:authError}=await client.auth.getUser(token)
  if(authError||!user)return respond({error:'UNAUTHORIZED'},401)
  if(user.id!==OWNER_USER_ID)return respond({error:'FORBIDDEN'},403)
  const {data:profile,error:profileError}=await client.from('profiles')
    .select('role,active').eq('user_id',user.id).maybeSingle()
  if(profileError||!profile?.active||resolveAccessRole(profile.role,user.id)!=='owner')
    return respond({error:'FORBIDDEN'},403)
  // Fail closed if the live permission matrix is unavailable; no fallback to UI-only permissions.
  try{
    const matrix=await readPermissionSnapshot(client)
    if(!matrix.rows.some(p=>p.role==='owner'&&p.module==='reconciliation'&&p.level!=='none'))
      return respond({error:'FORBIDDEN_MATRIX'},403)
  }catch{return respond({error:'PERMISSION_CHECK_UNAVAILABLE'},503)}
  let source
  try{source=await createLiveSopSource()}
  catch(e){return respond({gate:{ok:false,commandId:command.number,code:e instanceof AgentGateError?e.code:'BLOCK_SOP_SOURCE_UNAVAILABLE'},inspection:null},503)}
  const gate=await evaluateSopGate(command.number,mode as AgentMode,source)
  if(!gate.ok)return respond({gate,inspection:null},424)
  if(mode==='preflight')return respond({gate,inspection:null,note:'Preflight only. No action executed or audit record persisted.'},200)
  const inspection=command.number===2?await inspectDefectCounts(client):command.number===4?await inspectDefectSevenDays(client):command.number===13?await inspectSync(client):await inspectProduction()
  return respond({gate,inspection,note:'Read-only checks. No source, database, trigger, or deployment mutation.'},200)
}
