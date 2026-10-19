/**
 * 3 Kings LINE AutoPilot — Cloudflare Workers migration from expired n8n Cloud.
 * Isolated Worker, FREE-plan compatible, and OFF by default.
 * The existing LINE webhook must not be switched until OA verification succeeds.
 *
 * Phase 1 LIVE-ELIGIBLE collector: verified explicit sync failures only, owner DM.
 * Other four types are registered but must remain OFF until full source QA and SOP gates.
 */
export const NOTIFICATION_TYPES = Object.freeze([
  'sync_failure', 'defect_overdue', 'po_materials',
  'daily_site_report', 'weekly_recap'
]);

const NO_STORE = {'cache-control':'no-store','content-type':'application/json; charset=utf-8'};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:NO_STORE});}
function validId(id,kind){return typeof id==='string' && new RegExp('^'+kind+'[0-9a-f]{32}$','i').test(id);}
function isConfigured(env){
  return env.AUTOPILOT_ENABLED === 'true'
    && /^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(env.SUPABASE_URL||'')
    && !!env.SUPABASE_SERVER_KEY && !!env.LINE_CHANNEL_ACCESS_TOKEN
    && validId(env.LINE_OWNER_USER_ID,'U')
    && validId(env.LINE_MAIN_GROUP_ID,'C');
}
function b64(buffer) {
  const bytes = new Uint8Array(buffer);
  let s='';for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s);
}
function equalSignature(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let n=0;for(let i=0;i<a.length;i++)n |= a.charCodeAt(i)^b.charCodeAt(i);
  return n===0;
}
async function verifyWebhook(body,signature,secret){
  if(typeof secret!=='string'||!secret||typeof signature!=='string'
    ||!/^[A-Za-z0-9+/]+={0,2}$/.test(signature))return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  return equalSignature(b64(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))),signature);
}
function supabaseHeaders(env){
  const key=env.SUPABASE_SERVER_KEY;
  // Modern Supabase sb_secret_ keys are not JWTs: Bearer would cause Invalid JWT.
  // Legacy service_role JWT remains supported during gradual migration.
  return {apikey:key,
    ...(key.startsWith('sb_secret_')?{}:{authorization:'Bearer '+key}),
    'content-type':'application/json'};
}
async function sb(env,path,body){
  const r=await fetch(env.SUPABASE_URL+path,{
    method:body===undefined?'GET':'POST',
    headers:supabaseHeaders(env),
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(10000)
  });
  if(!r.ok)throw new Error('Supabase request failed: '+r.status);
  return await r.json();
}
function safeText(value,max=100){
  const s=String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
  return s.slice(0,max);
}
async function sha256hex(value){
  const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(h),x=>x.toString(16).padStart(2,'0')).join('');
}
async function sendVerifiedSyncFailure(env,item){
  if(!/^[0-9a-f-]{36}$/i.test(item.id||'') || item.status !== 'error'
    || !item.created_at || !item.sync_type)return 'skipped';
  const summary='Sync '+safeText(item.sync_type,45)+' ล้มเหลว';
  const eventKey=await sha256hex('3kings|sync_failure|'+item.id);
  // Atomic unique key and LINE retry UUID live in private, RLS-protected Supabase schema.
  const claimed=await sb(env,'/rest/v1/rpc/line_autopilot_claim',{
    p_event_key:eventKey,p_alert_kind:'sync_failure',p_target_scope:'owner',p_summary:summary
  });
  const record=Array.isArray(claimed)?claimed[0]:null;
  if(!record || record.claim_status!=='new' || typeof record.retry_key!=='string'){
    return 'duplicate_or_blocked';
  }
  const text=[
    '3 Kings • LINE AutoPilot',
    'แจ้งเตือน Sync ล้มเหลว',
    'ประเภท: '+safeText(item.sync_type,45),
    'ต้นทาง: '+safeText(item.source_file,90),
    'สถานะ: ERROR (ยืนยันจาก Sync Log)',
    'บันทึกเมื่อ: '+new Date(item.created_at).toLocaleString('th-TH',{
      timeZone:'Asia/Bangkok',hour12:false}),
    'หมายเหตุ: '+safeText(item.message,280),
    'หมายเลขตรวจสอบ: '+String(item.id).slice(0,8),
    'ตรวจไฟล์และฐานข้อมูลก่อนสั่งซิงก์ซ้ำ'
  ].join('\n');
  let result='uncertain',http=null;
  try{
    const res=await fetch('https://api.line.me/v2/bot/message/push',{
      method:'POST',
      headers:{
        authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,
        'content-type':'application/json',
        'X-Line-Retry-Key':record.retry_key
      },
      body:JSON.stringify({to:env.LINE_OWNER_USER_ID,
        messages:[{type:'text',text:text.slice(0,4500)}]}),
      signal:AbortSignal.timeout(10000)
    });
    http=res.status;
    if(res.ok)result='delivered';
    // For 409, 429, 500 or timeout, DO NOT generate a new retry key or claim sent.
  }catch { /* Supabase ledger retains uncertain delivery, no blind resend. */ }
  try{
    await sb(env,'/rest/v1/rpc/line_autopilot_ack',{
      p_event_key:eventKey,p_retry_key:record.retry_key,
      p_status:result,p_http_status:http
    });
  }catch{
    console.warn('line_autopilot_ledger_ack_failed',{kind:'sync_failure'});
  }
  return result;
}
async function collectSyncFailures(env){
  // Only explicit error statuses, never infer failure from 0 changed rows or old snapshots.
  const since=new Date(Date.now()-65*60000).toISOString();
  const params=new URLSearchParams({
    select:'id,sync_type,source_file,created_at,status,message',
    status:'eq.error',created_at:'gte.'+since,
    order:'created_at.desc',limit:'12'
  });
  const rows=await sb(env,'/rest/v1/drive_sync_runs?'+params.toString());
  if(!Array.isArray(rows))throw new Error('Unexpected Sync Log format');
  let delivered=0,uncertain=0;
  for(const item of rows){
    const outcome=await sendVerifiedSyncFailure(env,item);
    if(outcome==='delivered')delivered++;
    if(outcome==='uncertain')uncertain++;
  }
  return {checked:rows.length,delivered,uncertain};
}
async function discoverSignedGroups(env,events){
  // This capability collects unapproved candidates only, never authorizes routing.
  // It is separate from AUTOPILOT_ENABLED and cannot send outbound LINE messages.
  if(env.LINE_GROUP_DISCOVERY_ENABLED!=='true'
    || !env.LINE_GROUP_DISCOVERY_WRITE_TOKEN
    || !env.SUPABASE_SERVER_KEY || !env.LINE_CHANNEL_ACCESS_TOKEN
    || !/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(env.SUPABASE_URL||''))
    return 0;
  const candidates=[...new Set(events.filter(event=>
    ['message','join'].includes(event?.type)
    && event?.source?.type==='group'
    && validId(event?.source?.groupId,'C')
    && typeof event?.timestamp==='number'
    && Math.abs(Date.now()-event.timestamp)<=600000
  ).map(event=>event.source.groupId))].slice(0,5);
  let recorded=0;
  for(const groupId of candidates){
    try{
      // LINE Group Summary independently validates the token and membership.
      const response=await fetch('https://api.line.me/v2/bot/group/'
        +encodeURIComponent(groupId)+'/summary',{
        headers:{authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN},
        signal:AbortSignal.timeout(6000)
      });
      if(!response.ok)continue;
      const summary=await response.json();
      if(summary?.groupId!==groupId || typeof summary.groupName!=='string'
        || summary.groupName.trim().length<1)continue;
      const stored=await sb(env,'/rest/v1/rpc/line_autopilot_record_group_candidate_verified',{
        p_group_id:groupId,p_group_name:summary.groupName.slice(0,120),
        p_proof:env.LINE_GROUP_DISCOVERY_WRITE_TOKEN
      });
      if(stored===true)recorded++;
    }catch{
      // Do not log member identifiers, access tokens or event bodies.
      console.warn('line_group_discovery_failed');
    }
  }
  return recorded;
}

