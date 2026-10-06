import {NextRequest,NextResponse} from 'next/server'
import {authorizeCalendarApi} from '@/lib/googleCalendarApiAuth'
import {googleOAuthServerConfigured,googleOwnerAuthorizationUrl} from '@/lib/googleCalendarOwnerOAuth'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function POST(request:NextRequest){
  const auth=await authorizeCalendarApi(request)
  if(!auth)return NextResponse.json({error:'unauthorized'},{status:401,headers:{'cache-control':'no-store'}})
  if(auth.role!=='owner')return NextResponse.json({error:'owner_only'},{status:403,headers:{'cache-control':'no-store'}})
  if(!googleOAuthServerConfigured())return NextResponse.json({error:'google_oauth_server_not_configured'},{status:503,headers:{'cache-control':'no-store'}})

  return NextResponse.json({url:googleOwnerAuthorizationUrl(auth.userId)},{headers:{'cache-control':'no-store'}})
}
