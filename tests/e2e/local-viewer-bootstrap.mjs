// Dedicated disposable local Supabase credentials; never touches a hosted project.
import {createClient} from '@supabase/supabase-js'
import {randomBytes} from 'node:crypto'
import {appendFileSync} from 'node:fs'
const origin = process.env.API_URL
if (!/^http:\/\/127\.0\.0\.1:54321\/?$/.test(origin||'')) throw Error('BLOCK_REMOTE_DATABASE')
if (!process.env.SERVICE_ROLE_KEY || !process.env.ANON_KEY || !process.env.GITHUB_ENV)
  throw Error('BLOCK_LOCAL_KEYS_MISSING')
const secret = randomBytes(28).toString('base64url')
const client = createClient(origin,process.env.SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}})
const create = async name => {
  const {data,error}=await client.auth.admin.createUser({
    email:name+'@3kings.invalid',password:secret,email_confirm:true,
    app_metadata:{app_role:'viewer',provisioned_by_admin:true},
  })
  if(error||!data?.user?.id) throw Error('FAIL_LOCAL_AUTH_BOOTSTRAP')
  const {error:profileError}=await client.from('profiles').insert({
    user_id:data.user.id,full_name:'CI-ONLY',role:'viewer',active:true,email:name+'@3kings.invalid'
  })
  if(profileError) throw Error('FAIL_LOCAL_PROFILE_BOOTSTRAP')
  return data.user.id
}
const own=await create('ci-viewer')
const other=await create('ci-other')
if(own===other)throw Error('FAIL_DUPLICATE_CI_VIEWER')
const vars={
  KINGS_LOCAL_VIEWER_LOGIN:'ci-viewer@3kings.invalid',
  KINGS_LOCAL_VIEWER_PASSWORD:secret,
  KINGS_LOCAL_OTHER_PROFILE_ID:other
}
for(const value of Object.values(vars)) console.log('::add-mask::'+value)
for(const [key,val] of Object.entries(vars)) appendFileSync(process.env.GITHUB_ENV,key+'='+val+'\n')
console.log('CI_ONLY_TWO_AUTH_USERS_BOOTSTRAPPED (details masked)')
