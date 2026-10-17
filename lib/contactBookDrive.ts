import {createSign,createHash} from 'node:crypto'
import {CONTACT_BOOK_CSV_FILE_ID} from '@/lib/contactBook'

type GoogleServiceAccount = {client_email:string;private_key:string;token_uri?:string}
type GoogleFile = {id:string;version?:string;modifiedTime?:string;mimeType?:string;name?:string;md5Checksum?:string;capabilities?:{canEdit?:boolean}}
let cachedToken:{accessToken:string;expires:number}|null=null
function activeFileId(){
  if(process.env.VERCEL_ENV==='production')return CONTACT_BOOK_CSV_FILE_ID
  const preview=String(process.env.CONTACT_BOOK_PREVIEW_FILE_ID||'').trim()
  if(!/^[A-Za-z0-9_-]{20,90}$/.test(preview))throw new Error('contact_preview_source_not_configured')
  if(preview===CONTACT_BOOK_CSV_FILE_ID)throw new Error('contact_preview_must_not_use_production_file')
  return preview
}
function filePath(){return 'https://www.googleapis.com/drive/v3/files/'+activeFileId()}

function readCredentials():GoogleServiceAccount{
  const raw=process.env.GOOGLE_CONTACT_BOOK_SERVICE_ACCOUNT_JSON
  if(!raw)throw new Error('contact_drive_not_configured')
  let value:GoogleServiceAccount
  try{value=JSON.parse(raw)}catch{throw new Error('contact_drive_credentials_invalid')}
  if(!value.client_email?.endsWith('.gserviceaccount.com')||!value.private_key?.includes('BEGIN PRIVATE KEY'))throw new Error('contact_drive_credentials_invalid')
  if(value.token_uri && value.token_uri!=='https://oauth2.googleapis.com/token')throw new Error('contact_drive_credentials_invalid')
  return value
}
function base64url(value:string|Buffer){return Buffer.from(value).toString('base64url')}

async function accessToken(){
  if(cachedToken&&cachedToken.expires>Date.now()+60000)return cachedToken.accessToken
  const credentials=readCredentials()
  const now=Math.floor(Date.now()/1000)
  const claim={iss:credentials.client_email,scope:'https://www.googleapis.com/auth/drive',aud:credentials.token_uri||'https://oauth2.googleapis.com/token',iat:now,exp:now+3500}
  const header=base64url(JSON.stringify({alg:'RS256',typ:'JWT'}))
  const payload=base64url(JSON.stringify(claim))
  const unsigned=header+'.'+payload
  const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end()
  const assertion=unsigned+'.'+signer.sign(credentials.private_key).toString('base64url')
  const res=await fetch(claim.aud,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),cache:'no-store'})
  const body=await res.json().catch(()=>null)
  if(!res.ok||!body?.access_token)throw new Error('contact_drive_google_auth_failed')
  cachedToken={accessToken:String(body.access_token),expires:Date.now()+Number(body.expires_in||3600)*1000}
  return cachedToken.accessToken
}
async function request(url:string,init:RequestInit={}){
  const headers=new Headers(init.headers)
  headers.set('authorization','Bearer '+await accessToken())
  const res=await fetch(url,{...init,headers,cache:'no-store'})
  if(!res.ok){
    if(res.status===403||res.status===404)throw new Error('contact_drive_file_not_shared_or_denied')
    if(res.status===412)throw new Error('contact_drive_file_version_conflict')
    throw new Error('contact_drive_request_failed_'+res.status)
  }
  return res
}
export async function getContactCsvDrive(){
  const fileId=activeFileId()
  const before=await (await request(filePath()+'?fields=id,name,mimeType,version,modifiedTime,md5Checksum,capabilities/canEdit')).json() as GoogleFile
  if(before.id!==fileId||before.mimeType!=='text/csv')throw new Error('contact_drive_file_identity_changed')
  const csv=await (await request(filePath()+'?alt=media')).text()
  const after=await (await request(filePath()+'?fields=id,version,modifiedTime,md5Checksum')).json() as GoogleFile
  if(String(before.version)!==String(after.version))throw new Error('contact_drive_changed_during_read')
  if(before.md5Checksum&&createHash('md5').update(csv,'utf8').digest('hex')!==before.md5Checksum)throw new Error('contact_drive_content_checksum_mismatch')
  if(before.md5Checksum&&after.md5Checksum&&before.md5Checksum!==after.md5Checksum)throw new Error('contact_drive_changed_during_read')
  return {csv,version:String(after.version),modifiedTime:after.modifiedTime||null,canEdit:before.capabilities?.canEdit===true,fileId}
}
export async function writeContactCsvDrive(csv:string,expectedVersion:string){
  // A second read just before PATCH narrows the external-edit window. Postgres
  // serializes Web writers; external Google Drive editors must be coordinated.
  const fileId=activeFileId()
  const current=await (await request(filePath()+'?fields=id,version,mimeType,capabilities/canEdit')).json() as GoogleFile
  if(current.id!==fileId||current.mimeType!=='text/csv'||current.capabilities?.canEdit!==true)throw new Error('contact_drive_write_permission_denied')
  if(String(current.version)!==expectedVersion)throw new Error('contact_drive_file_version_conflict')
  const res=await request('https://www.googleapis.com/upload/drive/v3/files/'+fileId+'?uploadType=media&fields=id,version,modifiedTime',{
    method:'PATCH',headers:{'content-type':'text/csv; charset=utf-8'},body:csv
  })
  const info=await res.json() as GoogleFile
  if(info.id!==fileId)throw new Error('contact_drive_upload_identity_mismatch')
  return info
}