/**
 * READ-ONLY route integration staged for preview/test.
 * This function cannot send LINE; it only calls the service-role-only
 * SECURITY INVOKER Supabase RPC. Missing permissions/data fail closed.
 * It is intentionally NOT wired into the production webhook/cron.
 */
export async function previewLineSiteRoute(env, alertKind, siteCode, query = sb) {
  const blocked = (decision) => ({
    kind: alertKind ?? null, site: siteCode ?? null, groupName: null,
    routeFound: false, decision, wouldSendLine: false
  });
  if (env?.AUTOPILOT_ENABLED !== 'false') return blocked('BLOCK_PREVIEW_REQUIRES_SEND_OFF');
  if (!NOTIFICATION_TYPES.includes(alertKind)) return blocked('BLOCK_UNKNOWN_MESSAGE_TYPE');
  if (alertKind !== 'sync_failure' && !['above_villa','above_condo_a','above_condo_b'].includes(siteCode))
    return blocked('BLOCK_UNKNOWN_OR_MISSING_SITE');
  if (typeof env.SUPABASE_URL !== 'string'
    || !/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(env.SUPABASE_URL)
    || typeof env.SUPABASE_SERVER_KEY !== 'string' || !env.SUPABASE_SERVER_KEY)
    return blocked('BLOCK_SUPABASE_NOT_CONFIGURED');
  let rows;
  try {
    rows = await query(env, '/rest/v1/rpc/line_autopilot_preview_route', {
      p_alert_kind: alertKind, p_site_code: siteCode ?? null
    });
  } catch {
    return blocked('BLOCK_ROUTE_READ_FAILED');
  }
  if (!Array.isArray(rows) || rows.length !== 1) return blocked('BLOCK_ROUTE_INVALID_RESPONSE');
  const result = rows[0];
  const safe = new Set([
    'OWNER_ONLY_NO_GROUP_ROUTE', 'STAGED_AWAITING_APPROVAL', 'STAGED_GLOBAL_SEND_DISABLED',
    'BLOCK_GROUP_NOT_VERIFIED', 'BLOCK_TYPE_NOT_CONFIGURED_FOR_SITE',
    'BLOCK_UNKNOWN_OR_MISSING_SITE', 'BLOCK_UNKNOWN_MESSAGE_TYPE'
  ]);
  if (!result || result.would_send_line !== false || result.alert_kind !== alertKind
      || (result.source_site ?? null) !== (siteCode ?? null)
      || !safe.has(result.decision))
    return blocked('BLOCK_ROUTE_INVALID_RESPONSE');
  if (result.decision === 'OWNER_ONLY_NO_GROUP_ROUTE') {
    if (alertKind !== 'sync_failure' || result.candidate_group_id != null)
      return blocked('BLOCK_ROUTE_INVALID_RESPONSE');
  } else if (result.decision.startsWith('STAGED_')) {
    if (result.planned_route_found !== true
        || !validId(result.candidate_group_id,'C')
        || typeof result.candidate_group_name !== 'string'
        || !result.candidate_group_name.trim())
      return blocked('BLOCK_ROUTE_INVALID_RESPONSE');
  }
  return {
    kind: alertKind, site: siteCode ?? null,
    groupName: result.candidate_group_name ?? null,
    routeFound: result.planned_route_found === true,
    decision: result.decision,
    wouldSendLine: false
  };
}


