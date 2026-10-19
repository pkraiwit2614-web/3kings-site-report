import {NextRequest,NextResponse} from 'next/server'
import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {OWNER_USER_ID,resolveAccessRole} from '@/lib/accessControl'
import {readPermissionSnapshot} from '@/lib/permissionServer'
import {hotelRoomKey,hotelRoomMembers,normalizeHotelRoom} from '@/lib/hotelRoomGroups'
import {createLiveSopSource} from '@/lib/agentGoogleDrive'
import {evaluateSopGate} from '@/lib/agentCore'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const STATUS='Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว'
const GROUP='Hotel - Checked Complete'
const HEADERS={'cache-control':'no-store, private'}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ROOM=/^[AB][0-9]{3}$/
type Body={commandId?:unknown;action?:unknown;rooms?:unknown;requestId?:unknown;confirmation?:unknown}
function response(value:unknown,status:number){return NextResponse.json(value,{status,headers:HEADERS})}
function roomsFrom(value:unknown):{groups:string[];roomIds:string[]}|null{
  if(!Array.isArray(value)||value.length<1||value.length>25)return null
  const groups:string[]=[]
  const groupKeys=new Set<string>()
  const rooms=new Set<string>()
  for(const item of value){
    if(typeof item!=='string'||item.length>24)return null
    const room=normalizeHotelRoom(item)
    if(!ROOM.test(room))return null
    const key=hotelRoomKey(room)
    if(groupKeys.has(key))return null // don't double-count a Combine group
    groupKeys.add(key);groups.push(key)
    for(const member of hotelRoomMembers(room))rooms.add(member)
  }
  if(rooms.size>50)return null
  return {groups,roomIds:[...rooms].sort()}
}
export async function POST(request:NextRequest){
  if(Number(request.headers.get('content-length')||0)>12000)return response({error:'REQUEST_TOO_LARGE'},413)
  let body:Body
  try{body=await request.json()}catch{return response({error:'INVALID_JSON'},400)}
  if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).some(k=>!['commandId','action','rooms','requestId','confirmation'].includes(k)))
    return response({error:'BLOCK_UNSUPPORTED_FIELD'},400)
  if(body.commandId!==1||!['preview','execute','status'].includes(String(body.action)))
    return response({error:'BLOCK_COMMAND_NOT_SUPPORTED'},400)
  const bearer=request.headers.get('authorization')||''
  const jwt=bearer.toLowerCase().startsWith('bearer ')?bearer.slice(7).trim():''
  if(!jwt)return response({error:'UNAUTHORIZED'},401)
  const client=createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL||'https://wtqubwdduzedmcvyhbgs.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'',
    {global:{headers:{Authorization:'Bearer '+jwt}},auth:{persistSession:false,autoRefreshToken:false}}
  )
  const {data:{user},error}=await client.auth.getUser(jwt)
  if(error||!user||user.id!==OWNER_USER_ID)return response({error:'FORBIDDEN'},403)
  const {data:profile,error:profileError}=await client.from('profiles').select('role,active')
    .eq('user_id',user.id).maybeSingle()
  if(profileError||!profile?.active||resolveAccessRole(profile.role,user.id)!=='owner')
    return response({error:'FORBIDDEN'},403)
  try{
    const matrix=await readPermissionSnapshot(client)
    if(!matrix.rows.some(r=>r.role==='owner'&&r.module==='defect'&&r.level==='manage'))
      return response({error:'FORBIDDEN_MATRIX'},403)
  }catch{return response({error:'PERMISSION_CHECK_UNAVAILABLE'},503)}
  // Each invocation proves that the real current SOP 01 can be read at its current revision.
  let gate
  try{
    const source=await createLiveSopSource(request.headers.get('x-vercel-oidc-token')||'')
    gate=await evaluateSopGate(1,'preflight',source)
  }catch{return response({error:'BLOCK_LIVE_SOP_UNAVAILABLE'},503)}
  if(!gate.ok)return response({error:gate.code},424)
  if(body.action==='status'){
    if(typeof body.requestId!=='string'||!UUID.test(body.requestId))
      return response({error:'INVALID_REQUEST_ID'},400)
    const {data:job,error:jobError}=await client.from('defect_agent_requests').select('*')
      .eq('request_id',body.requestId).maybeSingle()
    if(jobError)return response({error:'STATUS_UNAVAILABLE'},503)
    if(!job)return response({error:'REQUEST_NOT_FOUND'},404)
    const roomIds=job.room_ids as string[]
    const workIds=job.work_ids as string[]
    const [roomSync,workSync,roomState]=await Promise.all([
      Promise.all(roomIds.map(async room=>({room,...await client.rpc('defect_writeback_status',{p_room_no:room})}))),
      workIds.length?client.from('defect_work_order_snapshot')
        .select('work_id,writeback_state,web_completed_at').in('work_id',workIds):
        Promise.resolve({data:[],error:null}),
      client.from('condo_room_status').select('room_no,current_status,status_group').in('room_no',roomIds),
    ])
    if(roomSync.some(r=>r.error)||workSync.error||roomState.error)
      return response({error:'SYNC_STATUS_UNAVAILABLE'},503)
    const statusByRoom=new Map(roomSync.map(x=>[x.room,String(x.data?.state||'unknown')]))
    const statusByValue=new Map((roomState.data||[]).map(x=>[x.room_no,x]))
    const pendingRooms=roomIds.filter(room=>statusByRoom.get(room)!=='synced'||
      statusByValue.get(room)?.current_status!==STATUS||statusByValue.get(room)?.status_group!==GROUP)
    const pendingWork=(workSync.data||[]).filter(x=>x.writeback_state!=='synced')
    const missingWork=workIds.filter(id=>!(workSync.data||[]).some(x=>x.work_id===id))
    return response({ok:true,requestId:job.request_id,roomIds,workIds,
      status:!pendingRooms.length&&!pendingWork.length&&!missingWork.length?'verified':'pending_excel',
      pendingRooms,pendingWorkIds:[...pendingWork.map(x=>x.work_id),...missingWork],
      note:'Verified means the existing XLSX writeback acknowledgement RPCs confirmed source readback.'},200)
  }
  const targets=roomsFrom(body.rooms)
  if(!targets)return response({error:'INVALID_ROOM_GROUPS_OR_COMBINE'},400)
  const {data:rows,error:rowsError}=await client.from('condo_room_status')
    .select('room_no,hotel_participation,current_status,status_group,source_modified_at')
    .in('room_no',targets.roomIds)
  if(rowsError||!rows||rows.length!==targets.roomIds.length)
    return response({error:'ROOM_SOURCE_UNAVAILABLE'},424)
  if(rows.some(r=>r.hotel_participation!=='ร่วมโรงแรม'||!r.source_modified_at))
    return response({error:'HOTEL_OR_REVISION_CONFLICT'},409)
  const {data:workOrders,error:woError}=await client.from('defect_work_order_snapshot')
    .select('work_id,room_group,work_status,web_completed_at,source_active')
    .eq('source_active',true)
  if(woError)return response({error:'WORK_ORDER_SOURCE_UNAVAILABLE'},424)
  const activeWork=(workOrders||[]).filter(w=>
    String(w.room_group||'').match(/[AB][0-9]{3}/g)?.some(r=>targets.roomIds.includes(r))&&
    !w.web_completed_at&&!/เสร็จแล้ว|งดแจก|ยกเลิก/.test(String(w.work_status||'')))
  const changedRooms=rows.filter(r=>r.current_status!==STATUS||r.status_group!==GROUP)
    .map(r=>r.room_no).sort()
  if(body.action==='preview')return response({ok:true,requestId:randomUUID(),groups:targets.groups,
    roomIds:targets.roomIds,changedRooms,openWorkIds:activeWork.map(w=>w.work_id),
    awaitingExcel:false,gate:{code:gate.code,sopModifiedAt:gate.sop?.modifiedAt},
    executeEnabled:process.env.DEFECT_AGENT_EXECUTOR_ENABLED==='true'&&
      process.env.VERCEL_ENV==='preview'},200)
  if(body.confirmation!=='HOTEL_ENGINEER_ACCEPTED_CLOSE_ALL')
    return response({error:'EXPLICIT_HOTEL_ACCEPTANCE_REQUIRED'},400)
  if(typeof body.requestId!=='string'||!UUID.test(body.requestId))
    return response({error:'INVALID_REQUEST_ID'},400)
  // No Production execution until a separate reviewed release and explicit enablement.
  if(process.env.VERCEL_ENV!=='preview'||process.env.DEFECT_AGENT_EXECUTOR_ENABLED!=='true')
    return response({error:'EXECUTOR_DISABLED_IN_THIS_ENVIRONMENT'},503)
  const expected=Object.fromEntries(rows.map(r=>[r.room_no,r.source_modified_at]))
  const {data:result,error:rpcError}=await client.rpc('defect_agent_hotel_accepted_apply',{
    p_request_id:body.requestId,p_room_ids:targets.roomIds,p_expected:expected,
    p_user_agent:'3kings-agent-sop01'
  })
  if(rpcError||!result?.ok)return response({error:'ATOMIC_EXECUTION_REJECTED',
    reason:rpcError?.message||result?.error||'unknown'},409)
  return response({ok:true,requestId:body.requestId,roomIds:targets.roomIds,
    workIds:result.work_ids||[],status:'pending_excel',
    note:'DB committed; completion requires XLSX source readback and status verification.'},202)
}
