'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto').webcrypto;
const bridge=require('../scripts/ai-operations/gas-oauth-worker-staging.cjs');
const b64=b=>Buffer.from(b).toString('base64url');
const encoder=new TextEncoder();
const email='owner@example.test',aud='a'.repeat(64),domain='team.cloudflareaccess.com';
async function fixture(){
 const keypair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keypair.publicKey);jwk.kid='key1';
 const now=1800000000,origin='https://staging.example.test';
 const env={BRIDGE_ENABLED:'true',PUBLIC_ORIGIN:origin,GOOGLE_CLIENT_ID:'example.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'TEST_ONLY',TOKEN_ENCRYPTION_KEY:b64(crypto.getRandomValues(new Uint8Array(32))),CF_ACCESS_TEAM_DOMAIN:domain,CF_ACCESS_AUD:aud,ALLOWED_EMAIL:email,TARGETS_JSON:JSON.stringify([{scriptId:'fakeScriptId_123456789',files:['Remote']}])};
 const state=new Map(),tokens=new Map(),calls=[];
 env.DB={prepare(sql){return{bind(...args){return{async run(){if(sql.startsWith('INSERT INTO oauth_state'))state.set(args[0],{owner:args[1],verifier:args[2],expires:args[3]});else if(sql.startsWith('INSERT INTO oauth_token'))tokens.set(args[0],{iv:args[1],ciphertext:args[2]});else throw Error('unexpected SQL run');return {success:true};},async first(){if(sql.startsWith('DELETE FROM oauth_state')){const row=state.get(args[0]);if(!row||row.owner!==args[1])return null;state.delete(args[0]);return row;}if(sql.startsWith('SELECT owner FROM oauth_token'))return tokens.has(args[0])?{owner:args[0]}:null;if(sql.startsWith('SELECT iv,ciphertext FROM oauth_token'))return tokens.get(args[0])||null;throw Error('unexpected SQL first');}};}}};
 async function jwt(claims={}){const header=b64(JSON.stringify({alg:'RS256',kid:'key1'}));const payload=b64(JSON.stringify({iss:'https://'+domain,aud:[aud],email,exp:now+3600,nbf:now-10,...claims}));const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keypair.privateKey,encoder.encode(header+'.'+payload));return header+'.'+payload+'.'+b64(sig);}
 const fetchFn=async(url,opts)=>{calls.push({url,method:opts.method});if(url.includes('/cdn-cgi/access/certs'))return{ok:true,json:async()=>({keys:[jwk]})};if(url===bridge.TOKEN_URL){const params=new URLSearchParams(opts.body);if(params.get('grant_type')==='authorization_code')return{ok:true,json:async()=>({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600,scope:bridge.SCOPE})};if(params.get('grant_type')==='refresh_token')return{ok:true,json:async()=>({access_token:'test-access-2',expires_in:3600,scope:bridge.SCOPE})};}if(url.startsWith('https://script.googleapis.com/v1/projects/'))return{ok:true,json:async()=>({files:[{name:'Remote',type:'SERVER_JS',source:'function safe() {}'}]})};throw Error('unexpected fetch');};
 const request=async(path,claims,method='GET')=>new Request(origin+path,{method,headers:{'cf-access-jwt-assertion':await jwt(claims)}});
 return{env,now,origin,calls,state,tokens,request,fetchFn,jwt};
}
test('PKCE matches RFC 7636 and scope is read only',async()=>{assert.equal(await bridge.sha('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',crypto),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');assert.equal(bridge.SCOPE,'https://www.googleapis.com/auth/script.projects.readonly');});
test('bridge disabled by default and never calls external APIs',async()=>{let calls=0;const r=await bridge.handle(new Request('https://x.test/auth/start'),{}, {crypto,fetchFn:()=>{calls++;}});assert.equal(r.status,503);assert.equal(calls,0);});
test('configuration rejects HTTP, wrong audience, no DB and non-allowlisted files',async()=>{const f=await fixture();assert.throws(()=>bridge.config({...f.env,DB:null},f.origin),/DB/);assert.throws(()=>bridge.config(f.env,'http://staging.example.test'),/ORIGIN/);assert.throws(()=>bridge.config({...f.env,TARGETS_JSON:JSON.stringify([{scriptId:'fakeScriptId_123456789',files:['../unsafe']}])},f.origin),/TARGET_FILE/);});
test('invalid Access JWT is denied before OAuth or GAS',async()=>{const f=await fixture();const r=await bridge.handle(await f.request('/auth/start',{aud:['wrong']}),f.env,{crypto,fetchFn:f.fetchFn,now:f.now});assert.equal(r.status,401);assert.ok(f.calls.every(c=>c.url.includes('/cdn-cgi/access/certs')===false));});
test('start, single-use callback, encrypted refresh token, GET-only source hash',async()=>{
 const f=await fixture();
 const start=await bridge.handle(await f.request('/auth/start'),f.env,{crypto,fetchFn:f.fetchFn,now:f.now});
 assert.equal(start.status,302);const u=new URL(start.headers.get('location'));
 assert.equal(u.origin,'https://accounts.google.com');assert.equal(u.searchParams.get('scope'),bridge.SCOPE);assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('redirect_uri'),f.origin+'/auth/callback');
 const state=u.searchParams.get('state');assert.ok(state&&f.state.has(state));
 const cb=await bridge.handle(await f.request('/auth/callback?state='+encodeURIComponent(state)+'&code=one-time-code'),f.env,{crypto,fetchFn:f.fetchFn,now:f.now});
 assert.equal(cb.status,200);assert.equal((await cb.json()).connected,true);
 assert.equal(f.tokens.size,1);assert.ok(!JSON.stringify([...f.tokens]).includes('test-refresh'));
 const replay=await bridge.handle(await f.request('/auth/callback?state='+encodeURIComponent(state)+'&code=one-time-code'),f.env,{crypto,fetchFn:f.fetchFn,now:f.now});
 assert.equal(replay.status,400);
 const source=await bridge.handle(await f.request('/api/source'),f.env,{crypto,fetchFn:f.fetchFn,now:f.now});
 assert.equal(source.status,200);const body=await source.json();
 assert.equal(body.files[0].status,'FOUND');assert.match(body.files[0].sha256,/^[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify(body).includes('fakeScriptId'));assert.ok(!JSON.stringify(body).includes('function safe'));
 assert.equal(f.calls.filter(c=>c.url.startsWith('https://script.googleapis.com')).length,1);
 assert.ok(f.calls.filter(c=>c.url.startsWith('https://script.googleapis.com')).every(c=>c.method==='GET'));
});
test('expired callback state and non-GET endpoints fail closed',async()=>{const f=await fixture();const post=await bridge.handle(await f.request('/auth/start',{},'POST'),f.env,{crypto,fetchFn:f.fetchFn,now:f.now});assert.equal(post.status,405);const start=await bridge.handle(await f.request('/auth/start'),f.env,{crypto,fetchFn:f.fetchFn,now:f.now});const state=new URL(start.headers.get('location')).searchParams.get('state');const callback=await bridge.handle(await f.request('/auth/callback?state='+state+'&code=once'),f.env,{crypto,fetchFn:f.fetchFn,now:f.now+400});assert.equal(callback.status,400);});
