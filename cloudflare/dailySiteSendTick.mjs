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
export async function dailySiteSendTick(env,{db,hash,transport=fetch,now=new Date()}={}){
  const when=dailyBangkokPolicy(now);
  const stats={mode:'NO_SEND',reportDate:when.reportDate,ready:false,
    routesChecked:0,textAccepted:0,imageAccepted:0,blocked:0,uncertain:0};
  if(env.DAILY_SITE_LINE_ENABLED!=='true'||!env.SUPABASE_SERVER_KEY
    ||!env.LINE_CHANNEL_ACCESS_TOKEN||!env.SUPABASE_URL) return stats;
  if(when.dayOfWeek===0||when.day<'2026-10-20'
    ||when.localTime<'08:00'||when.localTime>'13:00')return stats;
  if(typeof db!=='function'||typeof hash!=='function')throw Error('DB_DEPENDENCY_MISSING');
  const endpoint=env.SUPABASE_URL.replace(/\/$/,'')+
    '/functions/v1/kings_daily_line_images/ready?date='+encodeURIComponent(when.reportDate);
  let ready;
  try{
    const result=await transport(endpoint,{method:'GET',headers:{
      'x-3kings-server-key':env.SUPABASE_SERVER_KEY
    },signal:AbortSignal.timeout(10000)});
    if(!result.ok)return {...stats,mode:'GATEWAY_NOT_READY'};
    ready=await result.json();
  }catch{return {...stats,mode:'GATEWAY_UNAVAILABLE'};}
  if(!ready||ready.ready!==true||!Array.isArray(ready.assets)
    ||ready.assets.length!==4)return {...stats,mode:'QA_BLOCKED'};
  const images=new Map();
  for(const image of ready.assets){
    if(!validSha(image.sha256)||typeof image.url!=='string'
      ||!image.url.startsWith(env.SUPABASE_URL.replace(/\/$/,'')+
          '/functions/v1/kings_daily_line_images/image?')
      ||!/^https:\/\//.test(image.url)
      ||!Number.isInteger(image.width)||image.width!==2947
      ||!Number.isInteger(image.height)||image.height<101
      ||('size' in image && (!Number.isInteger(image.size)||image.size<=0||image.size>1048576)))
      return {...stats,mode:'IMAGE_METADATA_BLOCKED'};
    images.set(image.site,image);
  }
  if(images.size!==4)return {...stats,mode:'IMAGE_METADATA_BLOCKED'};
  stats.ready=true;stats.mode='LIVE_GATED';
  async function claim(route,groupId,stage,sha){
    const key=await hash(['3kings','daily_site_report',when.reportDate,route,groupId,stage].join('|'));
    if(!validSha(key))throw Error('INVALID_EVENT_KEY');
    const result=await db(env,'/rest/v1/rpc/line_autopilot_claim',{
      p_event_key:key,p_alert_kind:'daily_site_report',
      p_target_scope:'site_group',
      p_summary:'Daily Site '+when.reportDate+' '+route+' '+stage});
    const r=Array.isArray(result)?result[0]:null;
    if(!r||!['new','already_sent','in_flight'].includes(r.claim_status))
      return {status:'blocked'};
    if(r.claim_status!=='new')return {status:r.claim_status};
    if(!validRetry(r.retry_key))return {status:'blocked'};
    const logged=await db(env,'/rest/v1/rpc/daily_line_record_delivery',{
      p_event_key:key,p_report_date:when.reportDate,p_site_code:route,
      p_group_id:groupId,p_stage:stage,p_asset_sha256:sha||null});
    if(logged!==true)throw Error('DELIVERY_METADATA_NOT_LOGGED');
    return {status:'new',key,retry:r.retry_key};
  }
  async function push(groupId,messages,token){
    let status=null;
    try{
      const r=await transport('https://api.line.me/v2/bot/message/push',{
        method:'POST',headers:{authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,
          'content-type':'application/json','X-Line-Retry-Key':token},
        body:JSON.stringify({to:groupId,messages}),signal:AbortSignal.timeout(10000)});
      status=r.status;
    }catch{ /* no blind re-send if the outcome is uncertain */ }
    return {status,accepted:status!==null&&status>=200&&status<300};
  }
  for(const {route,asset} of DAILY_ROUTES){
    stats.routesChecked++;
    let preview;
    try{
      const res=await db(env,'/rest/v1/rpc/line_autopilot_preview_route',{
        p_alert_kind:'daily_site_report',p_site_code:route});
      preview=Array.isArray(res)?res[0]:null;
    }catch{stats.blocked++;continue;}
    if(!preview||preview.would_send_line!==true
      ||!validGroup(preview.candidate_group_id)||!images.has(asset)){
      stats.blocked++;continue;
    }
    const groupId=preview.candidate_group_id;
    try{
      const text=await claim(route,groupId,'form_text',null);
      if(text.status==='new'){
        const sent=await push(groupId,[{type:'text',text:DAILY_FORM_TEXT}],text.retry);
        await db(env,'/rest/v1/rpc/line_autopilot_ack',{
          p_event_key:text.key,p_retry_key:text.retry,
          p_status:sent.accepted?'delivered':'uncertain',p_http_status:sent.status});
        if(sent.accepted)stats.textAccepted++;else stats.uncertain++;
        continue; // image follows on a subsequent cron invocation
      }
      if(text.status!=='already_sent')continue;
      const image=images.get(asset);
      const claimImage=await claim(route,groupId,'image',image.sha256);
      if(claimImage.status!=='new')continue;
      const sent=await push(groupId,[{type:'image',
        originalContentUrl:image.url,previewImageUrl:image.url}],claimImage.retry);
      await db(env,'/rest/v1/rpc/line_autopilot_ack',{
        p_event_key:claimImage.key,p_retry_key:claimImage.retry,
        p_status:sent.accepted?'delivered':'uncertain',p_http_status:sent.status});
      if(sent.accepted)stats.imageAccepted++;else stats.uncertain++;
    }catch{stats.uncertain++;}
  }
  return stats;
}
