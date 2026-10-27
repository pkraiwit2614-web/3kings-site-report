import {NextRequest,NextResponse} from 'next/server'
import {exchangeVercelOidcToken} from '@/lib/agentGoogleDrive'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=25
export async function GET(request:NextRequest){
 const headers={'cache-control':'private, no-store'}
 if(process.env.VERCEL_ENV!=='preview'||process.env.EXPRESS_PO_PREVIEW_HEALTH_ENABLED!=='true')
  return NextResponse.json({error:'NOT_FOUND'},{status:404,headers})
 try{
  const folder=String(process.env.EXPRESS_PO_SOURCE_FOLDER_ID||'')
  const sheet=String(process.env.EXPRESS_PO_STAGING_SHEET_ID||'')
  if(!/^[a-zA-Z0-9_-]{25,100}$/.test(folder)||!/^[a-zA-Z0-9_-]{25,100}$/.test(sheet))
   throw Error('SOURCE_UNCONFIGURED')
  const token=await exchangeVercelOidcToken(request.headers.get('x-vercel-oidc-token')||'')
  const check=async(url:string)=>{
   const r=await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(10000)})
   if(!r.ok)throw Error('ACCESS_DENIED')
   return r.json() as Promise<Record<string,unknown>>
  }
  const [f,s]=await Promise.all([
   check('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(folder)+'?fields=id,mimeType,trashed'),
   check('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sheet)+'?fields=properties(title)')
  ])
  if(f.id!==folder||f.mimeType!=='application/vnd.google-apps.folder'||f.trashed||
   (s.properties as {title?:string}|undefined)?.title!=='Express_PO_Preview_Staging_2026-10-19')
   throw Error('IDENTITY_MISMATCH')
  return NextResponse.json({preview_oidc:'PASS',drive_folder:'PASS',staging_sheet:'PASS',
   mode:'READ_ONLY_NO_DATA_NO_WRITES'},{status:200,headers})
 }catch{return NextResponse.json({preview_oidc_or_access:'FAIL',mode:'READ_ONLY_NO_WRITES'},{status:503,headers})}
}
