import {NextRequest,NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {canAccessPath,permissionDecision,resolveAccessRole} from '@/lib/accessControl'
import {readPermissionSnapshot} from '@/lib/permissionServer'
import {cleanContactInput,validateContactBookEntries} from '@/lib/contactBook'

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
  if(text.includes('CONTACT_BOOK_FORBIDDEN'))return {error:'forbidden',status:403}
  if(text.includes('duplicate_contact_phone'))return {error:'duplicate_contact_phone',status:409}
  if(text.includes('contact_book_version_conflict'))return {error:'contact_book_source_changed_reload',status:409}
  if(text.includes('contact_not_found'))return {error:'contact_not_found',status:404}
  if(text.includes('invalid_')||text.includes('required_fields')||text.includes('field_too_long'))return {error:text,status:400}
  if(text.includes('not_initialized')||text.includes('does not exist')||text.includes('schema cache'))return {error:'contact_book_not_initialized',status:503}
  return {error:'contact_book_request_failed',status:503}
}
export async function GET(request:NextRequest){
  const gate=await authorize(request,'view')
  if(gate.error)return gate.error
  try{
    const {data,error}=await gate.client!.from('contact_book_directory')
      .select('entries,revision,updated_at').eq('id',1).maybeSingle()
    if(error)throw error
    if(!data)throw new Error('contact_book_not_initialized')
    const rows=validateContactBookEntries(data.entries)
    return respond({rows,sourceVersion:String(data.revision),updatedAt:data.updated_at,
      canWrite:true,source:'supabase_contact_book'})
  }catch(error){const result=message(error);return respond(result,result.status)}
}
export async function POST(request:NextRequest){
  const gate=await authorize(request,'manage')
  if(gate.error)return gate.error
  try{
    const input=await request.json()
    const existingId=input?.contactId===null||input?.contactId===''?null:String(input?.contactId||'')
    if(existingId&&!/^3KC-\\d{4,}$/.test(existingId))return respond({error:'invalid_contact_id'},400)
    const expected=String(input?.expectedVersion||'')
    if(!/^[1-9]\\d*$/.test(expected))return respond({error:'contact_source_version_required'},400)
    const contact=cleanContactInput(input?.contact||{})
    const {data,error}=await gate.client!.rpc('contact_book_save',{
      p_expected_revision:Number(expected),p_existing_id:existingId,p_contact:contact
    })
    if(error)throw error
    if(data?.saveVerified!==true)throw new Error('contact_book_save_not_verified')
    return respond({ok:true,...data})
  }catch(error){const result=message(error);return respond(result,result.status)}
}
