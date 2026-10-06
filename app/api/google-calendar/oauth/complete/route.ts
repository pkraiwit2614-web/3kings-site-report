import {NextRequest,NextResponse} from 'next/server'
import {authorizeCalendarApi} from '@/lib/googleCalendarApiAuth'
import {encryptGoogleRefreshToken,exchangeGoogleAuthorizationCode,verifyGoogleOAuthState} from '@/lib/googleCalendarOwnerOAuth'
import {storeEncryptedGoogleRefreshToken} from '@/lib/googleCalendarTokenStore'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function POST(request:NextRequest){
  const auth=await authorizeCalendarApi(request)
  if(!auth)return NextResponse.json({error:'unauthorized'},{status:401,headers:{'cache-control':'no-store'}})
  if(auth.role!=='owner')return NextResponse.json({error:'owner_only'},{status:403,headers:{'cache-control':'no-store'}})

  try{
    const input=await request.json()
    const code=String(input?.code||'').trim()
    const state=String(input?.state||'').trim()
    if(!code||!state)return NextResponse.json({error:'missing_oauth_code_or_state'},{status:400,headers:{'cache-control':'no-store'}})

    verifyGoogleOAuthState(state,auth.userId)
    const tokens=await exchangeGoogleAuthorizationCode(code)
    const ciphertext=encryptGoogleRefreshToken(tokens.refreshToken)
    await storeEncryptedGoogleRefreshToken(auth.accessToken,ciphertext)

    return NextResponse.json({ok:true},{headers:{'cache-control':'no-store'}})
  }catch(error){
    return NextResponse.json({error:(error as Error).message||'google_oauth_complete_failed'},{status:400,headers:{'cache-control':'no-store'}})
  }
}
