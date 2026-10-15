import {NextRequest,NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {canAccessPath,permissionDecision,resolveAccessRole} from '@/lib/accessControl'
import {readPermissionSnapshot} from '@/lib/permissionServer'
import {cleanContactInput,formatContactCsv,parseContactCsv,putContact} from '@/lib/contactBook'
import {getContactCsvDrive,writeContactCsvDrive} from '@/lib/contactBookDrive'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=60

const URL=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://wtqubwdduzedmcvyhbgs.supabase.co'
const KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||''
function respond(value:unknown,status=200){
  return NextResponse.json(value,{status,headers:{'cache-control':'private, no-store, max-age=0','x-content-type-options':'nosniff'}})
}
async function authorize(request:NextRequest,mode:'view'|'manage'){
  const authorization=request.headers.get('authorization')||''
  const token=authorization.match(/^Bearer\s+(.+)$/i)?.[1]||''
  if(!token||!KEY)return {error:respond({error:'unauthorized'},401)}
  const client=createClient(URL,KEY,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await client.auth.getUser(token)
  if(error||!user)return {error:respond({error:'unauthorized'},401)}
  const {data:profile,error:profileError}=await client.from('profiles').select('role,active').eq('user_id',user.id).maybeSingle()
  if(profileError||!profile?.active)return {error:respond({error:'forbidden'},403)}
  const role=resolveAccessRole(profile.role,user.id)
  if(!role)return {error:respond({error:'forbidden'},403)}
  try{
    const snapshot=await readPermissionSnapshot(client)
    // Do not fall back to legacy permissions: the new module must exist in the live matrix.
    if(!snapshot.rows.some(x=>x.role===role&&x.module==='contact_book'))return {error:respond({error:'contact_permissions_not_installed'},503)}
    if(!canAccessPath(role,'/contact-book',snapshot)||!permissionDecision(role,'contact_book',mode,false,snapshot)){
      return {error:respond({error:'forbidden'},403)}
    }
  }catch{return {error:respond({error:'permission_check_unavailable'},503)}}
  return {client}
}
function message(error:unknown){
  const text=error instanceof Error?error.message:'contact_book_unknown_error'
  if(text.includes('CONTACT_BOOK_BUSY'))return {error:'contact_book_busy',status:409}
  if(text.includes('duplicate_contact_phone'))return {error:'duplicate_contact_phone',status:409}
  if(text.includes('contact_not_found'))return {error:'contact_not_found',status:404}
  if(text.includes('invalid_')||text.includes('required_fields')||text.includes('field_too_long'))return {error:text,status:400}
  if(text.includes('version_conflict')||text.includes('changed_during_read'))return {error:'contact_book_source_changed_reload',status:409}
  if(text.includes('not_configured')||text.includes('not_shared_or_denied'))return {error:text,status:503}
  return {error:text.startsWith('contact_')?text:'contact_book_request_failed',status:503}
}
export async function GET(request:NextRequest){
  const gate=await authorize(request,'view')
  if(gate.error)return gate.error
  try{
    const source=await getContactCsvDrive()
    const rows=parseContactCsv(source.csv)
    return respond({rows,sourceVersion:source.version,updatedAt:source.modifiedTime,source:'drive_csv'})
  }catch(error){const result=message(error);return respond(result,result.status)}
}
export async function POST(request:NextRequest){
  const gate=await authorize(request,'manage')
  if(gate.error)return gate.error
  const client=gate.client!
  let lease:string|null=null
  let committed=false
  try{
    const input=await request.json()
    const existingId=input?.contactId===null||input?.contactId===''?null:String(input?.contactId||'')
    if(existingId&&!/^3KC-\d{4,}$/.test(existingId))return respond({error:'invalid_contact_id'},400)
    const expected=String(input?.expectedVersion||'').trim()
    if(!/^\d+$/.test(expected))return respond({error:'contact_source_version_required'},400)
    const contact=cleanContactInput(input?.contact||{})
    const {data,error}=await client.rpc('contact_book_acquire_write')
    if(error)throw error
    if(typeof data!=='string')throw new Error('contact_book_lease_unavailable')
    lease=data
    // Exclusive lease across serverless instances serializes duplicate checks and writes.
    const source=await getContactCsvDrive()
    if(source.version!==expected)throw new Error('contact_drive_file_version_conflict')
    const previous=parseContactCsv(source.csv)
    const before=existingId?previous.find(x=>x.contact_id===existingId)||null:null
    const {rows,record}=putContact(previous,existingId,contact)
    await writeContactCsvDrive(formatContactCsv(rows))
    committed=true
    const verified=await getContactCsvDrive()
    const reread=parseContactCsv(verified.csv)
    const stored=reread.find(x=>x.contact_id===record.contact_id)
    if(!stored||JSON.stringify(stored)!==JSON.stringify(record)||reread.length!==rows.length){
      throw new Error('contact_drive_verification_failed_refresh_before_retry')
    }
    const {error:releaseError}=await client.rpc('contact_book_release_write',{
      p_lease:lease,p_contact_id:record.contact_id,p_before:before,p_after:record,p_drive_version:verified.version
    })
    if(releaseError)throw releaseError
    lease=null
    return respond({ok:true,record,sourceVersion:verified.version,updatedAt:verified.modifiedTime,driveVerified:true})
  }catch(error){
    const result=message(error)
    return respond({...result,refreshBeforeRetry:committed},committed?503:result.status)
  }finally{
    if(lease){try{await client.rpc('contact_book_release_write',{p_lease:lease})}catch{/* stale leases expire after 2 minutes */}}
  }
}
