import type {SupabaseClient} from '@supabase/supabase-js'

type Result={status:'PARTIAL'|'UNVERIFIED';checks:{name:string;status:string;details?:unknown}[];
  note:string}
export async function inspectSync(client:SupabaseClient):Promise<Result>{
  const {data,error}=await client.from('drive_sync_runs')
    .select('sync_type,source_file,source_sheet,rows_read,rows_written,status,created_at')
    .order('created_at',{ascending:false}).limit(20)
  if(error)return {status:'UNVERIFIED',checks:[{name:'supabase_sync_log',status:'READ_FAILED'}],
    note:'No source-to-Web verification performed; no data written.'}
  return {status:'PARTIAL',checks:[{
    name:'supabase_sync_log',status:'READ_OK',
    details:{sampleSize:data?.length||0,latestAt:data?.[0]?.created_at??null,
      latestRuns:(data||[]).map(r=>({type:r.sync_type,source:r.source_file,sheet:r.source_sheet,
        read:r.rows_read,written:r.rows_written,status:r.status,at:r.created_at}))}
  }],note:'Supabase log only; Drive, Apps Script trigger, source rows, and Web UI were NOT verified.'}
}
export async function inspectProduction():Promise<Result>{
  const checks:Result['checks']=[]
  try{
    const github=await fetch('https://api.github.com/repos/pkraiwit2614-web/3kings-site-report/branches/main',
      {headers:{accept:'application/vnd.github+json'},cache:'no-store',signal:AbortSignal.timeout(10000)})
    if(!github.ok)throw Error('github read failed')
    const content=await github.json() as {commit?:{sha?:string}}
    const sha=content.commit?.sha
    if(!sha||!/^([a-f0-9]{40})$/.test(sha))throw Error('invalid GitHub SHA')
    checks.push({name:'github_main',status:'READ_OK',details:{sha}})
    const token=process.env.AGENT_VERCEL_READONLY_TOKEN
    const project=process.env.AGENT_VERCEL_PROJECT_ID
    if(token&&project){
      const endpoint=new URL('https://api.vercel.com/v6/deployments')
      endpoint.searchParams.set('projectId',project)
      endpoint.searchParams.set('target','production')
      endpoint.searchParams.set('limit','1')
      if(process.env.AGENT_VERCEL_TEAM_ID)endpoint.searchParams.set('teamId',process.env.AGENT_VERCEL_TEAM_ID)
      const r=await fetch(endpoint,{headers:{Authorization:'Bearer '+token},cache:'no-store',
        signal:AbortSignal.timeout(10000)})
      if(!r.ok)throw Error('vercel read failed')
      const data=await r.json() as {deployments?:{id:string;state:string;meta?:{githubCommitSha?:string}}[]}
      const d=data.deployments?.[0]
      checks.push({name:'vercel_production',status:d?'READ_OK':'NO_DEPLOYMENT',
        details:d?{deploymentId:d.id,state:d.state,sha:d.meta?.githubCommitSha||null,
          matchesMain:d.meta?.githubCommitSha===sha}:undefined})
    }else checks.push({name:'vercel_production',status:'UNCONFIGURED'})
  }catch{checks.push({name:'remote_source',status:'READ_FAILED'})}
  return {status:checks.some(c=>c.status==='READ_FAILED')?'UNVERIFIED':'PARTIAL',checks,
    note:'Read-only preliminary status. Supabase RLS/RPC, production login, key pages and browser smoke NOT verified.'}
}

/** SOP 02: preliminary source inventory only. Flow and Report UI must be checked before reconciliation. */
export async function inspectDefectCounts(client:SupabaseClient):Promise<Result>{
  const [rooms,works,members]=await Promise.all([
    client.from('condo_room_status').select('room_no,building,status_group,synced_at').limit(1000),
    client.from('defect_work_order_snapshot').select('work_id,room_group,building,work_status,source_active,imported_at').limit(1000),
    client.from('hotel_room_group_members').select('room_no,group_key').limit(1000)
  ])
  if(rooms.error||works.error||members.error||!rooms.data||!works.data||!members.data)
    return {status:'UNVERIFIED',checks:[{name:'defect_source_inventory',status:'READ_FAILED'}],
      note:'Insufficient source access. No Defect total or change inferred.'}
  const roomNames=new Set(rooms.data.map(r=>String(r.room_no||'')).filter(Boolean))
  const uniqueWorks=new Set(works.data.map(w=>String(w.work_id||'')).filter(Boolean))
  const mapped=members.data.filter(m=>roomNames.has(String(m.room_no)))
  return {status:'PARTIAL',checks:[
    {name:'room_snapshot',status:'READ_OK',details:{physicalRoomRows:rooms.data.length,uniqueRoomIds:roomNames.size}},
    {name:'work_order_snapshot',status:'READ_OK',details:{rows:works.data.length,uniqueWorkIds:uniqueWorks.size}},
    {name:'combine_mapping',status:'READ_OK',details:{mappedPhysicalRooms:mapped.length,
      distinctGroups:new Set(mapped.map(m=>String(m.group_key||''))).size}}
  ],note:'Inventory only, not reconciled counts. Flow, Report, Excel, Good aliases, status buckets and Combine group identity must be compared against actual source before declaring any discrepancy.'}
}
/** SOP 04: age candidates; never auto-close or infer that hotel has accepted a room. */
export async function inspectDefectSevenDays(client:SupabaseClient,clock=new Date()):Promise<Result>{
  const {data,error}=await client.from('defect_work_order_snapshot')
    .select('work_id,room_group,received_date,work_status,source_active,web_completed_at,imported_at')
    .limit(1000)
  if(error||!data)return {status:'UNVERIFIED',checks:[{name:'work_order_dates',status:'READ_FAILED'}],
    note:'Cannot verify Defect ageing or hotel follow-up.'}
  const bangkokDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',
    month:'2-digit',day:'2-digit'}).format(clock)
  const todayEpoch=Date.parse(bangkokDate+'T00:00:00Z')
  if(!Number.isFinite(todayEpoch))return {status:'UNVERIFIED',checks:[],note:'Bangkok date unavailable'}
  const candidates=data.filter(r=>{
    if(!r.source_active||r.work_status!=='ยังไม่เริ่ม'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(r.received_date||'')))return false
    const stamp=Date.parse(r.received_date+'T00:00:00Z')
    return Number.isFinite(stamp)&&todayEpoch-stamp>7*86400000
  }).map(r=>({workId:r.work_id,roomGroup:r.room_group,receivedDate:r.received_date}))
  return {status:'PARTIAL',checks:[{name:'open_work_age_candidates',status:'REVIEW_REQUIRED',
    details:{bangkokDate,sourceRows:data.length,candidateCount:candidates.length,candidates:candidates.slice(0,100)}}],
    note:'Candidates only: Work Order source_active and ยังไม่เริ่ม are not proof of current Defect status. No hotel post-completion Defect history, Combine pairing, or seven-day implicit closure verified. No rooms closed.'}
}