/**
 * Source-to-site preview from real, canonical source attributes only.
 * Not a notification collector: does not infer overdue/ordered/completed
 * status and cannot invoke LINE. Project names are never guessed.
 */
export async function previewLineSourceEvent(env, alertKind, source, query = sb) {
  const reject = (decision) => ({
    kind: alertKind ?? null, site: null, groupName: null,
    routeFound: false, decision, wouldSendLine: false
  });
  if (env?.AUTOPILOT_ENABLED !== 'false')
    return reject('BLOCK_PREVIEW_REQUIRES_SEND_OFF');
  if (!NOTIFICATION_TYPES.includes(alertKind)) return reject('BLOCK_UNKNOWN_MESSAGE_TYPE');
  if (alertKind === 'sync_failure') {
    if (source?.kind !== 'drive_sync_log' || source?.status !== 'error')
      return reject('BLOCK_NO_CONFIRMED_SYNC_FAILURE');
    return previewLineSiteRoute(env, alertKind, null, query);
  }
  if (!source || typeof source !== 'object')
    return reject('BLOCK_SOURCE_NOT_IDENTIFIED');
  let siteCode = null;
  if (source.kind === 'defect_work_order') {
    if (alertKind !== 'defect_overdue') return reject('BLOCK_SOURCE_KIND_MISMATCH');
    if (source.building === 'A') siteCode = 'above_condo_a';
    else if (source.building === 'B') siteCode = 'above_condo_b';
    else return reject('BLOCK_UNKNOWN_OR_MISSING_SITE');
    // Only routing is tested here. Upstream must separately verify
    // the actual defect item is overdue using source status/date/evidence.
  } else if (['materials', 'daily_site_report', 'weekly_recap'].includes(source.kind)) {
    const category = source.kind === 'materials' ? 'po_materials'
      : source.kind === 'daily_site_report' ? 'daily_site_report' : 'weekly_recap';
    if (alertKind !== category) return reject('BLOCK_SOURCE_KIND_MISMATCH');
    if (typeof source.project_id !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source.project_id))
      return reject('BLOCK_MISSING_PROJECT_ID');
    let projects;
    try {
      projects = await query(env,
        '/rest/v1/projects?select=code,active&id=eq.'+encodeURIComponent(source.project_id));
    } catch {
      return reject('BLOCK_PROJECT_LOOKUP_FAILED');
    }
    if (!Array.isArray(projects) || projects.length !== 1 || projects[0]?.active !== true)
      return reject('BLOCK_PROJECT_NOT_VERIFIED');
    const code = projects[0].code;
    if (code === 'CONDO-A') siteCode = 'above_condo_a';
    else if (code === 'CONDO-B') siteCode = 'above_condo_b';
    else if (typeof code === 'string'
      && (/^AV-P[0-9]{1,2}$/.test(code) || code === 'AV-COMMON'))
      siteCode = 'above_villa';
    else return reject('BLOCK_OUTSIDE_CONFIGURED_SITES');
  } else {
    return reject('BLOCK_SOURCE_NOT_IDENTIFIED');
  }
  return previewLineSiteRoute(env, alertKind, siteCode, query);
}


