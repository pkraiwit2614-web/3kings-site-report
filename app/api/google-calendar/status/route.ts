import {NextRequest,NextResponse} from 'next/server'
import {authorizeCalendarApi} from '@/lib/googleCalendarApiAuth'
import {googleCalendarServiceConfigured} from '@/lib/googleCalendarServer'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(request:NextRequest){
  const auth=await authorizeCalendarApi(request)
  if(!auth)return NextResponse.json({configured:false,error:'unauthorized'},{status:401,headers:{'cache-control':'no-store'}})

  return NextResponse.json({
    configured:googleCalendarServiceConfigured(),
    editable:auth.editable,
    role:auth.role,
  },{headers:{'cache-control':'no-store'}})
}
