'use strict';
/**
 * Isolated 3 Kings GAS OAuth staging bridge. OFF by default.
 * All sensitive configuration is provided by Cloudflare secret bindings, never by URL.
 * All API routes require a verified Cloudflare Access JWT.
 * Requires a private D1 binding and the SQL schema in docs/ai-operations.
 * GET-only Google Apps Script access. No script execution, changes or deployment.
 */
const SCOPE='https://www.googleapis.com/auth/script.projects.readonly';
const AUTH_URL='https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const enc=new TextEncoder(),dec=new TextDecoder();
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const random=(crypto,n=32)=>encode(crypto.getRandomValues(new Uint8Array(n)));
const sha=async(value,crypto)=>encode(await crypto.subtle.digest('SHA-256',enc.encode(value)));
const shaHex=async(value,crypto)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; frame-ancestors 'none'"}});
const fail=(code,status=503)=>json({error:code},status);
function config(env,origin){
 if(env?.BRIDGE_ENABLED!=='true')throw Error('DISABLED');
 if(!origin.startsWith('https://')||env.PUBLIC_ORIGIN!==origin)throw Error('ORIGIN');
 if(!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID||''))throw Error('CLIENT_ID');
 if(!env.GOOGLE_CLIENT_SECRET||!env.TOKEN_ENCRYPTION_KEY)throw Error('SECRETS');
 if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.CF_ACCESS_TEAM_DOMAIN||''))throw Error('ACCESS_DOMAIN');
 if(!/^[a-f0-9]{64}$/.test(env.CF_ACCESS_AUD||''))throw Error('ACCESS_AUD');
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.ALLOWED_EMAIL||''))throw Error('OWNER');
 if(!env.DB?.prepare)throw Error('DB');
 const targets=JSON.parse(env.TARGETS_JSON||'null');
 if(!Array.isArray(targets)||targets.length<1||targets.length>7)throw Error('TARGETS');
 const seen=new Set();
 for(const t of targets){
  if(!t||!/^[A-Za-z0-9_-]{12,200}$/.test(t.scriptId||'')||!Array.isArray(t.files)||!t.files.length||t.files.length>7)throw Error('TARGET');
  for(const f of t.files){if(typeof f!=='string'||!f.length||f.length>150||/[\\/\r\n]/.test(f)||seen.has(f))throw Error('TARGET_FILE');seen.add(f);}
 }
 if(seen.size>7)throw Error('TARGET_COUNT');
 if(decode(env.TOKEN_ENCRYPTION_KEY).length!==32)throw Error('ENCRYPTION_KEY');
 return targets;
}
async function accessOwner(request,env,fetchFn,crypto,now){
 const token=request.headers.get('cf-access-jwt-assertion')||'';
 const pieces=token.split('.');
 if(pieces.length!==3)throw Error('ACCESS_MISSING');
 let header,payload;
 try{header=JSON.parse(dec.decode(decode(pieces[0])));payload=JSON.parse(dec.decode(decode(pieces[1])));}catch{throw Error('ACCESS_INVALID');}
 if(header.alg!=='RS256'||typeof header.kid!=='string'||!header.kid)throw Error('ACCESS_ALGORITHM');
 if(payload.iss!=='https://'+env.CF_ACCESS_TEAM_DOMAIN||!Array.isArray(payload.aud)||!payload.aud.includes(env.CF_ACCESS_AUD)||!Number.isFinite(payload.exp)||payload.exp<=now||payload.nbf>now||payload.email?.toLowerCase()!==env.ALLOWED_EMAIL.toLowerCase())throw Error('ACCESS_CLAIMS');
 const response=await fetchFn('https://'+env.CF_ACCESS_TEAM_DOMAIN+'/cdn-cgi/access/certs',{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('ACCESS_CERTS');
 const keys=(await response.json()).keys;
 const jwk=Array.isArray(keys)?keys.find(k=>k.kid===header.kid&&k.kty==='RSA'):null;
 if(!jwk)throw Error('ACCESS_KEY');
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(pieces[2]),enc.encode(pieces[0]+'.'+pieces[1]));
 if(!ok)throw Error('ACCESS_SIGNATURE');
 return payload.email.toLowerCase();
}
async function encryptionKey(env,crypto){return crypto.subtle.importKey('raw',decode(env.TOKEN_ENCRYPTION_KEY),'AES-GCM',false,['encrypt','decrypt']);}
async function seal(value,owner,env,crypto){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(owner)},await encryptionKey(env,crypto),enc.encode(value));
 return{iv:encode(iv),ciphertext:encode(ciphertext)};
}
async function unseal(row,owner,env,crypto){
 const value=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(row.iv),additionalData:enc.encode(owner)},await encryptionKey(env,crypto),decode(row.ciphertext));
 return dec.decode(value);
}
async function exchange(params,env,fetchFn){
 const response=await fetchFn(TOKEN_URL,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET}),redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('TOKEN_EXCHANGE');
 const data=await response.json();
 if(typeof data.access_token!=='string'||!data.access_token||!Number.isFinite(data.expires_in)||data.expires_in<30)throw Error('TOKEN_INVALID');
 if(!data.scope||data.scope.trim().split(/\s+/).sort().join(' ')!==SCOPE)throw Error('SCOPE_MISMATCH');
 return data;
}
async function handle(request,env,{crypto=globalThis.crypto,fetchFn=globalThis.fetch,now=Math.floor(Date.now()/1000)}={}){
 const url=new URL(request.url);
 if(url.pathname==='/health'&&request.method==='GET')return json({service:'3kings-gas-oauth-staging',mode:'STAGING_ONLY',connected:false});
 let targets;
 try{targets=config(env,url.origin);}catch{return fail('BRIDGE_DISABLED');}
 if(request.method!=='GET')return fail('METHOD_NOT_ALLOWED',405);
 if(!['/auth/start','/auth/callback','/api/source','/api/status'].includes(url.pathname))return fail('NOT_FOUND',404);
 let owner;
 try{owner=await accessOwner(request,env,fetchFn,crypto,now);}catch{return fail('UNAUTHORIZED',401);}
 try{
  if(url.pathname==='/api/status'){
   const row=await env.DB.prepare('SELECT owner FROM oauth_token WHERE owner=?').bind(owner).first();
   return json({connected:!!row,mode:'STAGING_ONLY',scope:SCOPE});
  }
  if(url.pathname==='/auth/start'){
   const state=random(crypto),verifier=random(crypto);
   await env.DB.prepare('INSERT INTO oauth_state (state,owner,verifier,expires) VALUES (?,?,?,?)').bind(state,owner,verifier,now+300).run();
   const auth=new URL(AUTH_URL);
   for(const [k,v] of Object.entries({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:url.origin+'/auth/callback',response_type:'code',scope:SCOPE,state,code_challenge:await sha(verifier,crypto),code_challenge_method:'S256',access_type:'offline',prompt:'consent'}))auth.searchParams.set(k,v);
   return new Response(null,{status:302,headers:{location:auth.toString(),'cache-control':'no-store','referrer-policy':'no-referrer'}});
  }
  if(url.pathname==='/auth/callback'){
   const state=url.searchParams.get('state'),code=url.searchParams.get('code');
   if(!state||!code||state.length>200||code.length>4096)return fail('CALLBACK_INVALID',400);
   const row=await env.DB.prepare('DELETE FROM oauth_state WHERE state=? AND owner=? RETURNING verifier,expires').bind(state,owner).first();
   if(!row||row.expires<=now)return fail('STATE_EXPIRED',400);
   const data=await exchange({grant_type:'authorization_code',code,code_verifier:row.verifier,redirect_uri:url.origin+'/auth/callback'},env,fetchFn);
   if(typeof data.refresh_token!=='string'||!data.refresh_token)throw Error('NO_REFRESH_TOKEN');
   const sealed=await seal(data.refresh_token,owner,env,crypto);
   await env.DB.prepare('INSERT INTO oauth_token (owner,iv,ciphertext,updated) VALUES (?,?,?,?) ON CONFLICT(owner) DO UPDATE SET iv=excluded.iv,ciphertext=excluded.ciphertext,updated=excluded.updated').bind(owner,sealed.iv,sealed.ciphertext,now).run();
   return json({connected:true,scope:SCOPE,mode:'STAGING_ONLY'});
  }
  const row=await env.DB.prepare('SELECT iv,ciphertext FROM oauth_token WHERE owner=?').bind(owner).first();
  if(!row)return fail('NOT_CONNECTED',409);
  const refresh=await unseal(row,owner,env,crypto);
  const data=await exchange({grant_type:'refresh_token',refresh_token:refresh},env,fetchFn);
  const results=[];
  const cache=new Map();
  for(const t of targets){
   if(!cache.has(t.scriptId)){
    const api=await fetchFn('https://script.googleapis.com/v1/projects/'+encodeURIComponent(t.scriptId)+'/content',{method:'GET',headers:{authorization:'Bearer '+data.access_token,accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});
    if(!api.ok)throw Error('GAS_READ_FAILED');
    const content=await api.json();
    if(!Array.isArray(content.files))throw Error('GAS_CONTENT_INVALID');
    cache.set(t.scriptId,content.files);
   }
   for(const name of t.files){
    const matches=cache.get(t.scriptId).filter(f=>f.name===name&&f.type==='SERVER_JS');
    if(matches.length>1)throw Error('AMBIGUOUS_REMOTE');
    if(matches.length&&typeof matches[0].source!=='string')throw Error('INVALID_REMOTE_SOURCE');
    results.push({remoteFile:name,status:matches.length?'FOUND':'NOT_FOUND',sha256:matches.length?await shaHex(matches[0].source,crypto):null});
   }
  }
  return json({mode:'STAGING_ONLY',source:'GAS_API_HEAD_NOT_DEPLOYMENT',scope:SCOPE,files:results});
 }catch{return fail('READ_ONLY_OPERATION_FAILED',502);}
}
module.exports={SCOPE,AUTH_URL,TOKEN_URL,random,sha,shaHex,config,accessOwner,seal,unseal,exchange,handle};
