import {createClient} from '@supabase/supabase-js'
import {canAccessPath,canEditCalendar,resolveAccessRole,type AccessRole} from '@/lib/accessControl'

const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'

export type CalendarApiAuth={
  userId:string
  role:AccessRole
  editable:boolean
  accessToken:string
}

export async function authorizeCalendarApi(request:Request):Promise<CalendarApiAuth|null>{
  const bearer=request.headers.get('authorization')||''
  const token=bearer.toLowerCase().startsWith('bearer ')?bearer.slice(7).trim():''
  if(!token)return null

  const s=createClient(SUPABASE_URL,SUPABASE_KEY,{
    global:{headers:{Authorization:'Bearer '+token}},
    auth:{persistSession:false,autoRefreshToken:false},
  })
  const {data:{user},error:userError}=await s.auth.getUser(token)
  if(userError||!user)return null

  const {data:profile,error:profileError}=await s.from('profiles').select('role,active').eq('user_id',user.id).maybeSingle()
  if(profileError||!profile?.active)return null

  const role=resolveAccessRole(profile.role,user.id)
  if(!role||!canAccessPath(role,'/calendar'))return null

  return {userId:user.id,role,editable:canEditCalendar(role),accessToken:token}
}
