import {decryptGoogleRefreshToken,googleOAuthServerConfigured,refreshGoogleAccessToken} from '@/lib/googleCalendarOwnerOAuth'
import {getEncryptedGoogleRefreshToken} from '@/lib/googleCalendarTokenStore'

let cached:{ciphertext:string;token:string;expiresAt:number}|null=null

export async function googleCalendarSharedConfigured(accessToken:string){
  if(!googleOAuthServerConfigured())return false
  try{
    return Boolean(await getEncryptedGoogleRefreshToken(accessToken))
  }catch{
    return false
  }
}

export async function getGoogleCalendarSharedAccessToken(accessToken:string){
  if(!googleOAuthServerConfigured())throw new Error('google_calendar_owner_oauth_not_configured')
  const ciphertext=await getEncryptedGoogleRefreshToken(accessToken)
  if(!ciphertext)throw new Error('google_calendar_owner_not_connected')
  if(cached&&cached.ciphertext===ciphertext&&cached.expiresAt>Date.now()+60_000)return cached.token

  const refreshToken=decryptGoogleRefreshToken(ciphertext)
  const refreshed=await refreshGoogleAccessToken(refreshToken)
  cached={
    ciphertext,
    token:refreshed.accessToken,
    expiresAt:Date.now()+Math.max(60,refreshed.expiresIn)*1000,
  }
  return cached.token
}

export async function googleCalendarSharedFetch<T>(accessToken:string,url:string,init?:RequestInit):Promise<T>{
  const googleToken=await getGoogleCalendarSharedAccessToken(accessToken)
  const headers=new Headers(init?.headers||{})
  headers.set('authorization','Bearer '+googleToken)
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
