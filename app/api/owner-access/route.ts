import {NextRequest,NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'

export const runtime='nodejs'

const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'

export async function GET(request:NextRequest){
  const bearer=request.headers.get('authorization')||''
  const token=bearer.toLowerCase().startsWith('bearer ')?bearer.slice(7).trim():''
  if(!token)return NextResponse.json({ok:false},{status:401})

  const s=createClient(SUPABASE_URL,SUPABASE_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:userError}=await s.auth.getUser(token)
  if(userError||!user)return NextResponse.json({ok:false},{status:401})

  const {data:profile,error}=await s.from('profiles').select('full_name,role,active').eq('user_id',user.id).maybeSingle()
  if(error)return NextResponse.json({ok:false},{status:403})
  const allowed=Boolean(profile?.active&&profile?.role==='manager'&&String(profile?.full_name||'').trim().toLowerCase()==='golf')
  return NextResponse.json({ok:allowed},{status:allowed?200:403,headers:{'cache-control':'no-store'}})
}
