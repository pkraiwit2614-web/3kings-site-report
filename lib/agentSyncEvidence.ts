import type {SupabaseClient} from '@supabase/supabase-js'

type Check={name:string;status:string;details?:unknown}
type SyncEvidence={status:'PARTIAL'|'UNVERIFIED';checks:Check[];note:string}
type Run={sync_type?:string;source_file?:string|null;source_sheet?:string|null;
  rows_read?:number|null;rows_written?:number|null;status?:string|null;created_at?:string|null}
type Snapshot={table:string;order:string;columns:string}
const PIPELINES=['schedule','materials','defects','photos'] as const
const SNAPSHOTS:Snapshot[]=[
  {table:'site_operations_entries',order:'synced_at',columns:'synced_at,work_date,source_file_id,source_sheet'},
  {table:'materials',order:'updated_at',columns:'updated_at,source_sheet,source_row'},
  {table:'procurement_items',order:'updated_at',columns:'updated_at,source_sheet,source_row'},
  {table:'condo_room_status',order:'synced_at',columns:'synced_at,source_modified_at,room_no'},
  {table:'defect_work_order_snapshot',order:'imported_at',columns:'imported_at,source_modified_at,work_id'}
]
const LOG_COLUMNS='sync_type,source_file,source_sheet,rows_read,rows_written,status,created_at'
export function classifySyncRun(rows:Run[],clock:Date):{
  sampleSize:number;latestAt:string|null;latestStatus:string|null;rowsRead:number|null;
  rowsWritten:number|null;failureCount:number;hoursSinceLatest:number|null;
  zeroWritesProvesNoChange:boolean
}{
 const latest=rows[0]
 const stamp=latest?.created_at?Date.parse(latest.created_at):NaN
 const diff=Number.isFinite(stamp)?(clock.getTime()-stamp)/3600000:NaN
 return {
  sampleSize:rows.length,latestAt:latest?.created_at||null,
  latestStatus:latest?.status||null,rowsRead:latest?.rows_read??null,
  rowsWritten:latest?.rows_written??null,
  failureCount:rows.filter(r=>['failed','error','failure'].includes(String(r.status||'').toLowerCase())).length,
  hoursSinceLatest:Number.isFinite(diff)&&diff>=0?Math.round(diff*10)/10:null,
  zeroWritesProvesNoChange:false
 }
}
export async function inspectSyncEvidence(client:SupabaseClient,clock=new Date()):Promise<SyncEvidence>{
  // Read-only RLS-bound Supabase queries. Never invoke Drive writes, import RPCs, GAS, migrations or cron.
  const checks:Check[]=[]
  const logResults=await Promise.all(PIPELINES.map(async type=>{
    try {
      const {data,error}=await client.from('drive_sync_runs').select(LOG_COLUMNS)
        .eq('sync_type',type).order('created_at',{ascending:false}).limit(12)
      if(error||!Array.isArray(data))throw new Error('read failed')
      return {type,ok:true,rows:data as Run[]}
    }catch{return {type,ok:false,rows:[] as Run[]}}
  }))
  for(const r of logResults)checks.push({
    name:'sync_log_'+r.type,status:!r.ok?'READ_FAILED':r.rows.length?'READ_OK':'NO_LOG_ROWS',
    details:r.ok?classifySyncRun(r.rows,clock):undefined
  })

  // Snapshot timestamps are independent observational data, NOT proof of Drive-to-Web matching.
  const snapshots=await Promise.all(SNAPSHOTS.map(async source=>{
    try {
      const {data,error}=await client.from(source.table).select(source.columns)
        .order(source.order,{ascending:false}).limit(1)
      if(error||!Array.isArray(data))throw new Error('read failed')
      const first=data[0] as unknown as Record<string,unknown>|undefined
      return {source,ok:true,latest:first?String(first[source.order]||'')||null:null,hasRows:data.length>0}
    }catch{return {source,ok:false,latest:null,hasRows:false}}
  }))
  for(const r of snapshots)checks.push({
    name:'db_snapshot_'+r.source.table,
    status:!r.ok?'READ_FAILED':r.hasRows?'DB_TIMESTAMP_ONLY':'NO_ROWS',
    details:r.ok?{latestDbTimestamp:r.latest,observedField:r.source.order,sourceMatched:false}:undefined
  })
  for(const name of ['drive_source_file_metadata','apps_script_trigger_and_execution',
    'source_vs_parsed_vs_written_vs_verified','authenticated_web_ui_readback'])
    checks.push({name,status:'NOT_VERIFIED'})
  const succeeded=checks.some(c=>['READ_OK','DB_TIMESTAMP_ONLY'].includes(c.status))
  return {
    status:succeeded?'PARTIAL':'UNVERIFIED',
    checks,
    note:'Multi-pipeline Supabase log samples and independent DB snapshot timestamps only. '+
      'Logs may be absent or show zero writes for a valid no-op; neither success nor DB timestamps prove source parity. '+
      'Drive Excel/Sheets actual rows, Apps Script triggers/executions and authenticated Web UI remain NOT VERIFIED. '+
      'No source writes, reimports, trigger changes, status edits or database mutations performed.'
  }
}
