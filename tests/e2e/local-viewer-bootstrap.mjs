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
// Synthetic completed registry with 60 documents and 60 lines. This ONLY runs on localhost.
const {data:run,error:runError}=await client.from('express_register_runs')
 .insert({source_fingerprint:'b'.repeat(64),state:'complete',source_files:6,
  document_count:60,line_count:60,canceled_count:2,review_count:1,
  completed_at:new Date().toISOString()}).select('id').single()
if(runError||!run?.id)throw Error('FAIL_LOCAL_EXPRESS_RUN_SEED')
const rows=[]
for(let n=1;n<=60;n++){
 const no='PO'+String(n).padStart(9,'0')
 const shared={batch_id:run.id,document_group:'PO_PL',document_no:no,
  document_date:'2026-10-23',supplier:'CI-ONLY VENDOR',plot_codes:['AV-P3'],
  qa_status:n===60?'SOURCE_LINE_REVIEW':'VERIFIED_SOURCE_ONLY',source_file:'CI-ONLY.csv',
  source_url:null}
 rows.push({...shared,line_seq:0,item_code:null,description:null,grand_total:500,
  search_text:no+' CI-ONLY VENDOR AV-P3'})
 rows.push({...shared,line_seq:1,item_code:'CI-'+n,description:'Synthetic item '+n,
  quantity:1,unit:'each',unit_price:500,line_amount:500,
  search_text:no+' Synthetic item '+n})
}
const {error:rowsError}=await client.from('express_register_rows').insert(rows)
if(rowsError)throw Error('FAIL_LOCAL_EXPRESS_LINES_SEED')
console.log('CI_ONLY_EXPRESS_REGISTER_60_DOCUMENTS_SEEDED')
const vars={
  KINGS_LOCAL_VIEWER_LOGIN:own.email,
  KINGS_LOCAL_VIEWER_PASSWORD:secret,
  KINGS_LOCAL_OTHER_PROFILE_ID:other.id
}
for(const value of Object.values(vars)) console.log('::add-mask::'+value)
for(const [key,val] of Object.entries(vars)) appendFileSync(process.env.GITHUB_ENV,key+'='+val+'\n')
console.log('CI_ONLY_TWO_AUTH_USERS_BOOTSTRAPPED (details masked)')
