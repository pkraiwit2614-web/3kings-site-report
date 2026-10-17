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