/**
 * Owner-only Daily Site Report pilot. All arguments are read-only evidence
 * produced by the native Google Form/Sheet and canonical Drive PDF+PNG QA.
 * Never calls LINE or mutates Drive/Supabase. No success inferred from a file
 * existing, row count alone, or a completed trigger execution.
 */
export function previewDailyOwnerPilot(input) {
  const reject = (reason) => ({
    kind: 'daily_site_report', destination: 'owner',
    decision: reason, wouldSendLine: false
  });
  if (!input || typeof input !== 'object') return reject('BLOCK_MISSING_EVIDENCE');
  if (!/^\d{4}-\d\d-\d\d$/.test(input.reportDate||''))
    return reject('BLOCK_INVALID_REPORT_DATE');
  if (!Number.isInteger(input.formEntries) || input.formEntries < 1
    || !Number.isInteger(input.masterEntries) || input.masterEntries < 0)
    return reject('BLOCK_INVALID_ROW_COUNTS');
  if (input.formEntries !== input.masterEntries)
    return reject('BLOCK_FORM_MASTER_COUNT_MISMATCH');
  if (!input.latestSubmissionAt || !input.pdfModifiedAt)
    return reject('BLOCK_MISSING_ARTIFACT_TIMES');
  const latest=Date.parse(input.latestSubmissionAt),pdf=Date.parse(input.pdfModifiedAt);
  if (!Number.isFinite(latest)||!Number.isFinite(pdf))
    return reject('BLOCK_INVALID_ARTIFACT_TIMES');
  if (pdf < latest) return reject('BLOCK_PDF_PREDATES_FORM');
  if (!Array.isArray(input.pngPages) || input.pngPages.length !== 4
    || new Set(input.pngPages.map(p=>p.page)).size !== 4
    || input.pngPages.some(p=>![1,2,3,4].includes(p.page)
      || p.mimeType !== 'image/png'
      || !Number.isFinite(Date.parse(p.modifiedAt))
      || Date.parse(p.modifiedAt)<pdf))
    return reject('BLOCK_PNG_SET_UNVERIFIED');
  if (input.sourceReconciled !== true || input.pdfQaPassed !== true
      || input.pngQaPassed !== true || input.publishApproved !== true)
    return reject('BLOCK_REPORT_QA_OR_APPROVAL_PENDING');
  return {
    kind:'daily_site_report',destination:'owner',
    decision:'OWNER_PILOT_READY_BUT_SEND_DISABLED',
    reportDate:input.reportDate,wouldSendLine:false
  };
}

