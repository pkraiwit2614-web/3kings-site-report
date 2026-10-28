'use strict';
// Staging-only Google Apps Script OAuth bridge. No deploy, no active OAuth, no live API calls.
// Fail-closed scaffold: offline route, PKCE and config tests; no token persistence yet.
const SCOPE='https://www.googleapis.com/auth/script.projects.readonly';
const GOOGLE_AUTH='https://accounts.google.com/o/oauth2/v2/auth';
const utf8=s=>new TextEncoder().encode(s);
const b64url=bytes=>Array.from(new Uint8Array(bytes),b=>String.fromCharCode(b)).join('');
const encode=bytes=>btoa(b64url(bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const random=(crypto,n=32)=>encode(crypto.getRandomValues(new Uint8Array(n)));
async function pkceChallenge(verifier,crypto){return encode(await crypto.subtle.digest('SHA-256',utf8(verifier)));}
function checkConfig(env,origin){
 if(env?.BRIDGE_ENABLED!=='true')throw Error('BRIDGE_DISABLED');
 if(!env.GOOGLE_OAUTH_CLIENT_ID||!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_OAUTH_CLIENT_ID))throw Error('CLIENT_ID_INVALID');
 if(!env.PUBLIC_ORIGIN||env.PUBLIC_ORIGIN!==origin||!origin.startsWith('https://'))throw Error('ORIGIN_INVALID');
 if(!env.OAUTH_STATE_KEY||env.OAUTH_STATE_KEY.length<32)throw Error('STATE_KEY_REQUIRED');
 if(!env.SESSION_STORE||typeof env.SESSION_STORE.get!=='function'||typeof env.SESSION_STORE.put!=='function'||typeof env.SESSION_STORE.delete!=='function')throw Error('PRIVATE_SESSION_STORE_REQUIRED');
 if(!env.GOOGLE_OAUTH_CLIENT_SECRET)throw Error('CLIENT_SECRET_REQUIRED');
 return true;
}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; frame-ancestors 'none'"}});}
async function sign(state,key,crypto){const k=await crypto.subtle.importKey('raw',utf8(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return encode(await crypto.subtle.sign('HMAC',k,utf8(state)));}
async function handle(request,env,{crypto=globalThis.crypto,fetchFn=globalThis.fetch}={}){
 const u=new URL(request.url);
 if(u.pathname==='/health'&&request.method==='GET')return reply({service:'3kings-gas-oauth-staging',mode:'OFFLINE_NOT_CONNECTED',oauthConfigured:false});
 // Only health is exposed until private identity verification, encrypted storage,
 // owner-approved callback, Google API target allowlist, and tests are complete.
 return reply({error:'BRIDGE_NOT_ACTIVATED'},503);
}
module.exports={SCOPE,GOOGLE_AUTH,random,pkceChallenge,checkConfig,sign,handle};
