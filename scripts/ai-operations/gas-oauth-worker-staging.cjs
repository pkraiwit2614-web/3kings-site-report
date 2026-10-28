'use strict';
/**
 * Isolated, owner-only Google OAuth staging bridge. No Cloudflare Access or card required.
 * OFF by default. Google Apps Script API access is GET-only, never write/execute.
 * Google ID token is signature-verified against Google's published JWKS before any token storage.
 * D1 stores one-time OAuth state, opaque browser sessions and encrypted refresh tokens.
 */
const READ_SCOPE='https://www.googleapis.com/auth/script.projects.readonly';
const SCOPES='openid email '+READ_SCOPE;
const AUTH_URL='https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const JWKS_URL='https://www.googleapis.com/oauth2/v3/certs';
const STATE_COOKIE='__Host-3kings-oauth-state';
const SESSION_COOKIE='__Host-3kings-session';
const enc=new TextEncoder(),dec=new TextDecoder();
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const random=(crypto,n=32)=>encode(crypto.getRandomValues(new Uint8Array(n)));
const sha=async(value,crypto)=>encode(await crypto.subtle.digest('SHA-256',enc.encode(value)));
const shaHex=async(value,crypto)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; frame-ancestors 'none'"}});
const fail=(code,status=503)=>json({error:code},status);
const cookie=(name,value,age,sameSite='Strict')=>name+'='+value+'; Path=/; Secure; HttpOnly; SameSite='+sameSite+'; Max-Age='+age;
function getCookie(request,name){
 const all=request.headers.get('cookie')||'';
 const found=all.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
 return found?found.slice(name.length+1):null;
}
function config(env,origin){
 if(env?.BRIDGE_ENABLED!=='true')throw Error('DISABLED');
 if(!origin.startsWith('https://')||origin!==env.PUBLIC_ORIGIN)throw Error('ORIGIN');
 if(!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID||''))throw Error('CLIENT_ID');
 if(!env.GOOGLE_CLIENT_SECRET)throw Error('CLIENT_SECRET');
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.ALLOWED_EMAIL||''))throw Error('OWNER');
 if(!env.DB?.prepare)throw Error('DB');
 if(!env.TOKEN_ENCRYPTION_KEY||decode(env.TOKEN_ENCRYPTION_KEY).length!==32)throw Error('ENCRYPTION_KEY');
 const targets=JSON.parse(env.TARGETS_JSON||'[]');
 if(!Array.isArray(targets)||targets.length>7)throw Error('TARGETS');
 const seen=new Set();
 for(const t of targets){
  if(!t||!/^[A-Za-z0-9_-]{12,200}$/.test(t.scriptId||'')||!Array.isArray(t.files)||!t.files.length||t.files.length>7)throw Error('TARGET');
  for(const f of t.files){if(typeof f!=='string'||!f.length||f.length>150||/[\\/\r\n]/.test(f)||seen.has(f))throw Error('TARGET_FILE');seen.add(f);}
 }
 if(seen.size>7)throw Error('TARGET_COUNT');
 return targets;
}
async function verifyGoogleIdToken(token,env,nonce,fetchFn,crypto,now){
 if(typeof token!=='string'||token.length>10000)throw Error('ID_TOKEN');
 const parts=token.split('.');
 if(parts.length!==3)throw Error('ID_TOKEN_FORMAT');
 let header,payload;
 try{header=JSON.parse(dec.decode(decode(parts[0])));payload=JSON.parse(dec.decode(decode(parts[1])));}catch{throw Error('ID_TOKEN_PARSE');}
 if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>256)throw Error('ID_TOKEN_ALG');
 if(!['accounts.google.com','https://accounts.google.com'].includes(payload.iss)||payload.aud!==env.GOOGLE_CLIENT_ID||!Number.isFinite(payload.exp)||payload.exp<=now||!Number.isFinite(payload.iat)||payload.iat>now+60||payload.iat<now-3600||payload.nonce!==nonce||payload.email_verified!==true||typeof payload.sub!=='string'||!payload.sub||payload.email?.toLowerCase()!==env.ALLOWED_EMAIL.toLowerCase())throw Error('ID_TOKEN_CLAIMS');
 const response=await fetchFn(JWKS_URL,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('GOOGLE_JWKS');
 const keys=(await response.json()).keys;
 const jwk=Array.isArray(keys)?keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig')):null;
 if(!jwk)throw Error('GOOGLE_KEY');
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),enc.encode(parts[0]+'.'+parts[1])))throw Error('GOOGLE_SIGNATURE');
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
function assertScopes(value,grantType){
 if(!value&&grantType==='refresh_token')return;
 const scopes=new Set((value||'').trim().split(/\s+/));
 const allowed=new Set(['openid','email','https://www.googleapis.com/auth/userinfo.email',READ_SCOPE]);
 if(!scopes.has(READ_SCOPE)||![...scopes].every(s=>allowed.has(s)))throw Error('SCOPE_MISMATCH');
}
async function exchange(params,env,fetchFn){
 const response=await fetchFn(TOKEN_URL,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET}),redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('TOKEN_EXCHANGE');
 const data=await response.json();
 if(typeof data.access_token!=='string'||!data.access_token||!Number.isFinite(data.expires_in)||data.expires_in<30)throw Error('TOKEN_INVALID');
 assertScopes(data.scope,params.grant_type);
 return data;
}
async function authenticatedOwner(request,env,crypto,now){
 const session=getCookie(request,SESSION_COOKIE);
 if(!session||!/^[A-Za-z0-9_-]{43}$/.test(session))throw Error('SESSION_MISSING');
 const hash=await shaHex(session,crypto);
 const row=await env.DB.prepare('SELECT owner,expires FROM oauth_session WHERE session_hash=?').bind(hash).first();
 if(!row||row.expires<=now||row.owner!==env.ALLOWED_EMAIL.toLowerCase())throw Error('SESSION_EXPIRED');
 return row.owner;
}
async function rateLimit(request,env,crypto,now){
 const ip=request.headers.get('cf-connecting-ip')||'unknown';
 const key=await shaHex(ip+'|'+Math.floor(now/600)+'|'+env.TOKEN_ENCRYPTION_KEY,crypto);
 const row=await env.DB.prepare('INSERT INTO oauth_rate (key,hits,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(key,now+600).first();
 if(!row||row.hits>5)throw Error('RATE_LIMIT');
}
async function handle(request,env,{crypto=globalThis.crypto,fetchFn=globalThis.fetch,now=Math.floor(Date.now()/1000)}={}){
 const url=new URL(request.url);
 if(url.pathname==='/health'&&request.method==='GET')return json({service:'3kings-gas-oauth-staging',mode:'STAGING_ONLY',connected:false});
 let targets;
 try{targets=config(env,url.origin);}catch{return fail('BRIDGE_DISABLED');}
 if(!['/auth/start','/auth/callback','/auth/logout','/api/status','/api/source'].includes(url.pathname))return fail('NOT_FOUND',404);
 if(request.method!=='GET'&&!(request.method==='POST'&&url.pathname==='/auth/logout'))return fail('METHOD_NOT_ALLOWED',405);
 try{
  const ownerEmail=env.ALLOWED_EMAIL.toLowerCase();
  if(url.pathname==='/auth/start'){
   await rateLimit(request,env,crypto,now);
   const state=random(crypto),verifier=random(crypto),browser=random(crypto),nonce=random(crypto);
   await env.DB.prepare('INSERT INTO oauth_state (state,owner,verifier,expires,browser_hash,nonce) VALUES (?,?,?,?,?,?)').bind(state,ownerEmail,verifier,now+300,await shaHex(browser,crypto),nonce).run();
   const auth=new URL(AUTH_URL);
   for(const [k,v] of Object.entries({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:url.origin+'/auth/callback',response_type:'code',scope:SCOPES,state,nonce,code_challenge:await sha(verifier,crypto),code_challenge_method:'S256',access_type:'offline',prompt:'consent',login_hint:ownerEmail}))auth.searchParams.set(k,v);
   return new Response(null,{status:302,headers:{location:auth.toString(),'set-cookie':cookie(STATE_COOKIE,browser,300,'Lax'),'cache-control':'no-store','referrer-policy':'no-referrer'}});
  }
  if(url.pathname==='/auth/callback'){
   const state=url.searchParams.get('state'),code=url.searchParams.get('code'),browser=getCookie(request,STATE_COOKIE);
   if(!state||!code||state.length>200||code.length>4096||!browser||!/^[A-Za-z0-9_-]{43}$/.test(browser))return fail('CALLBACK_INVALID',400);
   const row=await env.DB.prepare('DELETE FROM oauth_state WHERE state=? AND owner=? AND browser_hash=? RETURNING verifier,expires,nonce').bind(state,ownerEmail,await shaHex(browser,crypto)).first();
   if(!row||row.expires<=now)return fail('STATE_EXPIRED',400);
   const data=await exchange({grant_type:'authorization_code',code,code_verifier:row.verifier,redirect_uri:url.origin+'/auth/callback'},env,fetchFn);
   const owner=await verifyGoogleIdToken(data.id_token,env,row.nonce,fetchFn,crypto,now);
   if(typeof data.refresh_token!=='string'||!data.refresh_token)throw Error('NO_REFRESH_TOKEN');
   const sealed=await seal(data.refresh_token,owner,env,crypto);
   await env.DB.prepare('INSERT INTO oauth_token (owner,iv,ciphertext,updated) VALUES (?,?,?,?) ON CONFLICT(owner) DO UPDATE SET iv=excluded.iv,ciphertext=excluded.ciphertext,updated=excluded.updated').bind(owner,sealed.iv,sealed.ciphertext,now).run();
   const session=random(crypto);
   await env.DB.prepare('INSERT INTO oauth_session (session_hash,owner,expires) VALUES (?,?,?)').bind(await shaHex(session,crypto),owner,now+3600).run();
   const headers=new Headers({'location':'/api/status','cache-control':'no-store','referrer-policy':'no-referrer'});
   headers.append('set-cookie',cookie(STATE_COOKIE,'',0,'Lax'));
   headers.append('set-cookie',cookie(SESSION_COOKIE,session,3600));
   return new Response(null,{status:303,headers});
  }
  let owner;
  try{owner=await authenticatedOwner(request,env,crypto,now);}catch{return fail('UNAUTHORIZED',401);}
  if(url.pathname==='/auth/logout'){
   if(request.headers.get('origin')!==url.origin)return fail('ORIGIN_MISMATCH',403);
   const session=getCookie(request,SESSION_COOKIE);
   await env.DB.prepare('DELETE FROM oauth_session WHERE session_hash=? AND owner=?').bind(await shaHex(session,crypto),owner).run();
   return new Response(JSON.stringify({loggedOut:true}),{status:200,headers:{'content-type':'application/json','cache-control':'no-store','set-cookie':cookie(SESSION_COOKIE,'',0)}});
  }
  if(url.pathname==='/api/status'){
   const row=await env.DB.prepare('SELECT owner FROM oauth_token WHERE owner=?').bind(owner).first();
   return json({connected:!!row,mode:'STAGING_ONLY',scope:READ_SCOPE,targetsConfigured:targets.length>0});
  }
  if(targets.length===0)return fail('TARGETS_UNCONFIGURED',409);
  const row=await env.DB.prepare('SELECT iv,ciphertext FROM oauth_token WHERE owner=?').bind(owner).first();
  if(!row)return fail('NOT_CONNECTED',409);
  const refresh=await unseal(row,owner,env,crypto);
  const data=await exchange({grant_type:'refresh_token',refresh_token:refresh},env,fetchFn);
  const results=[],cache=new Map();
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
  return json({mode:'STAGING_ONLY',source:'GAS_API_HEAD_NOT_DEPLOYMENT',scope:READ_SCOPE,files:results});
 }catch{return fail('READ_ONLY_OPERATION_FAILED',502);}
}
module.exports={READ_SCOPE,SCOPES,AUTH_URL,TOKEN_URL,JWKS_URL,STATE_COOKIE,SESSION_COOKIE,random,sha,shaHex,config,verifyGoogleIdToken,seal,unseal,assertScopes,exchange,authenticatedOwner,handle};