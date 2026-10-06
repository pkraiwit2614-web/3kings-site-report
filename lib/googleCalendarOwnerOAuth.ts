import {createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual} from 'node:crypto'

const GOOGLE_AUTH_URL='https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL='https://oauth2.googleapis.com/token'
export const GOOGLE_CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar.events'
const DEFAULT_REDIRECT_URI='https://3kings-site-report.vercel.app/api/google-calendar/oauth/callback'

function required(name:string){
  const value=String(process.env[name]||'').trim()
  if(!value)throw new Error(name.toLowerCase()+'_missing')
  return value
}

export function googleOAuthServerConfigured(){
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
    process.env.GOOGLE_CALENDAR_OAUTH_STATE_SECRET &&
    process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY
  )
}

export function googleOAuthRedirectUri(){
  return String(process.env.GOOGLE_CALENDAR_OAUTH_REDIRECT_URI||DEFAULT_REDIRECT_URI).trim()
}

function stateSecret(){return required('GOOGLE_CALENDAR_OAUTH_STATE_SECRET')}
function clientId(){return required('GOOGLE_CALENDAR_CLIENT_ID')}
function clientSecret(){return required('GOOGLE_CALENDAR_CLIENT_SECRET')}

function encryptionKey(){
  const raw=required('GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY')
  const key=Buffer.from(raw,'base64url')
  if(key.length!==32)throw new Error('google_calendar_token_encryption_key_invalid')
  return key
}

function signStatePayload(payload:string){
  return createHmac('sha256',stateSecret()).update(payload).digest('base64url')
}

export function createGoogleOAuthState(userId:string){
  const payload=Buffer.from(JSON.stringify({
    uid:userId,
    iat:Date.now(),
    nonce:randomBytes(18).toString('base64url'),
  })).toString('base64url')
  return payload+'.'+signStatePayload(payload)
}

export function verifyGoogleOAuthState(state:string,expectedUserId:string){
  const [payload,signature,extra]=String(state||'').split('.')
  if(!payload||!signature||extra)throw new Error('google_oauth_state_invalid')
  const expected=Buffer.from(signStatePayload(payload))
  const received=Buffer.from(signature)
  if(expected.length!==received.length||!timingSafeEqual(expected,received))throw new Error('google_oauth_state_invalid')

  let decoded:{uid?:string;iat?:number}
  try{decoded=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'))}catch{throw new Error('google_oauth_state_invalid')}
  if(decoded.uid!==expectedUserId)throw new Error('google_oauth_state_user_mismatch')
  const age=Date.now()-Number(decoded.iat||0)
  if(!Number.isFinite(age)||age<0||age>10*60*1000)throw new Error('google_oauth_state_expired')
  return true
}

export function googleOwnerAuthorizationUrl(userId:string){
  const params=new URLSearchParams({
    client_id:clientId(),
    redirect_uri:googleOAuthRedirectUri(),
    response_type:'code',
    scope:GOOGLE_CALENDAR_SCOPE,
    access_type:'offline',
    prompt:'consent',
    include_granted_scopes:'true',
    state:createGoogleOAuthState(userId),
  })
  return GOOGLE_AUTH_URL+'?'+params.toString()
}

type GoogleTokenResponse={
  access_token?:string
  expires_in?:number
  refresh_token?:string
  scope?:string
  token_type?:string
  error?:string
  error_description?:string
}

async function tokenRequest(params:Record<string,string>){
  const response=await fetch(GOOGLE_TOKEN_URL,{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams(params),
    cache:'no-store',
  })
  const body=await response.json().catch(()=>null) as GoogleTokenResponse|null
  if(!response.ok||!body?.access_token){
    throw new Error(body?.error_description||body?.error||'google_oauth_token_exchange_failed')
  }
  return body
}

export async function exchangeGoogleAuthorizationCode(code:string){
  const body=await tokenRequest({
    code:String(code||'').trim(),
    client_id:clientId(),
    client_secret:clientSecret(),
    redirect_uri:googleOAuthRedirectUri(),
    grant_type:'authorization_code',
  })
  if(!body.refresh_token)throw new Error('google_oauth_refresh_token_missing')
  return {
    accessToken:body.access_token as string,
    expiresIn:Number(body.expires_in||3600),
    refreshToken:body.refresh_token,
  }
}

export async function refreshGoogleAccessToken(refreshToken:string){
  const body=await tokenRequest({
    refresh_token:refreshToken,
    client_id:clientId(),
    client_secret:clientSecret(),
    grant_type:'refresh_token',
  })
  return {
    accessToken:body.access_token as string,
    expiresIn:Number(body.expires_in||3600),
  }
}

export function encryptGoogleRefreshToken(refreshToken:string){
  const iv=randomBytes(12)
  const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv)
  const encrypted=Buffer.concat([cipher.update(refreshToken,'utf8'),cipher.final()])
  const tag=cipher.getAuthTag()
  return ['v1',iv.toString('base64url'),tag.toString('base64url'),encrypted.toString('base64url')].join('.')
}

export function decryptGoogleRefreshToken(ciphertext:string){
  const [version,ivText,tagText,dataText,extra]=String(ciphertext||'').split('.')
  if(version!=='v1'||!ivText||!tagText||!dataText||extra)throw new Error('google_refresh_token_ciphertext_invalid')
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(ivText,'base64url'))
  decipher.setAuthTag(Buffer.from(tagText,'base64url'))
  const plain=Buffer.concat([decipher.update(Buffer.from(dataText,'base64url')),decipher.final()])
  return plain.toString('utf8')
}
