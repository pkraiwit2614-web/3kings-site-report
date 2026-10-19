// 3 Kings Daily LINE image gateway: privately stored QA-verified PNGs.
// Separate Edge Function; no ability to call LINE or approve group routes.
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const endpoint = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/,'');
const service = endpoint+'/functions/v1/3kings-daily-line-images';
const noStore = {'cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...noStore,'content-type':'application/json'}});
const isDate=(s:string)=>/^20\d{2}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));
const isSite=(s:string)=>['above_villa','above_condo','mirage','henessy'].includes(s);
const isHash=(s:string)=>/^[0-9a-f]{64}$/.test(s);
function equal(a:string,b:string):boolean {
  let v=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)v|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return v===0;
}
function auth(req:Request):boolean {return !!key&&equal(req.headers.get('x-3kings-server-key')||'',key);}
async function sign(input:string):Promise<string>{
  const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode('3kings-daily-line-image-v1|'+input)));
  return [...digest].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function rpc(name:string,body:unknown):Promise<unknown>{
  if(!key||!endpoint)throw Error('not_configured');
  const headers:Record<string,string>={'apikey':key,'content-type':'application/json'};
  if(!key.startsWith('sb_secret_'))headers['authorization']='Bearer '+key;
  const res=await fetch(endpoint+'/rest/v1/rpc/'+name,{
    method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw Error('rpc_'+res.status);
  return await res.json();
}
Deno.serve(async(req:Request)=>{
 try{
  const url=new URL(req.url);
  if(req.method==='GET'&&url.pathname.endsWith('/health'))
    return json({service:'3kings-daily-line-images',line_sends_enabled:false,ready:!!key&&!!endpoint});
  if(req.method==='GET'&&url.pathname.endsWith('/ready')){
    if(!auth(req))return json({error:'unauthorized'},401);
    const date=url.searchParams.get('date')||'';
    if(!isDate(date))return json({error:'invalid_date'},400);
    const result=await rpc('daily_line_ready',{p_report_date:date}) as {ready?:boolean,assets?:Array<{site:string,sha256:string}>,[key:string]:unknown};
    if(!result||!result.ready||!Array.isArray(result.assets)||result.assets.length!==4)
      return json({ready:false,reason:'QA_NOT_FINALIZED'},409);
    const expiry=Math.floor(Date.now()/1000)+7*86400;
    const assets=await Promise.all(result.assets.map(async a=>{
      if(!isSite(a.site)||!isHash(a.sha256))throw Error('asset_metadata');
      const p=new URLSearchParams({date,site:a.site,sha:a.sha256,exp:String(expiry)});
      const sig=await sign(date+'|'+a.site+'|'+a.sha256+'|'+expiry);
      p.set('sig',sig);
      return {...a,url:service+'/image?'+p.toString()};
    }));
    return json({...result,assets,ready:true,expires_at:expiry});
  }
  if(req.method==='GET'&&url.pathname.endsWith('/image')){
    const date=url.searchParams.get('date')||'';
    const site=url.searchParams.get('site')||'';
    const sha=url.searchParams.get('sha')||'';
    const expText=url.searchParams.get('exp')||'';
    const sig=url.searchParams.get('sig')||'';
    const expiry=Number(expText),now=Math.floor(Date.now()/1000);
    if(!isDate(date)||!isSite(site)||!isHash(sha)||!isHash(sig)
      ||!/^\d{10}$/.test(expText)||!Number.isSafeInteger(expiry)
      ||expiry<now||expiry>now+7*86400+120)
      return json({error:'expired_or_invalid'},403);
    const expected=await sign(date+'|'+site+'|'+sha+'|'+expiry);
    if(!equal(expected,sig))return json({error:'invalid_signature'},403);
    const rows=await rpc('daily_line_image_read',{p_report_date:date,p_site:site,p_sha256:sha}) as
      Array<{content_base64:string,checksum:string,mime:string}>;
    if(!Array.isArray(rows)||rows.length!==1||rows[0].checksum!==sha
      ||rows[0].mime!=='image/png')return json({error:'asset_not_found'},404);
    const bytes=Uint8Array.from(atob(rows[0].content_base64),c=>c.charCodeAt(0));
    if(bytes.length<100||bytes.length>1048576)return json({error:'asset_invalid'},503);
    const calc=await crypto.subtle.digest('SHA-256',bytes);
    const checksum=[...new Uint8Array(calc)].map(v=>v.toString(16).padStart(2,'0')).join('');
    if(checksum!==sha)return json({error:'asset_checksum_mismatch'},503);
    return new Response(bytes,{status:200,headers:{...noStore,'content-type':'image/png','content-length':String(bytes.length)}});
  }
  return json({error:'not_found'},404);
 }catch(e){
  console.error('daily_line_gateway_failed',e instanceof Error?e.name:'unknown');
  return json({error:'internal_error'},503);
 }
});
