import type {SupabaseClient} from '@supabase/supabase-js'

type Check={name:string;status:string;details?:unknown}
type SyncEvidence={status:'PARTIAL'|'UNVERIFIED';checks:Check[];note:string}
type Run={sync_type?:string;source_file?:string|null;source_sheet?:string|null;
  rows_read?:number|null;rows_written?:number|null;status?:string|null;created_at?:string|null;message?:string|null}
type Snapshot={table:string;order:string;columns:string}
const PIPELINES=['schedule','materials','defects','photos'] as const
const SNAPSHOTS:Snapshot[]=[
  {table:'site_operations_entries',order:'synced_at',columns:'synced_at,work_date,source_file_id,source_sheet'},
  {table:'materials',order:'updated_at',columns:'updated_at,source_sheet,source_row'},
  {table:'procurement_items',order:'updated_at',columns:'updated_at,source_sheet,source_row'},
  {table:'condo_room_status',order:'synced_at',columns:'synced_at,source_modified_at,room_no'},
  {table:'defect_work_order_snapshot',order:'imported_at',columns:'imported_at,source_modified_at,work_id'}
]
const LOG_COLUMNS='sync_type,source_file,source_sheet,rows_read,rows_written,status,created_at,message'
export function classifySyncRun(rows:Run[],clock:Date):{
  sampleSize:number;latestAt:string|null;latestStatus:string|null;rowsRead:number|null;
  rowsWritten:number|null;failureCount:number;hoursSinceLatest:number|null;
  zeroWritesProvesNoChange:boolean;latestFailed:boolean;latestDiagnosticCategory:'UNMATCHED_MATERIALS'|'FAILED'|null
}{
 const latest=rows[0]
 const latestFailed=['error','failed','failure'].includes(String(latest?.status||'').toLowerCase())
 const latestDiagnosticCategory=latestFailed
   ? (/unmatched existing records|PROCUREMENT_MISSING_SOURCE_ROWS_RECONCILIATION_REQUIRED|MATERIALS_SOURCE_ROW_MISMATCH/i.test(String(latest?.message||'')) ? 'UNMATCHED_MATERIALS' : 'FAILED')
   : null
 const stamp=latest?.created_at?Date.parse(latest.created_at):NaN
 const diff=Number.isFinite(stamp)?(clock.getTime()-stamp)/3600000:NaN
 return {
  sampleSize:rows.length,latestAt:latest?.created_at||null,
  latestStatus:latest?.status||null,rowsRead:latest?.rows_read??null,
  rowsWritten:latest?.rows_written??null,
  failureCount:rows.filter(r=>['failed','error','failure'].includes(String(r.status||'').toLowerCase())).length,
  hoursSinceLatest:Number.isFinite(diff)&&diff>=0?Math.round(diff*10)/10:null,
  zeroWritesProvesNoChange:false,latestFailed,latestDiagnosticCategory
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
  for(const r of logResults){
    const summary=r.ok?classifySyncRun(r.rows,clock):null
    checks.push({
      name:'sync_log_'+r.type,
      status:!r.ok?'READ_FAILED':!r.rows.length?'NO_LOG_ROWS':
        summary?.latestFailed?(r.type==='materials'&&summary.latestDiagnosticCategory==='UNMATCHED_MATERIALS'
          ?'SOURCE_RECONCILIATION_REQUIRED':'LATEST_RUN_FAILED'):'READ_OK',
      details:summary||undefined
    })
  }

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

/**
 * Shared SOP 13 full-evidence contract. Only an independent producer that has
 * actually read the Drive source, parsed rows, DB rows AND authenticated UI
 * may populate every stage. No caller may infer proof from a successful log.
 */
export type CompleteSyncProof={
  source?:{fileId:string;revision:string;rowCount:number;rowsetSha256:string};
  parser?:{fileId:string;revision:string;rowCount:number;rowsetSha256:string};
  database?:{fileId:string;revision:string;rowCount:number;rowsetSha256:string};
  web?:{fileId:string;revision:string;rowCount:number;rowsetSha256:string;authenticated:boolean};
};
export function verifyCompleteSyncProof(proof:CompleteSyncProof):{
  status:'PASS'|'FAIL'|'UNVERIFIED';reason:string
}{
  const items=[proof.source,proof.parser,proof.database,proof.web]
  if(items.some(x=>!x||!x.fileId?.trim()||!x.revision?.trim()||
      !Number.isSafeInteger(x.rowCount)||x.rowCount<0||
      !/^[0-9a-f]{64}$/.test(x.rowsetSha256)))return {status:'UNVERIFIED',reason:'MISSING_STAGE_OR_CANONICAL_HASH'}
  if(!proof.web?.authenticated)return {status:'UNVERIFIED',reason:'WEB_AUTH_READBACK_MISSING'}
  const [source,...downstream]=items as NonNullable<CompleteSyncProof['source']>[]
  if(downstream.some(x=>x.fileId!==source.fileId||x.revision!==source.revision||
      x.rowCount!==source.rowCount||x.rowsetSha256!==source.rowsetSha256))
    return {status:'FAIL',reason:'SOURCE_PARSER_DB_WEB_MISMATCH'}
  return {status:'PASS',reason:'ALL_STAGES_MATCHED'}
}
