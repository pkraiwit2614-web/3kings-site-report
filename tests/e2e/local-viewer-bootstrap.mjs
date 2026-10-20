// Dedicated disposable local Supabase credentials; never touches a hosted project.
import {createClient} from '@supabase/supabase-js'
import {randomBytes} from 'node:crypto'
import {appendFileSync} from 'node:fs'
const origin = process.env.API_URL
if (!/^http:\/\/127\.0\.0\.1:54321\/?$/.test(origin||'')) throw Error('BLOCK_REMOTE_DATABASE')
if (!process.env.SERVICE_ROLE_KEY || !process.env.ANON_KEY || !process.env.GITHUB_ENV)
  throw Error('BLOCK_LOCAL_KEYS_MISSING')
const secret = randomBytes(28).toString('base64url')
const suffix = randomBytes(8).toString('hex')
const client = createClient(origin,process.env.SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}})
const create = async name => {
  // GoTrue rejects reserved example.com/.invalid test email domains.
  // This random address exists only in local Supabase; SMTP is disabled.
  const email=name+'-'+suffix+'@gmail.com'
  const {data,error}=await client.auth.admin.createUser({
    email:email,password:secret,email_confirm:true,
    app_metadata:{app_role:'viewer',provisioned_by_admin:true},
  })
  if(error||!data?.user?.id) throw Error('FAIL_LOCAL_AUTH_BOOTSTRAP')
  const {error:profileError}=await client.from('profiles').insert({
    user_id:data.user.id,full_name:'CI-ONLY',role:'viewer',active:true,email:email
  })
  if(profileError) throw Error('FAIL_LOCAL_PROFILE_BOOTSTRAP')
  return {id:data.user.id,email}
}
const own=await create('ci-viewer')
const other=await create('ci-other')
if(own.id===other.id)throw Error('FAIL_DUPLICATE_CI_VIEWER')
const vars={
  KINGS_LOCAL_VIEWER_LOGIN:own.email,
  KINGS_LOCAL_VIEWER_PASSWORD:secret,
  KINGS_LOCAL_OTHER_PROFILE_ID:other.id
}
for(const value of Object.values(vars)) console.log('::add-mask::'+value)
for(const [key,val] of Object.entries(vars)) appendFileSync(process.env.GITHUB_ENV,key+'='+val+'\n')
console.log('CI_ONLY_TWO_AUTH_USERS_BOOTSTRAPPED (details masked)')
