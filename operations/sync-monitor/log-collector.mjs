/**
 * Read-only source stream collector for 3 Kings Sync LINE monitoring.
 * No writes, no LINE send, no GAS execution. The historical log streams are
 * evidence candidates only; authenticated Web proof must be attached separately.
 */
import {fromDriveSyncRun,fromDailySiteAudit,fromExpressRegister}
 from './pipeline-metrics.mjs';
export const STREAMS=Object.freeze([
 {table:'drive_sync_runs',timestamp:'created_at',
  fields:'id,sync_type,status,source_file,created_at,rows_read,rows_written,message',
  parse:fromDriveSyncRun},
 {table:'daily_site_report_sync_audit',timestamp:'created_at',
  fields:'id,created_at,source_file_id,source_rows_read,rows_parsed,rows_inserted,rows_updated,rows_skipped,rows_verified,notes',
  parse:fromDailySiteAudit},
 {table:'express_register_runs',timestamp:'created_at',
  fields:'id,created_at,completed_at,state,source_files,document_count,line_count,review_count,canceled_count',
  parse:fromExpressRegister}
]);
const validatedTime=t=>typeof t==='string'&&Number.isFinite(Date.parse(t));
export async function collectObservedRuns(readPage,{
 since,until,maxPages=50,pageSize=100
}={}){
 if(typeof readPage!=='function'||!validatedTime(since)||!validatedTime(until)
 || Date.parse(since)>Date.parse(until)
 || !Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100
 || !Number.isSafeInteger(pageSize)||pageSize<1||pageSize>500)
   throw Error('MONITOR_READ_WINDOW_INVALID');
 const runs=[],errors=[];
 for(const stream of STREAMS){
   let complete=false;
   for(let page=0;page<maxPages;page++){
     let rows;
     try{
       rows=await readPage({...stream,parse:undefined,since,until,
         offset:page*pageSize,limit:pageSize});
     }catch(e){
       errors.push({stream:stream.table,reason:'READ_FAILED'});
       break;
     }
     if(!Array.isArray(rows)||rows.length>pageSize){
       errors.push({stream:stream.table,reason:'BAD_READ_PAGE'});
       break;
     }
     for(const row of rows){
       try{
         const run=stream.parse(row);
         if(!validatedTime(run.created_at) || Date.parse(run.created_at)<Date.parse(since) || Date.parse(run.created_at)>Date.parse(until)){
           errors.push({stream:stream.table,reason:'BAD_EVENT_TIME'});
           continue;
         }
         runs.push(run);
       }catch{
         errors.push({stream:stream.table,reason:'MALFORMED_ROW'});
       }
     }
     if(rows.length<pageSize){complete=true;break;}
   }
   if(!complete&&!errors.some(x=>x.stream===stream.table))
      errors.push({stream:stream.table,reason:'PAGINATION_TRUNCATED'});
 }
 const unique=new Map();
 for(const x of runs){
   const key=x.sync_type+'|'+String(x.run_key||x.id||'');
   if(!unique.has(key))unique.set(key,x);
 }
 const items=[...unique.values()].sort((a,b)=>
   Date.parse(a.created_at)-Date.parse(b.created_at)||
   String(a.run_key||a.id).localeCompare(String(b.run_key||b.id)));
 return {status:errors.length?'PARTIAL':'READ_COMPLETE',
   observed:items,errors,
   cannotVerifyE2E:true,
   unsupportedPerRunPipelines:['work_order','hotel_work_plan']};
}
/**
 * Cloudflare Worker can reuse the existing Supabase secret/API key bindings.
 * Whitelist tables, enforce GET only and reject non-JSON/non-2xx replies.
 * This reader MUST NOT call any import, write, Line API or GAS endpoint.
 */
export function makeSupabaseReadPage(env,transport=fetch){
 const url=String(env?.SUPABASE_URL||'').replace(/\/$/,'');
 const secret=String(env?.SUPABASE_SERVER_KEY||'');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!secret)
   throw Error('MONITOR_EXISTING_DB_BINDINGS_MISSING');
 return async({table,fields,since,until,offset,limit})=>{
   const s=STREAMS.find(x=>x.table===table);
   if(!s||s.fields!==fields)throw Error('MONITOR_SOURCE_NOT_ALLOWLISTED');
   const q=new URLSearchParams({
     select:fields,
     order:'created_at.asc,id.asc',limit:String(limit),offset:String(offset)
   });
   // PostgREST supports multiple filters on the same column through raw query.
   const uri=url+'/rest/v1/'+table+'?'+q.toString()+
     '&created_at=gte.'+encodeURIComponent(since)+
     '&created_at=lte.'+encodeURIComponent(until);
   const headers={apikey:secret,
     ...(secret.startsWith('sb_secret_')?{}:{authorization:'Bearer '+secret})};
   const result=await transport(uri,{
     method:'GET',headers,signal:AbortSignal.timeout(12000)
   });
   if(!result?.ok)throw Error('MONITOR_DB_READ_FAILED_'+String(result?.status||'unknown'));
   const rows=await result.json();
   if(!Array.isArray(rows))throw Error('MONITOR_DB_BAD_RESPONSE');
   return rows;
 };
}
