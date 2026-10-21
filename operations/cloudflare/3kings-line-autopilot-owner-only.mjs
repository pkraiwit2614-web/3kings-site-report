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
// 3 Kings LINE daily-report sender. The module is intentionally dormant unless
// DAILY_SITE_LINE_ENABLED=true, a same-morning verified gateway report exists,
// and each destination has been independently approved in Supabase.
// This file does not approve or create groups.
export const DAILY_FORM_TEXT='ฟอร์มสำหรับกรอก รายงานหน้างานประจำวัน\nhttps://forms.gle/UDTk8uxG3iwQaW5y8';
export const DAILY_ROUTES=Object.freeze([
  {route:'above_villa',asset:'above_villa'},
  {route:'above_condo_a',asset:'above_condo'},
  {route:'above_condo_b',asset:'above_condo'}
]);
export function dailyBangkokPolicy(now=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',
    minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  const day=p.year+'-'+p.month+'-'+p.day;
  const epoch=Date.UTC(+p.year,+p.month-1,+p.day);
  const dow=new Date(epoch).getUTCDay();
  return {day,dayOfWeek:dow,localTime:p.hour+':'+p.minute,
    reportDate:new Date(epoch-(dow===1?2:1)*86400000).toISOString().slice(0,10)};
}
const validGroup=id=>typeof id==='string'&&/^C[0-9a-f]{32}$/i.test(id);
const validSha=id=>typeof id==='string'&&/^[0-9a-f]{64}$/.test(id);
const validRetry=id=>typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id);
// Only approved daily LINE RPCs can cross this authenticated bridge.
// The original sync-failure collector still uses its own legacy connection.
export async function dailyLineRpc(env,path,args,transport=fetch){
 const kind=String(path).split('/').pop();
 if(!['line_autopilot_daily_route','daily_line_record_delivery',
       'line_autopilot_claim','line_autopilot_ack'].includes(kind))
   throw Error('BLOCK_RPC_NOT_ALLOWED');
 if(!env.DAILY_LINE_BRIDGE_TOKEN)throw Error('BLOCK_BRIDGE_NOT_CONFIGURED');
 const url=env.SUPABASE_URL.replace(/\/$/,'')+
   '/functions/v1/kings_daily_line_images/rpc';
 const res=await transport(url,{method:'POST',
   headers:{'x-3kings-server-key':env.DAILY_LINE_BRIDGE_TOKEN,
     'content-type':'application/json'},
   body:JSON.stringify({rpc:kind,args}),signal:AbortSignal.timeout(10000)
 });
 if(!res.ok)throw Error('DAILY_BRIDGE_RPC_'+res.status);
 return await res.json();
}
// Read-only LINE quota checks; do not attempt a chargeable push when the quota
// service cannot be verified. The LINE quota API returns quota per recipient,
// not per message object.
export async function dailyLineQuota(env,transport=fetch){
  const token=env.LINE_CHANNEL_ACCESS_TOKEN;
  if(!token)return {allow:false,reason:'QUOTA_TOKEN_MISSING'};
  async function get(path){
    const r=await transport('https://api.line.me/v2/bot/message/'+path,{
      method:'GET',headers:{authorization:'Bearer '+token},
      signal:AbortSignal.timeout(10000)
    });
    if(!r.ok)throw Error('QUOTA_HTTP_'+r.status);
    return await r.json();
  }
  try{
    const limit=await get('quota');
    if(limit?.type==='none')return {allow:true,remaining:null};
    if(limit?.type!=='limited'||!Number.isSafeInteger(limit.value)||limit.value<0)
      return {allow:false,reason:'QUOTA_UNRECOGNIZED'};
    const used=await get('quota/consumption');
    if(!Number.isSafeInteger(used?.totalUsage)||used.totalUsage<0)
      return {allow:false,reason:'QUOTA_USAGE_UNRECOGNIZED'};
    const remaining=Math.max(0,limit.value-used.totalUsage);
    return {allow:remaining>0,remaining,
      reason:remaining>0?'QUOTA_AVAILABLE':'QUOTA_EXHAUSTED'};
  }catch{return {allow:false,reason:'QUOTA_API_UNAVAILABLE'};}
}
async function dailyGroupMemberCount(env,groupId,transport=fetch){
  try{
    const r=await transport('https://api.line.me/v2/bot/group/'+
      encodeURIComponent(groupId)+'/members/count',{
      method:'GET',headers:{authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN},
      signal:AbortSignal.timeout(10000)
    });
    if(!r.ok)return null;
    const data=await r.json();
    return Number.isSafeInteger(data?.count)&&data.count>0?data.count:null;
  }catch{return null;}
}
// Retry only in a few predefined short windows on the SAME report day.
// LINE de-duplicates an unchanged retry key for 24h; we never create a
// replacement key and the morning-only policy prevents retries after 24h.
const RETRY_SLOTS=new Set(['08:12','08:32','09:02','10:02']);
export function dailyRetryWindow(when){
  return RETRY_SLOTS.has(when.localTime) && when.day>='2026-10-20';
}
function dailyLineErrorClass(status,message){
  const s=String(message||'').toLowerCase().slice(0,400);
  if(status===429&&(/monthly limit|quota|target limit/.test(s)))
    return 'MONTHLY_QUOTA';
  if(status===429&&(/rate limit|too many requests/.test(s)))
    return 'RATE_LIMIT';
  if(status===429)return 'LIMIT_UNKNOWN';
  if(status===409)return 'RETRY_CONFLICT';
  if(status===null)return 'NETWORK_UNCERTAIN';
  return 'HTTP_'+status;
}
export async function dailySiteSendTick(env,{db,hash,transport=fetch,now=new Date()}={}){
  const when=dailyBangkokPolicy(now);
  const stats={mode:'NO_SEND',reportDate:when.reportDate,ready:false,
    routesChecked:0,textAccepted:0,imageAccepted:0,bundlesAccepted:0,
    blocked:0,uncertain:0,quotaStatus:'NOT_CHECKED'};
  if(env.DAILY_SITE_LINE_ENABLED!=='true'||!env.DAILY_LINE_BRIDGE_TOKEN
    ||!env.LINE_CHANNEL_ACCESS_TOKEN||!env.SUPABASE_URL)return stats;
  if(when.dayOfWeek===0||when.day<'2026-10-21'
    ||when.localTime<'08:00'||when.localTime>'13:00')return stats;
  if(typeof db!=='function'||typeof hash!=='function')
    throw Error('DB_DEPENDENCY_MISSING');
  const endpoint=env.SUPABASE_URL.replace(/\/$/,'')+
    '/functions/v1/kings_daily_line_images/ready?date='+encodeURIComponent(when.reportDate);
  let ready;
  try{
    const result=await transport(endpoint,{method:'GET',headers:{
      'x-3kings-server-key':env.DAILY_LINE_BRIDGE_TOKEN
    },signal:AbortSignal.timeout(10000)});
    if(!result.ok)return {...stats,mode:'GATEWAY_NOT_READY'};
    ready=await result.json();
  }catch{return {...stats,mode:'GATEWAY_UNAVAILABLE'};}
  if(!ready||ready.ready!==true||!Array.isArray(ready.assets)
    ||ready.assets.length!==4)return {...stats,mode:'QA_BLOCKED'};
  const images=new Map();
  for(const item of ready.assets){
    if(!validSha(item.sha256)||typeof item.url!=='string'
      ||!item.url.startsWith(env.SUPABASE_URL.replace(/\/$/,'')+
          '/functions/v1/kings_daily_line_images/image?')
      ||!/^https:\/\//.test(item.url)
      ||!Number.isInteger(item.width)||item.width!==2947
      ||!Number.isInteger(item.height)||item.height<101
      ||('size' in item&&(!Number.isInteger(item.size)||item.size<=0||item.size>1048576)))
      return {...stats,mode:'IMAGE_METADATA_BLOCKED'};
    images.set(item.site,item);
  }
  if(images.size!==4)return {...stats,mode:'IMAGE_METADATA_BLOCKED'};
  stats.ready=true;
  const quota=await dailyLineQuota(env,transport);
  stats.quotaStatus=quota.reason||(quota.allow?'QUOTA_AVAILABLE':'QUOTA_UNKNOWN');
  if(!quota.allow)return {...stats,mode:'QUOTA_BLOCKED'};
  let budget=quota.remaining;
  stats.mode='LIVE_GATED';
  async function claim(route,groupId,stage,sha){
    const key=await hash(['3kings','daily_site_report',when.reportDate,
      route,groupId,stage].join('|'));
    if(!validSha(key))throw Error('INVALID_EVENT_KEY');
    const logged=await db(env,'/rest/v1/rpc/daily_line_record_delivery',{
      p_event_key:key,p_report_date:when.reportDate,p_site_code:route,
      p_group_id:groupId,p_stage:stage,p_asset_sha256:sha||null});
    if(logged!==true)throw Error('DELIVERY_METADATA_NOT_LOGGED');
    const result=await db(env,'/rest/v1/rpc/line_autopilot_claim',{
      p_event_key:key,p_alert_kind:'daily_site_report',
      p_target_scope:'site_group',
      p_summary:'Daily Site '+when.reportDate+' '+route+' '+stage});
    const record=Array.isArray(result)?result[0]:null;
    if(!record||!['new','already_sent','in_flight'].includes(record.claim_status))
      return {status:'blocked'};
    if(record.claim_status==='already_sent')return {status:'already_sent'};
    if(!validRetry(record.retry_key))return {status:'blocked'};
    return {status:record.claim_status,key,retry:record.retry_key};
  }
  async function push(groupId,messages,retryKey){
    try{
      const r=await transport('https://api.line.me/v2/bot/message/push',{
        method:'POST',headers:{
          authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,
          'content-type':'application/json','X-Line-Retry-Key':retryKey
        },
        body:JSON.stringify({to:groupId,messages}),
        signal:AbortSignal.timeout(10000)
      });
      // A 409 with an accepted-request header confirms LINE had already
      // accepted this exact retry key; do not issue another send.
      const accepted=r.status>=200&&r.status<300||
        (r.status===409&&!!r.headers?.get?.('x-line-accepted-request-id'));
      let message='';
      if(!accepted){
        try{
          const data=await r.json();
          message=typeof data?.message==='string'?data.message:'';
        }catch{}
      }
      const errorClass=accepted?null:dailyLineErrorClass(r.status,message);
      if(errorClass)console.warn('daily_line_push_rejected',{
        http:r.status,reason:errorClass
      });
      return {status:r.status,accepted,errorClass};
    }catch{
      console.warn('daily_line_push_rejected',{reason:'NETWORK_UNCERTAIN'});
      return {status:null,accepted:false,errorClass:'NETWORK_UNCERTAIN'};
    }
  }
  async function ack(one,sent){
    const ok=await db(env,'/rest/v1/rpc/line_autopilot_ack',{
      p_event_key:one.key,p_retry_key:one.retry,
      p_status:sent.accepted?'delivered':'uncertain',
      p_http_status:sent.status});
    if(ok!==true)throw Error('DELIVERY_ACK_FAILED');
  }
  const imageMessage=image=>({type:'image',
    originalContentUrl:image.url,previewImageUrl:image.url});
  for(const {route,asset} of DAILY_ROUTES){
    stats.routesChecked++;
    let preview;
    try{
      const r=await db(env,'/rest/v1/rpc/line_autopilot_daily_route',{
        p_site_code:route});
      preview=Array.isArray(r)?r[0]:null;
    }catch{stats.blocked++;continue;}
    if(!preview||preview.would_send_line!==true
      ||!validGroup(preview.group_id)||!images.has(asset)){
      stats.blocked++;continue;
    }
    const groupId=preview.group_id,memberCount=await dailyGroupMemberCount(env,groupId,transport);
    // For a limited plan, never exceed the known remaining quota based on
    // the verified group-member count. Unknown membership fails closed.
    if(budget!==null&&(memberCount===null||memberCount>budget)){
      stats.blocked++;
      console.warn('daily_line_quota_group_blocked',{route,
        reason:memberCount===null?'MEMBER_COUNT_UNKNOWN':'INSUFFICIENT_QUOTA'});
      continue;
    }
    try{
      const text=await claim(route,groupId,'form_text',null);
      if(text.status==='blocked'){stats.blocked++;continue;}
      const image=await claim(route,groupId,'image',images.get(asset).sha256);
      if(image.status==='blocked'){stats.blocked++;continue;}
      if(text.status==='already_sent'&&image.status==='already_sent')continue;
      let sending=[],token,records=[];
      if(text.status==='already_sent'){
        if(image.status==='new'||image.status==='in_flight'&&dailyRetryWindow(when)){
          sending=[imageMessage(images.get(asset))];token=image.retry;records=[image];
        }
      }else if(image.status==='already_sent'){
        if(text.status==='new'||text.status==='in_flight'&&dailyRetryWindow(when)){
          sending=[{type:'text',text:DAILY_FORM_TEXT}];token=text.retry;records=[text];
        }
      }else if(text.status===image.status
        &&(text.status==='new'||text.status==='in_flight'&&dailyRetryWindow(when))){
        // New mornings: one billed push request containing two message
        // objects. Both ledger stages are acknowledged with the same result.
        sending=[{type:'text',text:DAILY_FORM_TEXT},
          imageMessage(images.get(asset))];
        token=text.retry;records=[text,image];
      }
      if(!sending.length)continue;
      const sent=await push(groupId,sending,token);
      // Every attempted push decrements our optimistic budget to prevent
      // the same cron from oversubscribing quota while LINE settles usage.
      if(budget!==null)budget=Math.max(0,budget-memberCount);
      for(const record of records)await ack(record,sent);
      if(sent.accepted){
        if(records.some(x=>x===text))stats.textAccepted++;
        if(records.some(x=>x===image))stats.imageAccepted++;
        if(records.length===2)stats.bundlesAccepted++;
      }else stats.uncertain++;
    }catch{
      stats.uncertain++;
      console.warn('daily_line_stage_unverified',{route});
    }
  }
  return stats;
}


