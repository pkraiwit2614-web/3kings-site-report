import {checkOidcPreviewClaims,readOidcConfig} from '@/lib/agentGoogleDrive'

type ResponseError = Error & {code?:string}
type SheetMetadata={properties?:{title?:string};sheets?:{properties?:{title?:string;sheetId?:number}}[]}
type ValueResponse={values?:unknown[][]}
type BatchValueResponse={valueRanges?:{values?:unknown[][]}[]}
type PreviewReport={sourceSha256:string;documents:{poNo:string}[];qa:unknown[];summary:{lineItems:number}}
const TITLE='Express_PO_Preview_Staging_2026-10-19'
const {buildStagingRows,toAppendRequests,EXPECTED_SHEETS}=require('./staging.cjs') as {
 buildStagingRows:(report:unknown,source:unknown,createdAt:string)=>Record<string,unknown[][]>,
 toAppendRequests:(rows:Record<string,unknown[][]>,ids:Record<string,number>)=>Record<string,unknown>[],
 EXPECTED_SHEETS:string[]
}
async function fetchOk(url:string,init:RequestInit):Promise<Response>{
 const r=await fetch(url,{...init,cache:'no-store',signal:AbortSignal.timeout(15000)})
 if(!r.ok)throw Error('SHEETS_REQUEST_FAILED')
 return r
}
async function mintSheetsOnlyWriter(rawOidc:string):Promise<string>{
 const cfg=readOidcConfig()
 if(cfg.environment!=='preview')throw Error('EXPRESS_PO_PREVIEW_ONLY')
 checkOidcPreviewClaims(rawOidc,cfg)
 // Token separate from existing read-only SOP/Drive identity; only Sheets API scope.
 const pool='projects/'+cfg.projectNumber+'/locations/global/workloadIdentityPools/'+cfg.poolId+'/providers/'+cfg.providerId
 const exchange=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:token-exchange',
  audience:'//iam.googleapis.com/'+pool,scope:'https://www.googleapis.com/auth/cloud-platform',
  requested_token_type:'urn:ietf:params:oauth:token-type:access_token',
  subject_token_type:'urn:ietf:params:oauth:token-type:jwt',subject_token:rawOidc})
 const sts=await fetchOk('https://sts.googleapis.com/v1/token',{method:'POST',
  headers:{'content-type':'application/x-www-form-urlencoded'},body:exchange})
 const first=await sts.json() as {access_token?:string}
 if(!first.access_token)throw Error('SHEETS_AUTH_FAILED')
 const imp=await fetchOk('https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+
  encodeURIComponent(cfg.serviceAccount)+':generateAccessToken',{method:'POST',
  headers:{'content-type':'application/json',Authorization:'Bearer '+first.access_token},
  body:JSON.stringify({scope:['https://www.googleapis.com/auth/spreadsheets'],lifetime:'1200s'})})
 const second=await imp.json() as {accessToken?:string}
 if(!second.accessToken)throw Error('SHEETS_AUTH_FAILED')
 return second.accessToken
}
async function sheetsJson<T>(token:string,url:string,body?:unknown):Promise<T>{
 const r=await fetchOk(url,{method:body===undefined?'GET':'POST',headers:{
  Authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})
 },...(body===undefined?{}:{body:JSON.stringify(body)})})
 return r.json() as Promise<T>
}
function sheetUri(sheetId:string,suffix:string){
 return 'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sheetId)+suffix
}
async function verifyStorage(readerToken:string,sheetId:string){
 if(!/^[a-zA-Z0-9_-]{25,100}$/.test(sheetId))throw Error('SHEETS_ID_INVALID')
 const meta=await sheetsJson<SheetMetadata>(readerToken,sheetUri(sheetId,'?fields=properties(title),sheets(properties(title,sheetId))'))
 if(meta.properties?.title!==TITLE)throw Error('SHEETS_TITLE_MISMATCH')
 const ids:Record<string,number>={}
 for(const sheet of meta.sheets||[]){
  const title=sheet.properties?.title,number=sheet.properties?.sheetId
  if(title&&typeof number==='number')ids[title]=number
 }
 if(EXPECTED_SHEETS.some(s=>typeof ids[s]!=='number'))throw Error('SHEETS_LAYOUT_MISMATCH')
 const expected=[['Source SHA256','Source File'],['Source SHA256','PO Number'],
  ['Source SHA256','PO Number'],['Source SHA256','Code']]
 for(let k=0;k<EXPECTED_SHEETS.length;k++){
  const range=encodeURIComponent("'"+EXPECTED_SHEETS[k]+"'!A1:B1")
  const result=await sheetsJson<ValueResponse>(readerToken,sheetUri(sheetId,'/values/'+range))
  const first=result.values?.[0]
  if(!first||first[0]!==expected[k][0]||first[1]!==expected[k][1])
   throw Error('SHEETS_LAYOUT_MISMATCH')
 }
 return ids
}
async function readColumn(readerToken:string,sheetId:string,title:string,cols:string):Promise<unknown[][]>{
 const range=encodeURIComponent("'"+title+"'!"+cols)
 const result=await sheetsJson<ValueResponse>(readerToken,sheetUri(sheetId,'/values/'+range))
 return result.values||[]
}
export async function stageExpressInSheets(opts:{
 readerToken:string;oidcToken:string;source:{fileName:string;modifiedTime:string};
 report:PreviewReport
}):Promise<{result:string;counts:{documents:number;items:number;issues:number}}> {
 if(process.env.VERCEL_ENV!=='preview'||process.env.EXPRESS_PO_ALLOW_STAGING_WRITE!=='true')
  throw Error('SHEETS_WRITE_DISABLED')
 const sheetId=String(process.env.EXPRESS_PO_STAGING_SHEET_ID||'')
 const ids=await verifyStorage(opts.readerToken,sheetId)
 const rows=buildStagingRows(opts.report,opts.source,new Date().toISOString())
 const sha=opts.report.sourceSha256
 const existing=await readColumn(opts.readerToken,sheetId,'Runs','A2:A')
 const previous=existing.some(row=>row[0]===sha)
 if(previous)return {result:'ALREADY_STAGED_NO_WRITE',counts:{
  documents:rows.Documents.length,items:rows.Items.length,issues:rows.Issues.length}}
 const writerToken=await mintSheetsOnlyWriter(opts.oidcToken)
 const requests=toAppendRequests(rows,ids)
 // Google Sheets batchUpdate applies all appendCells requests as one atomic batch.
 await sheetsJson(writerToken,sheetUri(sheetId,':batchUpdate'),{requests})
 const [runs,documents,items,issues]=await Promise.all([
  readColumn(opts.readerToken,sheetId,'Runs','A2:A'),
  readColumn(opts.readerToken,sheetId,'Documents','A2:B'),
  readColumn(opts.readerToken,sheetId,'Items','A2:C'),
  readColumn(opts.readerToken,sheetId,'Issues','A2:B')
 ])
 const count=(rs:unknown[][])=>rs.filter(r=>r[0]===sha).length
 if(count(runs)!==1||count(documents)!==rows.Documents.length||
   count(items)!==rows.Items.length||count(issues)!==rows.Issues.length)
  throw Error('SHEETS_READBACK_MISMATCH')
 return {result:'STAGED_SHEETS_VERIFIED',counts:{documents:rows.Documents.length,
  items:rows.Items.length,issues:rows.Issues.length}}
}
