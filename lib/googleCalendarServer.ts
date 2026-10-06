import {createSign} from 'node:crypto'

const TOKEN_URL='https://oauth2.googleapis.com/token'
const CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar.events'

let cached:{token:string;expiresAt:number}|null=null

function base64Url(value:string|Buffer){
  return Buffer.from(value).toString('base64url')
}

export function googleCalendarServiceConfigured(){
  return Boolean(
    process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY
  )
}

function serviceEmail(){
  const value=process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL||''
  if(!value)throw new Error('google_calendar_service_account_email_missing')
  return value
}

function privateKey(){
  const value=process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY||''
  if(!value)throw new Error('google_calendar_service_account_private_key_missing')
  return value.replace(/\\n/g,'\n')
}

export async function getGoogleCalendarServiceToken(){
  if(cached&&cached.expiresAt>Date.now()+60_000)return cached.token

  const now=Math.floor(Date.now()/1000)
  const header=base64Url(JSON.stringify({alg:'RS256',typ:'JWT'}))
  const payload=base64Url(JSON.stringify({
    iss:serviceEmail(),
    scope:CALENDAR_SCOPE,
    aud:TOKEN_URL,
    iat:now,
    exp:now+3600,
  }))
  const unsigned=header+'.'+payload
  const signer=createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const signature=signer.sign(privateKey()).toString('base64url')
  const assertion=unsigned+'.'+signature

  const response=await fetch(TOKEN_URL,{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache:'no-store',
  })
  const body=await response.json().catch(()=>null)
  if(!response.ok||!body?.access_token){
    throw new Error(body?.error_description||body?.error||'google_calendar_service_token_failed')
  }

  const expiresIn=Math.max(60,Number(body.expires_in||3600))
  cached={token:String(body.access_token),expiresAt:Date.now()+expiresIn*1000}
  return cached.token
}

export async function googleCalendarServiceFetch<T>(url:string,init?:RequestInit):Promise<T>{
  const token=await getGoogleCalendarServiceToken()
  const headers=new Headers(init?.headers||{})
  headers.set('authorization','Bearer '+token)
  if(init?.body)headers.set('content-type','application/json')

  const response=await fetch(url,{...init,headers,cache:'no-store'})
  if(response.status===204)return null as T
  const body=await response.json().catch(()=>null)
  if(!response.ok){
    const message=body?.error?.message||body?.error_description||('Google Calendar HTTP '+response.status)
    const error=new Error(message) as Error&{status?:number}
    error.status=response.status
    throw error
  }
  return body as T
}