/**
 * Error-only owner DM preview: do not notify on success/skips or stale error.
 * This does not claim/deliver events; it prepares a safe no-send decision.
 */
export function previewSyncFailureOwnerPilot(item, nowIso) {
  const reject=(reason)=>({
    kind:'sync_failure',destination:'owner',
    decision:reason,wouldSendLine:false
  });
  if (!item || item.status!=='error' || item.sync_type==null)
    return reject('BLOCK_NOT_AN_EXPLICIT_SYNC_ERROR');
  const at=Date.parse(item.created_at),now=Date.parse(nowIso);
  if (!Number.isFinite(at)||!Number.isFinite(now)||at>now
      || now-at>65*60*1000)
    return reject('BLOCK_SYNC_ERROR_OUTSIDE_WINDOW');
  if (!/^[0-9a-f-]{36}$/i.test(item.id||''))
    return reject('BLOCK_UNVERIFIED_EVENT_ID');
  return {
    kind:'sync_failure',destination:'owner',
    decision:'OWNER_ERROR_DETECTED_BUT_SEND_DISABLED',
    syncType:safeText(item.sync_type,45),wouldSendLine:false
  };
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health' && request.method==='GET'){
      return json({service:'3kings-line-autopilot',backend:'cloudflare-workers',
        storage:'3kings-existing-supabase',configured:isConfigured(env),
        live:env.AUTOPILOT_ENABLED==='true' && isConfigured(env),
        supportedTypes:NOTIFICATION_TYPES,
        enabledCollectors:isConfigured(env)?['sync_failure']:[],
        mode:isConfigured(env)?'sync_failure_only':'staged_no_send'});
    }
    if(url.pathname==='/line/webhook' && request.method==='POST'){
      if(!env.LINE_CHANNEL_SECRET)return json({error:'not_configured'},503);
      if(Number(request.headers.get('content-length')||0)>131072)return json({error:'too_large'},413);
      const raw=await request.text();
      if(new TextEncoder().encode(raw).byteLength>131072)return json({error:'too_large'},413);
      if(!await verifyWebhook(raw,request.headers.get('x-line-signature'),env.LINE_CHANNEL_SECRET))
        return json({error:'unauthorized'},401);
      let data;
      try{data=JSON.parse(raw)}catch{return json({error:'invalid_json'},400);}
      if(!data || typeof data!=='object' || !Array.isArray(data.events)
        || data.events.length>100 || typeof data.destination!=='string')
        return json({error:'invalid_events'},400);
      if(env.LINE_BOT_DESTINATION_ID && env.LINE_BOT_DESTINATION_ID!==data.destination)
        return json({error:'wrong_destination'},403);
      // Capture only signed/LINE-verified groups as unapproved candidates.
      // Never expose group ID to the HTTP caller or send any messages.
      if(env.LINE_GROUP_DISCOVERY_ENABLED==='true'){
        const discovered=await discoverSignedGroups(env,data.events);
        return json({ok:true,processed:0,mode:'group_discovery_only',
          groupCandidates:discovered});
      }
      return json({ok:true,processed:0,mode:'receiver_only'});
    }
    return json({error:'not_found'},404);
  },
  async scheduled(controller,env){
    if(!isConfigured(env)){
      console.info('line_autopilot_scheduled_blocked',{reason:'not_enabled_or_missing_config'});
      return;
    }
    // Four other notification types remain disabled until their source-backed
    // collectors pass SOP and reconciliation checks; DO NOT guess statuses.
    try{
      const outcome=await collectSyncFailures(env);
      console.info('line_autopilot_sync_check',outcome);
    }catch{
      // Log only error class; never log secrets, raw source rows or LINE IDs.
      console.error('line_autopilot_sync_check_failed');
    }
  }
};
