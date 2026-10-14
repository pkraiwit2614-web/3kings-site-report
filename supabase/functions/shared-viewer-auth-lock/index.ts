import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

// Separate, owner-only Auth function: never change the existing admin-users reset path.
const OWNER_ID = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'
const SHARED_ROLES = new Set(['viewer', 'defect_contributor'])
const FACTOR_NAME = '3K_SHARED_VIEWER_PASSWORD_LOCK_V1'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

function json(payload: unknown, status=200) {
  return new Response(JSON.stringify(payload), {status,headers:{...headers,'Content-Type':'application/json'}})
}

function secretKey() {
  const all = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (all) {
    try {const value=JSON.parse(all);if(value?.default)return String(value.default)}catch{}
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
}
function publishableKey() {
  const all=Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (all) {
    try {const value=JSON.parse(all);if(value?.default)return String(value.default)}catch{}
  }
  return Deno.env.get('SUPABASE_ANON_KEY') || ''
}
function base32Bytes(value:string):Uint8Array {
  const input=value.replace(/=+$/,'').toUpperCase().replace(/\s/g,'')
  if(!/^[A-Z2-7]+$/.test(input))throw Error('invalid_totp_secret')
  let bits=0,buffer=0
  const out:number[]=[]
  for(const char of input){
    const digit='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char)
    buffer=(buffer<<5)|digit
    bits+=5
    if(bits>=8){bits-=8;out.push((buffer>>bits)&0xff)}
  }
  return new Uint8Array(out)
}
async function totp(secret:string):Promise<string>{
  const key=await crypto.subtle.importKey('raw',base32Bytes(secret),{name:'HMAC',hash:'SHA-1'},false,['sign'])
  const seconds=BigInt(Math.floor(Date.now()/30000))
  const payload=new Uint8Array(8)
  let count=seconds
  for(let i=7;i>=0;i--){payload[i]=Number(count&255n);count>>=8n}
  const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,payload))
  const offset=digest[digest.length-1]&15
  const binary=((digest[offset]&127)<<24)|(digest[offset+1]<<16)|(digest[offset+2]<<8)|digest[offset+3]
  return String(binary%1000000).padStart(6,'0')
}

Deno.serve(async (req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers})
  if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405)
  const url=Deno.env.get('SUPABASE_URL')||''
  const secret=secretKey()
  const publishable=publishableKey()
  if(!url||!secret||!publishable)return json({ok:false,error:'server_config_missing'},503)
  const authHeader=req.headers.get('authorization')||''
  const jwt=authHeader.toLowerCase().startsWith('bearer ')?authHeader.slice(7).trim():''
  if(!jwt)return json({ok:false,error:'unauthorized'},401)

  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:identity,error:identityError}=await admin.auth.getUser(jwt)
  if(identityError||!identity.user||identity.user.id!==OWNER_ID)return json({ok:false,error:'forbidden'},403)
  const {data:owner,error:ownerError}=await admin.from('profiles').select('role,active').eq('user_id',OWNER_ID).maybeSingle()
  if(ownerError||!owner?.active||owner.role!=='manager')return json({ok:false,error:'forbidden'},403)

  let payload:{action?:unknown,user_id?:unknown,confirmation?:unknown}
  try{payload=await req.json()}catch{return json({ok:false,error:'invalid_json'},400)}
  const action=String(payload?.action||'status')
  const target=String(payload?.user_id||'')
  if(!UUID_PATTERN.test(target)||target===OWNER_ID||!['status','enable'].includes(action))return json({ok:false,error:'invalid_request'},400)

  const {data:profile,error:profileError}=await admin.from('profiles')
    .select('user_id,username,active,role').eq('user_id',target).maybeSingle()
  if(profileError)return json({ok:false,error:'profile_unavailable'},503)
  if(!profile?.active||!SHARED_ROLES.has(profile.role))return json({ok:false,error:'not_shared_viewer'},403)

  const {data:factors,error:factorError}=await admin.auth.admin.mfa.listFactors({userId:target})
  if(factorError)return json({ok:false,error:'factor_check_failed'},503)
  const entries=factors?.factors||[]
  const owned=entries.filter(f=>f.factor_type==='totp'&&f.friendly_name===FACTOR_NAME&&f.status==='verified')
  const anyVerified=entries.some(f=>f.status==='verified')
  if(action==='status') return json({ok:true,protected:owned.length>0,existingVerifiedFactor:anyVerified})
  if(owned.length)return json({ok:true,protected:true,alreadyProtected:true})
  // Do not auto-add another factor if a different MFA configuration exists.
  if(anyVerified)return json({ok:false,error:'different_mfa_factor_needs_review'},409)
  if(payload?.confirmation!=='ALLOW_ONE_TIME_VIEWER_SIGNOUT')return json({ok:false,error:'explicit_confirmation_required'},400)
  const {data:authUser,error:authUserError}=await admin.auth.admin.getUserById(target)
  if(authUserError||authUser.user?.id!==target||!authUser.user.email?.endsWith('@3kings.invalid')){
    return json({ok:false,error:'unsupported_account_type'},409)
  }

  // Server-side, one-time login with an Admin-generated magiclink: no viewer
  // password is read or changed, and its token is never returned to the browser.
  // GoTrue itself enforces AAL2 on later direct /auth/v1/user password updates.
  let client:ReturnType<typeof createClient>|null=null
  let enrolledId=''
  let confirmed=false
  try{
    const {data:link,error:linkError}=await admin.auth.admin.generateLink({
      type:'magiclink',email:authUser.user.email!,
    })
    const token=link?.properties?.hashed_token
    if(linkError||!token)throw Error('magiclink_not_available')
    client=createClient(url,publishable,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    })
    const {data:login,error:loginError}=await client.auth.verifyOtp({
      type:'magiclink',token_hash:token,
    })
    if(loginError||!login.user||login.user.id!==target)throw Error('temporary_identity_verification_failed')

    const {data:enroll,error:enrollError}=await client.auth.mfa.enroll({
      factorType:'totp',friendlyName:FACTOR_NAME,
    })
    if(enrollError||!enroll?.id||!enroll.totp?.secret)throw Error('mfa_enroll_failed')
    enrolledId=enroll.id
    const {data:challenge,error:challengeError}=await client.auth.mfa.challenge({factorId:enrolledId})
    if(challengeError||!challenge?.id)throw Error('mfa_challenge_failed')
    const {error:verifyError}=await client.auth.mfa.verify({
      factorId:enrolledId,challengeId:challenge.id,code:await totp(enroll.totp.secret),
    })
    if(verifyError)throw Error('mfa_verification_failed')
    confirmed=true
    const {data:verifyFactors,error:verifyFactorsError}=await admin.auth.admin.mfa.listFactors({userId:target})
    const verified=verifyFactors?.factors?.some(f=>f.id===enrolledId&&f.status==='verified')
    if(verifyFactorsError||!verified)throw Error('mfa_postcheck_failed')
    return json({ok:true,protected:true,oneTimeSignout:true})
  }catch(e){
    // Do not delete a possibly verified lock in an uncertain state.
    // Existing Owner-side admin recovery can remove it after inspection.
    if(!confirmed&&enrolledId){
      const {data:check}=await admin.auth.admin.mfa.listFactors({userId:target})
      if(check?.factors?.some(f=>f.id===enrolledId&&f.status==='unverified')){
        await admin.auth.admin.mfa.deleteFactor({userId:target,id:enrolledId})
      }
    }
    return json({ok:false,error:e instanceof Error?e.message:'protection_setup_failed'},409)
  }finally{
    if(client)await client.auth.signOut({scope:'local'}).catch(()=>{})
  }
})
