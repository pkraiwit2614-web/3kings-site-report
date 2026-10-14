const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const ts=require('typescript')
const vm=require('node:vm')
const {webcrypto}=require('node:crypto')

const src=fs.readFileSync('supabase/functions/shared-viewer-auth-lock/index.ts','utf8')
const userUI=fs.readFileSync('app/users/page.tsx','utf8')
const adminCode=fs.readFileSync('supabase/functions/admin-users/index.ts','utf8')
const OWNER='bc6ee244-3472-422f-bbf9-d551987ee9a3'
const VIEWER='11111111-1111-4111-8111-111111111111'

function makeApp({role='viewer',isOwner=true,confirm=true,existingFactor=null,magicLinkWorks=true}={}){
  let serve
  let verifierCalls=0
  let magicLinkCalls=0
  let enrollCalls=0
  let resetCalls=0
  let verified=false
  let signoutCalls=0
  const fnId='22222222-2222-4222-8222-222222222222'
  const factorList=()=>existingFactor?[existingFactor]:(verified?[{id:fnId,factor_type:'totp',friendly_name:'3K_SHARED_VIEWER_PASSWORD_LOCK_V1',status:'verified'}]:[])
  const admin={
    auth:{
      getUser:async token=>({data:{user:isOwner&&token==='owner-token'?{id:OWNER}:null},error:null}),
      admin:{
        getUserById:async ()=>({data:{user:{id:VIEWER,email:'user11@3kings.invalid'}},error:null}),
        generateLink:async()=>{magicLinkCalls++;return magicLinkWorks?{data:{properties:{hashed_token:'one-time-hash'}},error:null}:{data:null,error:Error('unavailable')}},
        mfa:{
          listFactors:async()=>({data:{factors:factorList()},error:null}),
          deleteFactor:async()=>({error:null}),
        },
        updateUserById:async()=>{resetCalls++;return {error:null}},
      },
    },
    from:tablename=>{
      assert.equal(tablename,'profiles')
      return {select:()=>({eq:(_key,id)=>({maybeSingle:async()=>({
        data:id===OWNER?{active:true,role:'manager'}:{user_id:VIEWER,username:'USER11',active:true,role},
        error:null,
      })})})}
    },
  }
  const verifier={
    auth:{
      verifyOtp:async o=>({data:{user:o.token_hash==='one-time-hash'?{id:VIEWER}:null},error:null}),
      mfa:{
        enroll:async()=>{enrollCalls++;return {data:{id:fnId,totp:{secret:'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'}},error:null}},
        challenge:async()=>({data:{id:'33333333-3333-4333-8333-333333333333'},error:null}),
        verify:async o=>{assert.match(o.code,/^\d{6}$/);const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=require('node:crypto').createHmac('sha1',Buffer.from('12345678901234567890')).update(counter).digest();const idx=h[h.length-1]&15;const n=((h[idx]&127)<<24)|(h[idx+1]<<16)|(h[idx+2]<<8)|h[idx+3];assert.equal(o.code,String(n%1000000).padStart(6,'0'));verified=true;verifierCalls++;return {error:null}},
      },
      signOut:async o=>{assert.equal(o.scope,'local');signoutCalls++;return {error:null}},
    },
  }
  const code=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
  const mod={exports:{}}
  const context={
    module:mod,exports:mod.exports,
    require:key=>{assert.equal(key,'npm:@supabase/supabase-js@2.95.0');return {createClient:(_u,key)=>key==='secret-test'?admin:verifier}},
    Deno:{env:{get:key=>({
      SUPABASE_URL:'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'secret-test',
      SUPABASE_ANON_KEY:'pub-test',
    })[key]||''},serve:fn=>serve=fn},
    Uint8Array,BigInt,Date,Response,Request,crypto:webcrypto,Set,Error,JSON,String,Number,Math,
  }
  vm.runInNewContext(code,context,{timeout:3000})
  async function post(action='status',confirmation,authorization='owner-token'){
    const r=new Request('https://test.supabase.co/functions/v1/shared-viewer-auth-lock',{method:'POST',headers:{authorization:'Bearer '+authorization,'content-type':'application/json'},body:JSON.stringify({action,user_id:VIEWER,confirmation})})
    const response=await serve(r)
    return {status:response.status,data:await response.json()}
  }
  return {post,get:()=>({magicLinkCalls,enrollCalls,verifierCalls,resetCalls,signoutCalls})}
}