// Daily owner DM, one report per Bangkok morning. Reads only service-role
// Delivery Log summary; never reads group IDs or changes site-group delivery.
const OWNER_SUMMARY_ROUTES=Object.freeze([
  ['above_villa','Above Villa'],
  ['above_condo_a','Condo A'],
  ['above_condo_b','Condo B']
]);
const OWNER_SUMMARY_RETRY_SLOTS=new Set(['08:44','09:04','10:04']);
function ownerStageLabel(status,http){
  if(status==='delivered')return 'สำเร็จ';
  if(status==='missing')return 'ยังไม่ส่ง';
  if(status==='claimed')return 'รอยืนยัน';
  if(status==='uncertain'){
    return 'ไม่สำเร็จ/ไม่ยืนยัน'+(
      Number.isInteger(http)?' (HTTP '+http+')':'');
  }
  return 'ไม่ทราบผล';
}
export function dailyOwnerMessage(when,summary){
  if(!summary||summary.report_date!==when.reportDate
    ||!Array.isArray(summary.sites)||summary.sites.length!==3)
    throw Error('OWNER_SUMMARY_INVALID');
  const sites=new Map(summary.sites.map(x=>[x.site_code,x]));
  if(sites.size!==3||!OWNER_SUMMARY_ROUTES.every(([id])=>sites.has(id)))
    throw Error('OWNER_SUMMARY_ROUTE_MISMATCH');
  const complete=OWNER_SUMMARY_ROUTES.every(([id])=>{
    const s=sites.get(id);
    return s.form_status==='delivered'&&s.image_status==='delivered';
  });
  const d=when.reportDate.split('-').reverse().join('/');
  const lines=['3 Kings • สรุป LINE AutoPilot',
    'วันที่รายงาน: '+d,
    'ผลรับคำขอจาก LINE API (ไม่ใช่การยืนยันการอ่าน)'];
  for(const [id,label] of OWNER_SUMMARY_ROUTES){
    const s=sites.get(id);
    lines.push(label+': ฟอร์ม '+ownerStageLabel(s.form_status,s.form_http)
      +' | PNG '+ownerStageLabel(s.image_status,s.image_http));
  }
  const ok=OWNER_SUMMARY_ROUTES.filter(([id])=>{
    const s=sites.get(id);
    return s.form_status==='delivered'&&s.image_status==='delivered';
  }).length;
  lines.push('สรุป: '+ok+'/3 กลุ่ม ส่งครบทั้งข้อความและรูป');
  if(summary.qa_published!==true)
    lines.push('หมายเหตุ: ยังไม่พบหลักฐานเผยแพร่รายงานที่ผ่าน QA ของเช้านี้');
  if(!complete)
    lines.push('โปรดตรวจ Delivery Log/โควตา LINE ก่อนส่งซ้ำ');
  return {complete, message:lines.join('\n')};
}
export async function dailyOwnerSummaryTick(env,{db,hash,transport=fetch,now=new Date()}={}){
  const when=dailyBangkokPolicy(now),base={mode:'OWNER_OFF',reportDate:when.reportDate,delivered:false};
  if(env.DAILY_SITE_LINE_ENABLED!=='true'||!env.DAILY_LINE_BRIDGE_TOKEN||
     !env.SUPABASE_URL||!env.LINE_CHANNEL_ACCESS_TOKEN||
     !/^U[0-9a-f]{32}$/i.test(env.LINE_OWNER_USER_ID||''))return base;
  if(when.dayOfWeek===0||when.day<'2026-10-21'||when.localTime<'08:00'||
     when.localTime>'13:00')return base;
  if(typeof db!=='function'||typeof hash!=='function')throw Error('OWNER_DEPENDENCY_MISSING');
  const gateway=env.SUPABASE_URL.replace(/\/$/,'')+'/functions/v1/kings_daily_line_images/';
  let ready;
  try{
    const r=await transport(gateway+'ready?date='+encodeURIComponent(when.reportDate),{
      method:'GET',headers:{'x-3kings-server-key':env.DAILY_LINE_BRIDGE_TOKEN},
      signal:AbortSignal.timeout(10000)});
    if(!r.ok)return {...base,mode:'OWNER_GATEWAY_NOT_READY'};
    ready=await r.json();
  }catch{return {...base,mode:'OWNER_GATEWAY_UNAVAILABLE'};}
  const order=[['above_villa','Page_01_Above_Villa'],['above_condo','Page_02_Above_Condo'],
    ['mirage','Page_03_Mirage'],['henessy','Page_04_Henessy']];
  if(!ready||ready.ready!==true||ready.report_date!==when.reportDate||
     !validSha(ready.pdf_sha256)||!Array.isArray(ready.assets)||ready.assets.length!==4)
    return {...base,mode:'OWNER_QA_BLOCKED'};
  const assets=new Map(),day=when.reportDate.split('-').reverse().join('-');
  for(const a of ready.assets){
    if(!a||typeof a.site!=='string'||assets.has(a.site)||!order.some(([site])=>site===a.site))
      return {...base,mode:'OWNER_IMAGE_BLOCKED'};
    assets.set(a.site,a);
  }
  for(const [site,suffix] of order){
    const a=assets.get(site);
    if(!a||a.filename!=='Daily_Site_Report_'+day+'_'+suffix+'.png'||
       !validSha(a.sha256)||typeof a.url!=='string'||
       !a.url.startsWith(gateway+'image?')||a.url.length>2000||
       a.width!==2947||!Number.isInteger(a.height)||a.height<=100||
       ('size' in a&&(!Number.isInteger(a.size)||a.size<=0||a.size>1048576)))
      return {...base,mode:'OWNER_IMAGE_BLOCKED'};
  }
  const quota=await dailyLineQuota(env,transport);
  if(!quota.allow||quota.remaining!==null&&quota.remaining<1){
    console.warn('daily_owner_quota_blocked',{reason:quota.reason||'INSUFFICIENT_QUOTA'});
    return {...base,mode:'OWNER_QUOTA_BLOCKED'};
  }
  // Preserve the prior owner-summary event key: at most one DM per report date.
  const key=await hash('3kings|daily_site_owner_summary|'+when.reportDate);
  if(!validSha(key))return {...base,mode:'OWNER_EVENT_KEY_INVALID'};
  let claim;
  try{
    const rows=await db(env,'/rest/v1/rpc/line_autopilot_claim',{
      p_event_key:key,p_alert_kind:'daily_site_report',p_target_scope:'owner',
      p_summary:'Owner-only Daily Report '+when.reportDate});
    claim=Array.isArray(rows)?rows[0]:null;
  }catch{return {...base,mode:'OWNER_CLAIM_BLOCKED'};}
  if(claim?.claim_status==='already_sent')return {...base,mode:'OWNER_ALREADY_SENT',delivered:true};
  if(claim?.claim_status!=='new'||!validRetry(claim.retry_key))
    return {...base,mode:'OWNER_NO_RETRY'};
  // Exactly one LINE push to owner: original form text and four site PNGs.
  const messages=[{type:'text',text:DAILY_FORM_TEXT},...order.map(([site])=>({
    type:'image',originalContentUrl:assets.get(site).url,
    previewImageUrl:assets.get(site).url}))];
  let http=null,accepted=false;
  try{
    const r=await transport('https://api.line.me/v2/bot/message/push',{
      method:'POST',headers:{authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,
        'content-type':'application/json','X-Line-Retry-Key':claim.retry_key},
      body:JSON.stringify({to:env.LINE_OWNER_USER_ID,messages}),
      signal:AbortSignal.timeout(10000)});
    http=r.status;
    accepted=(r.status>=200&&r.status<300)||
      (r.status===409&&!!r.headers?.get?.('x-line-accepted-request-id'));
    if(!accepted)console.warn('daily_owner_bundle_rejected',{http});
  }catch{console.warn('daily_owner_bundle_network_uncertain');}
  // Any ambiguous response is permanently HELD, not blindly retried.
  try{
    const ok=await db(env,'/rest/v1/rpc/line_autopilot_ack',{
      p_event_key:key,p_retry_key:claim.retry_key,
      p_status:accepted?'delivered':'uncertain',p_http_status:http});
    if(ok!==true)return {...base,mode:'OWNER_ACK_UNVERIFIED'};
  }catch{return {...base,mode:'OWNER_ACK_FAILED'};}
  return {...base,mode:accepted?'OWNER_BUNDLE_ACCEPTED':'OWNER_BUNDLE_UNCERTAIN',
    delivered:accepted,http};
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/daily-line/health' && request.method==='GET'){
      const policy=dailyBangkokPolicy();
      if(!env.DAILY_LINE_BRIDGE_TOKEN || !env.SUPABASE_URL)
        return json({service:'daily-line',gateway:false,bridge_rpc:false,signed_image_readback:false,enabled:false});
      try{
        const base=env.SUPABASE_URL.replace(/\/$/,'');
        const response=await fetch(base+'/functions/v1/kings_daily_line_images/ready?date='+
          encodeURIComponent(policy.reportDate),{
          headers:{'x-3kings-server-key':env.DAILY_LINE_BRIDGE_TOKEN},
          signal:AbortSignal.timeout(10000)});
        let bridge_rpc=false;
        try{
          const a=await dailyLineRpc(env,'/rest/v1/rpc/line_autopilot_daily_route',
               {p_site_code:'above_villa'});
          bridge_rpc=Array.isArray(a)&&a.length===1;
        }catch{}
        let signed_image_readback=false;
        if(response.ok){
          try{
            const manifest=await response.json();
            const entry=Array.isArray(manifest?.assets)?manifest.assets.find(x=>x.site==='above_villa'):null;
            if(entry&&typeof entry.url==='string'
             &&entry.url.startsWith(base+'/functions/v1/kings_daily_line_images/image?')
             &&/^[0-9a-f]{64}$/.test(entry.sha256)){
              const im=await fetch(entry.url,{signal:AbortSignal.timeout(14000)});
              if(im.ok&&(im.headers.get('content-type')||'').startsWith('image/png')){
                const data=await im.arrayBuffer();
                if(data.byteLength>100&&data.byteLength<1048576){
                  const dig=await crypto.subtle.digest('SHA-256',data);
                  const hex=[...new Uint8Array(dig)].map(x=>x.toString(16).padStart(2,'0')).join('');
                  signed_image_readback=hex===entry.sha256;
                }
              }
            }
          }catch{}
        }
        return json({service:'daily-line',gateway_http_status:response.status,
          gateway:response.ok,bridge_rpc,signed_image_readback,
          enabled:env.DAILY_SITE_LINE_ENABLED==='true'});
      }catch{return json({service:'daily-line',gateway:false,bridge_rpc:false,
        signed_image_readback:false,enabled:env.DAILY_SITE_LINE_ENABLED==='true'});}
    }
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
    // Owner-only mode: NEVER invoke the former group sender or summary DM.
    try {
      const r=await dailyOwnerSummaryTick(env,{db:dailyLineRpc,hash:sha256hex});
      console.info('daily_owner_report_tick',{mode:r.mode,accepted:r.delivered,
        reportDate:r.reportDate,http:r.http??null});
    }catch{console.warn('daily_owner_report_tick_failed');}
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
