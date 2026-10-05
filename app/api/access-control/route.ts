import {NextRequest,NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {canAccessPath,defaultPathForRole,resolveAccessRole} from '@/lib/accessControl'

export const runtime='nodejs'

const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'

export async function GET(request:NextRequest){
  const path=request.nextUrl.searchParams.get('path')||'/'
  if(!path.startsWith('/')||path.length>320)return NextResponse.json({allowed:false,error:'invalid_path'},{status:400})

  const bearer=request.headers.get('authorization')||''
  const token=bearer.toLowerCase().startsWith('bearer ')?bearer.slice(7).trim():''
  if(!token)return NextResponse.json({allowed:false},{status:401,headers:{'cache-control':'no-store'}})

  const s=createClient(SUPABASE_URL,SUPABASE_KEY,{
    global:{headers:{Authorization:`Bearer ${token}`}},
    auth:{persistSession:false,autoRefreshToken:false},
  })
  const {data:{user},error:userError}=await s.auth.getUser(token)
  if(userError||!user)return NextResponse.json({allowed:false},{status:401,headers:{'cache-control':'no-store'}})

  const {data:profile,error:profileError}=await s.from('profiles').select('role,active').eq('user_id',user.id).maybeSingle()
  if(profileError||!profile?.active)return NextResponse.json({allowed:false},{status:403,headers:{'cache-control':'no-store'}})

  const role=resolveAccessRole(profile.role,user.id)
  if(!role)return NextResponse.json({allowed:false},{status:403,headers:{'cache-control':'no-store'}})

  const allowed=canAccessPath(role,path)
  return NextResponse.json(
    {allowed,role,redirect:allowed?null:defaultPathForRole(role)},
    {status:allowed?200:403,headers:{'cache-control':'no-store'}}
  )
}
