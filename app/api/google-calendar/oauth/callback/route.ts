import {NextRequest,NextResponse} from 'next/server'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(request:NextRequest){
  const target=new URL('/calendar',request.url)
  const code=request.nextUrl.searchParams.get('code')
  const state=request.nextUrl.searchParams.get('state')
  const error=request.nextUrl.searchParams.get('error')

  if(error)target.searchParams.set('google_oauth_error',error)
  if(code)target.searchParams.set('google_oauth_code',code)
  if(state)target.searchParams.set('google_oauth_state',state)

  return NextResponse.redirect(target)
}
