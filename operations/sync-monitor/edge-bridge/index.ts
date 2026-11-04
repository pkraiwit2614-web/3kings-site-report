// 3 Kings — isolated Owner Sync Monitoring service-role bridge.
// New function only. Never touches existing Daily LINE, triggers or masters.
// verify_jwt=false is safe ONLY because every data route checks 384-bit
// independently stored Cloudflare secret, by constant-time SHA-256 digest.
// SHA digest is public; plaintext secret must never enter Git or API logs.
type DenoRuntime = {env:{get:(name:string)=>string|undefined};
  serve:(handler:(req:Request)=>Promise<Response>)=>unknown};
const edgeRuntime=(globalThis as unknown as {Deno:DenoRuntime}).Deno;
const TOKEN_HASH = "4fcf3fde73d075045b1b7014ace8583de64ff255a67e9d8951f5c5a099cadbf9";
const ENDPOINT = (edgeRuntime.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const legacy = edgeRuntime.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
let modern = "";
try {
  const value = JSON.parse(edgeRuntime.env.get("SUPABASE_SECRET_KEYS") || "{}");
  modern = typeof value.default === "string" ? value.default : "";
} catch {}
const SERVICE_KEY = legacy || modern;
const json = (obj: unknown, status = 200): Response =>
  new Response(JSON.stringify(obj), {status, headers: {
    "content-type": "application/json", "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }});
const allowed = new Set([
  "defects","materials","schedule","photos","daily_site_report","express"
]);
const columns: Record<string,string> = {
  drive_sync_runs: "id,sync_type,source_file,status,created_at,rows_read,rows_written,message",
  daily_site_report_sync_audit: "id,created_at,source_file_id,source_revision,source_rows_read,rows_parsed,rows_inserted,rows_updated,rows_skipped,rows_verified,notes",
  express_register_runs: "id,created_at,completed_at,state,source_fingerprint,document_count",
  condo_room_status: "id", materials: "id",
  schedule_tasks: "id", drive_photo_index: "id",
  daily_reports: "id", express_register_rows: "id"
};
const rpcKeys: Record<string,string[]> = {
  line_sync_owner_get_pending: ["p_pipeline"],
  line_sync_owner_record_pending: [
    "p_pipeline","p_source_file_id","p_original_run_key",
    "p_missing_evidence","p_next_round_due_at","p_schedule_verified"
  ],
  line_sync_owner_mark_overdue: ["p_pipeline","p_original_run_key"],
  line_sync_owner_resolve_pending: [
    "p_pipeline","p_original_run_key","p_resolution_evidence"
  ],
  line_sync_owner_claim: ["p_event_key","p_pipeline","p_run_key","p_summary"],
  line_sync_owner_ack: [
    "p_event_key","p_retry_key","p_status","p_http_status"
  ]
};
const shaHex = async (s: string): Promise<string> => {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), b=>b.toString(16).padStart(2,"0")).join("");
};
function equal(a:string,b:string):boolean {
  let x=a.length ^ b.length;
  for (let i=0;i<Math.max(a.length,b.length);i++)
    x |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0);
  return x===0;
}
async function auth(req:Request):Promise<boolean>{
  const key=req.headers.get("x-3kings-owner-sync-key")||"";
  if(key.length<48||key.length>256||!/^[\w-]+$/.test(key))return false;
  return equal(await shaHex(key),TOKEN_HASH);
}
function upstreamHeaders(): Record<string,string> {
  const h: Record<string,string> = {"apikey":SERVICE_KEY,
    "content-type":"application/json"};
  if(!SERVICE_KEY.startsWith("sb_secret_"))
    h.authorization="Bearer "+SERVICE_KEY;
  return h;
}
function allowedRead(path:string):boolean{
  let url:URL;
  try{url=new URL(path,ENDPOINT+"/");}catch{return false;}
  if(url.origin!==new URL(ENDPOINT).origin)return false;
  if(!/^\/rest\/v1\/[a-z_]+$/.test(url.pathname))return false;
  const table=url.pathname.slice("/rest/v1/".length);
  if(!Object.prototype.hasOwnProperty.call(columns,table))return false;
  const params=url.searchParams;
  if(params.get("select")!==columns[table]||params.getAll("select").length!==1)
    return false;
  const allowedParameters=["select","limit","order","created_at"];
  if([...params.keys()].some(k=>!allowedParameters.includes(k)))return false;
  const limit=Number(params.get("limit"));
  if(!Number.isSafeInteger(limit)||limit<1||limit>
    (columns[table]==="id"?1:table==="drive_sync_runs"?200:100))return false;
  const audit=["drive_sync_runs","daily_site_report_sync_audit","express_register_runs"]
    .includes(table);
  if(!audit)return params.get("order")===null&&params.get("created_at")===null;
  if(params.get("order")!=="created_at.desc")return false;
  const d=params.get("created_at")||"";
  if(!/^(gte|lt)\.20\d{2}-\d{2}-\d{2}T/.test(d))return false;
  if(d.startsWith("lt.")&&table!=="express_register_runs")return false;
  if(!Number.isFinite(Date.parse(d.slice(d.indexOf(".")+1))))return false;
  return true;
}
function allowedRpc(name:string,args:unknown):boolean{
  const names=rpcKeys[name];
  if(!names||!args||typeof args!=="object"||Array.isArray(args))return false;
  const keys=Object.keys(args);
  if(keys.some(k=>!names.includes(k))||keys.length!==names.length)return false;
  const v=args as Record<string,unknown>;
  if("p_pipeline" in v && v.p_pipeline!==null &&
     !allowed.has(String(v.p_pipeline)))return false;
  if("p_summary" in v && String(v.p_summary||"").length>600)return false;
  if("p_missing_evidence" in v &&
     String(v.p_missing_evidence||"").length>1000)return false;
  if("p_source_file_id" in v&&String(v.p_source_file_id||"").length>400)
    return false;
  return true;
}
edgeRuntime.serve(async(req:Request)=>{
  if(req.method==="GET"&&new URL(req.url).pathname.endsWith("/health"))
    return json({service:"kings_sync_owner_bridge",ready:Boolean(ENDPOINT&&SERVICE_KEY),
      mode:"owner-only"});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  if(!await auth(req))return json({error:"unauthorized"},401);
  if(!ENDPOINT||!SERVICE_KEY)return json({error:"service_not_ready"},503);
  const len=Number(req.headers.get("content-length")||0);
  if(len>8192)return json({error:"too_large"},413);
  let request;
  try{
    const raw=await req.text();
    if(raw.length>8192)return json({error:"too_large"},413);
    request=JSON.parse(raw);
  }catch{return json({error:"invalid_json"},400);}
  if(!request||typeof request!=="object"||Array.isArray(request))
    return json({error:"invalid_request"},400);
  const method=request.method;
  const path=request.path;
  if(typeof path!=="string"||path.length>1400)
    return json({error:"path_forbidden"},403);
  let payload:unknown;
  if(method==="GET"){
    if(!allowedRead(path))return json({error:"read_forbidden"},403);
  }else if(method==="POST"){
    const matched=/^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(path);
    if(!matched||!allowedRpc(matched[1],request.args))
      return json({error:"rpc_forbidden"},403);
    payload=request.args;
  }else return json({error:"method_forbidden"},403);
  const target=new URL(path,ENDPOINT+"/");
  try{
    const response=await fetch(target.href,{
      method,headers:upstreamHeaders(),
      ...(method==="POST"?{body:JSON.stringify(payload)}:{}),
      signal:AbortSignal.timeout(12000)
    });
    if(!response.ok){
      // Do not return raw internal errors, privileged SQL details or keys.
      return json({error:"service_backend_"+response.status},response.status);
    }
    const body=await response.text();
    if(body.length>300000)return json({error:"response_too_large"},502);
    return new Response(body,{status:response.status,
      headers:{"content-type":"application/json","cache-control":"no-store",
        "x-content-type-options":"nosniff"}});
  }catch{return json({error:"service_unavailable"},502);}
});
export {};
