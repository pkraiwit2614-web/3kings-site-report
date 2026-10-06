import {NextRequest,NextResponse} from 'next/server'
import {authorizeCalendarApi} from '@/lib/googleCalendarApiAuth'
import {googleOAuthServerConfigured} from '@/lib/googleCalendarOwnerOAuth'
import {googleCalendarSharedConfigured} from '@/lib/googleCalendarServer'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(request:NextRequest){
  const auth=await authorizeCalendarApi(request)
  if(!auth)return NextResponse.json({configured:false,error:'unauthorized'},{status:401,headers:{'cache-control':'no-store'}})

  const serverConfigured=googleOAuthServerConfigured()
  const connected=serverConfigured?await googleCalendarSharedConfigured(auth.accessToken):false

  return NextResponse.json({
    configured:connected,
    serverConfigured,
    ownerSetupRequired:auth.role==='owner'&&serverConfigured&&!connected,
    editable:auth.editable,
    role:auth.role,
  },{headers:{'cache-control':'no-store'}})
}
