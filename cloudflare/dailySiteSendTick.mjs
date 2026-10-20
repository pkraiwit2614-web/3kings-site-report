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
// An ambiguous LINE result is never retried automatically, even with the
// same provider retry key. Manual recipient/provider reconciliation is required.
// Retained as a disabled compatibility export for older consumers.
export function dailyRetryWindow(_when){
  return false;
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
      // Claim/send FORM first. Do not claim the image until a later tick
      // confirms FORM delivery in the durable ledger. No combined push.
      const text=await claim(route,groupId,'form_text',null);
      if(text.status==='blocked'){stats.blocked++;continue;}
      let one,messages,stage;
      if(text.status==='new'){
        one=text;stage='text';messages=[{type:'text',text:DAILY_FORM_TEXT}];
      }else if(text.status==='already_sent'){
        const image=await claim(route,groupId,'image',images.get(asset).sha256);
        if(image.status==='already_sent')continue;
        if(image.status!=='new'){stats.blocked++;continue;}
        one=image;stage='image';messages=[imageMessage(images.get(asset))];
      }else{
        // in_flight/uncertain: never resend before provider/recipient review.
        stats.blocked++;continue;
      }
      const sent=await push(groupId,messages,one.retry);
      if(budget!==null)budget=Math.max(0,budget-memberCount);
      await ack(one,sent);
      if(sent.accepted){
        if(stage==='text')stats.textAccepted++;
        else stats.imageAccepted++;
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
// An uncertain private owner DM also remains held for manual reconciliation.
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
  const when=dailyBangkokPolicy(now),base={
    mode:'OWNER_OFF',reportDate:when.reportDate,delivered:false
  };
  if(env.DAILY_SITE_LINE_ENABLED!=='true'
    ||!env.SUPABASE_URL||!env.SUPABASE_SERVER_KEY
    ||!env.LINE_CHANNEL_ACCESS_TOKEN
    ||!/^U[0-9a-f]{32}$/i.test(env.LINE_OWNER_USER_ID||''))
    return base;
  // 20 October Condo B was delivered manually; do not replay it or
  // fabricate an automated success for that date.
  if(when.day<'2026-10-21'||when.dayOfWeek===0
    ||when.localTime<'08:06'||when.localTime>'12:58')
    return base;
  if(typeof db!=='function'||typeof hash!=='function')
    throw Error('OWNER_SUMMARY_DEPENDENCY_MISSING');
  let summary;
  try{
    summary=await db(env,'/rest/v1/rpc/line_autopilot_daily_owner_summary',{
      p_report_date:when.reportDate
    });
  }catch{return {...base,mode:'OWNER_LOG_UNAVAILABLE'};}
  let report;
  try{report=dailyOwnerMessage(when,summary);}
  catch{return {...base,mode:'OWNER_LOG_INVALID'};}
  if(!report.complete && when.localTime<'08:40')
    return {...base,mode:'OWNER_WAIT_RETRIES'};
  const key=await hash('3kings|daily_site_owner_summary|'+when.reportDate);
  if(!validSha(key))throw Error('OWNER_EVENT_KEY_INVALID');
  let claim;
  try{
    const records=await db(env,'/rest/v1/rpc/line_autopilot_claim',{
      p_event_key:key,p_alert_kind:'daily_site_report',p_target_scope:'owner',
      p_summary:'Daily LINE '+when.reportDate+' 3 groups'
    });
    claim=Array.isArray(records)?records[0]:null;
  }catch{return {...base,mode:'OWNER_CLAIM_BLOCKED'};}
  if(!claim||!validRetry(claim.retry_key))
    return {...base,mode:'OWNER_CLAIM_INVALID'};
  if(claim.claim_status==='already_sent')
    return {...base,mode:'OWNER_ALREADY_SENT',delivered:true};
  if(claim.claim_status!=='new')
    return {...base,mode:'OWNER_NO_RETRY'};
  let status=null,accepted=false;
  try{
    const r=await transport('https://api.line.me/v2/bot/message/push',{
      method:'POST',headers:{
        authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,
        'content-type':'application/json',
        'X-Line-Retry-Key':claim.retry_key
      },
      body:JSON.stringify({
        to:env.LINE_OWNER_USER_ID,
        messages:[{type:'text',text:report.message.slice(0,4400)}]
      }),
      signal:AbortSignal.timeout(10000)
    });
    status=r.status;
    accepted=r.ok===true&&r.status>=200&&r.status<300
      ||r.status===409&&!!r.headers?.get?.('x-line-accepted-request-id');
    if(!accepted)
      console.warn('daily_owner_message_rejected',{http:status});
  }catch{console.warn('daily_owner_message_network_uncertain');}
  try{
    const ok=await db(env,'/rest/v1/rpc/line_autopilot_ack',{
      p_event_key:key,p_retry_key:claim.retry_key,
      p_status:accepted?'delivered':'uncertain',p_http_status:status
    });
    if(ok!==true)return {...base,mode:'OWNER_ACK_UNVERIFIED'};
  }catch{return {...base,mode:'OWNER_ACK_FAILED'};}
  return {...base,mode:accepted?'OWNER_ACCEPTED':'OWNER_UNCERTAIN',
    delivered:accepted};
}
