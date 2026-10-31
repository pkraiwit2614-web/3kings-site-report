'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto').webcrypto;
const bridge=require('../scripts/ai-operations/gas-oauth-worker-staging.cjs');
const b64=b=>Buffer.from(b).toString('base64url');
const owner='owner@example.test',origin='https://staging.example.test',now=1800000000;
const scriptId='fakeScriptId_123456789';
const mockSource='function safe() {}';
async function fixture(){
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='kid-1';
 const states=new Map(),sessions=new Map(),tokens=new Map(),rates=new Map(),calls=[];
 const env={BRIDGE_ENABLED:'true',PUBLIC_ORIGIN:origin,GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fake-client-secret',TOKEN_ENCRYPTION_KEY:b64(crypto.getRandomValues(new Uint8Array(32))),ALLOWED_EMAIL:owner,TARGETS_JSON:JSON.stringify([{scriptId,files:['Remote']}])};
 env.DB={prepare(sql){return{bind(...args){return{
  async run(){
   if(sql.startsWith('INSERT INTO oauth_state'))states.set(args[0],{owner:args[1],verifier:args[2],expires:args[3],browser_hash:args[4],nonce:args[5]});
   else if(sql.startsWith('INSERT INTO oauth_token'))tokens.set(args[0],{iv:args[1],ciphertext:args[2]});
   else if(sql.startsWith('INSERT INTO oauth_session'))sessions.set(args[0],{owner:args[1],expires:args[2]});
   else if(sql.startsWith('DELETE FROM oauth_session'))sessions.delete(args[0]);
   else throw Error('unexpected SQL run '+sql);
   return{success:true};
  },
  async first(){
   if(sql.startsWith('INSERT INTO oauth_rate')){const n=(rates.get(args[0])||0)+1;rates.set(args[0],n);return{hits:n};}
   if(sql.startsWith('DELETE FROM oauth_state')){const row=states.get(args[0]);if(!row||row.owner!==args[1]||row.browser_hash!==args[2])return null;states.delete(args[0]);return row;}
   if(sql.startsWith('SELECT owner,expires FROM oauth_session'))return sessions.get(args[0])||null;
   if(sql.startsWith('SELECT owner FROM oauth_token'))return tokens.has(args[0])?{owner:args[0]}:null;
   if(sql.startsWith('SELECT iv,ciphertext FROM oauth_token'))return tokens.get(args[0])||null;
   throw Error('unexpected SQL first '+sql);
  }
 };}};}};
 let nonce='',claimsOverride={},scopeOverride=null;
 async function jwt(){
  const h=b64(JSON.stringify({alg:'RS256',kid:'kid-1'}));
  const p=b64(JSON.stringify({iss:'https://accounts.google.com',aud:env.GOOGLE_CLIENT_ID,exp:now+3600,iat:now-20,nonce,email:owner,email_verified:true,sub:'google-owner-sub',...claimsOverride}));
  const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(h+'.'+p));
  return h+'.'+p+'.'+b64(sig);
 }
 const fetchFn=async(url,opts)=>{
  calls.push({url,method:opts.method});
  if(url===bridge.JWKS_URL)return{ok:true,json:async()=>({keys:[jwk]})};
  if(url===bridge.TOKEN_URL){
   const grant=new URLSearchParams(opts.body).get('grant_type');
   if(grant==='authorization_code')return{ok:true,json:async()=>({access_token:'fake-access',refresh_token:'fake-refresh',id_token:await jwt(),expires_in:3600,scope:scopeOverride||bridge.SCOPES})};
   if(grant==='refresh_token')return{ok:true,json:async()=>({access_token:'fake-access-refresh',expires_in:3600,scope:bridge.SCOPES})};
  }
  if(url.startsWith('https://script.googleapis.com/v1/projects/'))return{ok:true,json:async()=>({files:[{name:'Remote',type:'SERVER_JS',source:mockSource}]})};
  throw Error('unexpected external call');
 };
 const request=(path,cookie='',method='GET',extra={})=>new Request(origin+path,{method,headers:{...(cookie?{cookie}:{}),...extra}});
 const run=(req,t=now)=>bridge.handle(req,env,{crypto,fetchFn,now:t});
 async function start(){
  const res=await run(request('/auth/start','','GET',{'cf-connecting-ip':'203.0.113.1'}));
  assert.equal(res.status,302);
  const url=new URL(res.headers.get('location'));
  nonce=url.searchParams.get('nonce');
  const stateCookie=res.headers.get('set-cookie').split(';')[0];
  return{url,stateCookie,state:url.searchParams.get('state')};
 }
 async function callback(flow,cookie=flow.stateCookie,t=now){
  return run(request('/auth/callback?state='+encodeURIComponent(flow.state)+'&code=fake-code',cookie),t);
 }
 return{env,states,sessions,tokens,rates,calls,request,run,start,callback,setClaims:x=>{claimsOverride=x;},setScope:x=>{scopeOverride=x;}};
}
test('PKCE RFC7636 and minimal readonly OAuth scope',async()=>{
 assert.equal(await bridge.sha('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',crypto),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
 assert.equal(bridge.SCOPES,'openid email https://www.googleapis.com/auth/script.projects.readonly');
});
test('disabled bridge never calls external services',async()=>{
 let calls=0;const response=await bridge.handle(new Request(origin+'/auth/start'),{}, {crypto,fetchFn:()=>{calls++;}});
 assert.equal(response.status,503);assert.equal(calls,0);
});
test('config denies missing secrets, unsafe mapping and HTTP origin',async()=>{
 const f=await fixture();
 assert.throws(()=>bridge.config({...f.env,DB:null},origin),/DB/);
 assert.throws(()=>bridge.config(f.env,'http://staging.example.test'),/ORIGIN/);
 assert.throws(()=>bridge.config({...f.env,TARGETS_JSON:JSON.stringify([{scriptId,files:['../unsafe']}])},origin),/TARGET_FILE/);
});
test('OAuth owner flow: state cookie, verified Google JWT, encrypted token, session and GET-only hash',async()=>{
 const f=await fixture(),flow=await f.start();
 assert.equal(flow.url.searchParams.get('scope'),bridge.SCOPES);
 assert.equal(flow.url.searchParams.get('code_challenge_method'),'S256');
 assert.equal(flow.url.searchParams.get('redirect_uri'),origin+'/auth/callback');
 const res=await f.callback(flow);assert.equal(res.status,303);
 const cookies=res.headers.getSetCookie();assert.ok(cookies.some(s=>s.includes(bridge.SESSION_COOKIE)));
 const sessionCookie=cookies.find(s=>s.startsWith(bridge.SESSION_COOKIE+'=')).split(';')[0];
 assert.equal(f.tokens.size,1);assert.equal(f.sessions.size,1);
 assert.ok(!JSON.stringify([...f.tokens]).includes('fake-refresh'));
 assert.ok(!JSON.stringify([...f.sessions]).includes(sessionCookie.split('=')[1]));
 const status=await f.run(f.request('/api/status',sessionCookie));
 assert.equal(status.status,200);assert.equal((await status.json()).connected,true);
 const source=await f.run(f.request('/api/source',sessionCookie));
 assert.equal(source.status,200);const body=await source.json();
 assert.equal(body.files[0].status,'FOUND');assert.match(body.files[0].sha256,/^[a-f0-9]{64}$/);
 assert.equal(body.files[0].sha256,await bridge.shaHex(mockSource,crypto));
 assert.ok(!JSON.stringify(body).includes(scriptId));assert.ok(!JSON.stringify(body).includes(mockSource));
 assert.ok(f.calls.filter(c=>c.url.startsWith('https://script.googleapis.com')).every(c=>c.method==='GET'));
 const replay=await f.callback(flow);assert.equal(replay.status,400);
 const noCookie=await f.run(f.request('/api/source'));assert.equal(noCookie.status,401);
});
test('wrong Google email cannot store tokens or create sessions',async()=>{
 const f=await fixture(),flow=await f.start();
 f.setClaims({email:'attacker@example.test'});
 const r=await f.callback(flow);assert.equal(r.status,502);assert.equal(f.tokens.size,0);assert.equal(f.sessions.size,0);
});
test('forged or mismatched Google nonce and excessive scope are rejected',async()=>{
 const f=await fixture(),flow=await f.start();
 f.setClaims({nonce:'wrong'});
 const r=await f.callback(flow);assert.equal(r.status,502);assert.equal(f.tokens.size,0);
 const g=await fixture(),flow2=await g.start();g.setScope(bridge.SCOPES+' https://www.googleapis.com/auth/script.projects');
 const bad=await g.callback(flow2);assert.equal(bad.status,502);assert.equal(g.tokens.size,0);
});
test('callback cookie binding and state expiry prevent unauthorized exchange',async()=>{
 const f=await fixture(),flow=await f.start();
 const bad=await f.callback(flow,bridge.STATE_COOKIE+'=wrong');assert.equal(bad.status,400);
 assert.equal(f.calls.filter(c=>c.url===bridge.TOKEN_URL).length,0);
 const expired=await f.callback(flow,flow.stateCookie,now+301);assert.equal(expired.status,400);
});
test('rate limit, CSRF-safe logout, unauthenticated source and method guards',async()=>{
 const f=await fixture();
 for(let i=0;i<5;i++)assert.equal((await f.start()).url.origin,'https://accounts.google.com');
 const limit=await f.run(f.request('/auth/start','','GET',{'cf-connecting-ip':'203.0.113.1'}));assert.equal(limit.status,502);
 const unauthorized=await f.run(f.request('/api/source'));assert.equal(unauthorized.status,401);
 const wrongMethod=await f.run(f.request('/api/source','','POST'));assert.equal(wrongMethod.status,405);
});

test('token failures are classified without exposing response details or retrying one-time codes',async()=>{
 const env={GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fake-secret'};
 const params={grant_type:'authorization_code',code:'one-time-private-code',code_verifier:'test-verifier'};
 for(const [name,expected] of [['TypeError','TOKEN_REQUEST_NETWORK'],['TimeoutError','TOKEN_REQUEST_TIMEOUT']]){
  let calls=0;
  const fetchFn=async()=>{calls++;const error=new Error('private oauth credential');error.name=name;throw error;};
  await assert.rejects(bridge.exchange(params,env,fetchFn),e=>e.message===expected&&!e.message.includes('private'));
  assert.equal(calls,1);
 }
 await assert.rejects(bridge.exchange(params,env,async()=>({ok:true,json:async()=>{throw Error('raw private response');}})),/TOKEN_RESPONSE_INVALID/);
 await assert.rejects(bridge.exchange(params,env,async()=>({ok:false,status:401})),/TOKEN_EXCHANGE/);
 await assert.rejects(bridge.exchange(params,env,async()=>({ok:true,json:async()=>({access_token:'private',expires_in:3600,scope:12})})),/SCOPE_MISMATCH/);
});