test('Shared Viewer is allowed only for active owner requests', async()=>{
  const outsider=makeApp({isOwner:false})
  assert.equal((await outsider.post()).status,403)
  assert.equal(outsider.get().magicLinkCalls,0)
  const purchase=makeApp({role:'purchase'})
  assert.equal((await purchase.post()).status,403)
  assert.equal(purchase.get().magicLinkCalls,0)
})
test('read-only protection status never creates a session or changes credentials',async()=>{
  const x=makeApp()
  const r=await x.post()
  assert.equal(r.status,200)
  assert.equal(r.data.protected,false)
  assert.deepEqual(x.get(),{magicLinkCalls:0,enrollCalls:0,verifierCalls:0,resetCalls:0,signoutCalls:0})
})
test('Owner must explicitly accept one-time signout before enabling MFA',async()=>{
  const x=makeApp()
  assert.equal((await x.post('enable')).status,400)
  assert.equal(x.get().enrollCalls,0)
})
test('Server-only magiclink and verified MFA protect Viewer without changing password',async()=>{
  const x=makeApp()
  const result=await x.post('enable','ALLOW_ONE_TIME_VIEWER_SIGNOUT')
  assert.equal(result.status,200,JSON.stringify(result.data))
  assert.equal(result.data.protected,true)
  assert.equal(result.data.oneTimeSignout,true)
  assert.equal(x.get().enrollCalls,1)
  assert.equal(x.get().verifierCalls,1)
  assert.equal(x.get().resetCalls,0)
  assert.equal(x.get().signoutCalls,1)
  assert.doesNotMatch(JSON.stringify(result.data),/secret|hash|password|factor_id/i)
  const followup=await x.post('status')
  assert.equal(followup.data.protected,true)
  assert.equal((await x.post('enable','ALLOW_ONE_TIME_VIEWER_SIGNOUT')).data.alreadyProtected,true)
  assert.equal(x.get().enrollCalls,1)
})
test('Existing verified MFA causes safe denial rather than inserting a duplicate',async()=>{
  const x=makeApp({existingFactor:{id:'other-factor',factor_type:'totp',friendly_name:'other',status:'verified'}})
  const r=await x.post('enable','ALLOW_ONE_TIME_VIEWER_SIGNOUT')
  assert.equal(r.status,409)
  assert.equal(x.get().enrollCalls,0)
})
test('Provider failure returns an error without changing password or activating protection',async()=>{
  const x=makeApp({magicLinkWorks:false})
  const r=await x.post('enable','ALLOW_ONE_TIME_VIEWER_SIGNOUT')
  assert.equal(r.status,409)
  assert.equal(x.get().enrollCalls,0)
  assert.equal(x.get().resetCalls,0)
})
test('Existing Owner Reset path is not replaced and account-lock UI stays Owner-only',()=>{
  assert.match(adminCode,/if \(action === 'reset_password'\)/)
  assert.match(adminCode,/admin\.auth\.admin\.updateUserById\(target, \{ password \}\)/)
  assert.match(userUI,/<OwnerOnlyGate>/)
  assert.match(userUI,/functions\.invoke\('shared-viewer-auth-lock'/)
  assert.match(userUI,/ALLOW_ONE_TIME_VIEWER_SIGNOUT/)
  assert.match(userUI,/row\.role === 'viewer' \|\| row\.role === 'defect_contributor'/)
  assert.doesNotMatch(src,/SetPassword|updateUserById|password:|service_role_key.*client/i)
})
