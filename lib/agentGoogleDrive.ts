import {createSign} from 'node:crypto'
import {AgentGateError,type SopSource,type IndexSnapshot,type SourceDocument,type LiveIndexRow,sopIdFromUrl} from './agentCore'

// Server-only, scoped Google service identity. Never put these variables in NEXT_PUBLIC or the browser.
type ServiceIdentity={client_email:string;private_key:string}
const INDEX_TITLE='00-SOP_INDEX - 3Kings Construction'
async function responseOrBlock(url:string,init:RequestInit):Promise<Response>{
  const r=await fetch(url,{...init,cache:'no-store',signal:AbortSignal.timeout(10000)})
  if(!r.ok)throw new AgentGateError('BLOCK_SOP_SOURCE_UNAVAILABLE')
  return r
}
async function getAccessToken():Promise<string>{
  const raw=process.env.AGENT_GOOGLE_SERVICE_ACCOUNT_JSON
  if(!raw)throw new AgentGateError('BLOCK_DRIVE_IDENTITY_UNCONFIGURED')
  let identity:ServiceIdentity
  try{identity=JSON.parse(raw) as ServiceIdentity}catch{throw new AgentGateError('BLOCK_DRIVE_IDENTITY_UNCONFIGURED')}
  if(!identity.client_email||!identity.private_key)throw new AgentGateError('BLOCK_DRIVE_IDENTITY_UNCONFIGURED')
  const now=Math.floor(Date.now()/1000)
  const encode=(o:unknown)=>Buffer.from(JSON.stringify(o)).toString('base64url')
  const message=encode({alg:'RS256',typ:'JWT'})+'.'+encode({
    iss:identity.client_email,scope:'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly',
    aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3000
  })
  let signed:string
  try{const signer=createSign('RSA-SHA256');signer.update(message);signed=message+'.'+signer.sign(identity.private_key).toString('base64url')}
  catch{throw new AgentGateError('BLOCK_DRIVE_IDENTITY_UNCONFIGURED')}
  const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:signed})
  const r=await responseOrBlock('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body})
  const result=await r.json() as {access_token?:string}
  if(!result.access_token)throw new AgentGateError('BLOCK_SOP_SOURCE_UNAVAILABLE')
  return result.access_token
}
type DriveMeta={id:string;name:string;mimeType:string;modifiedTime:string;trashed?:boolean}
export async function createLiveSopSource():Promise<SopSource>{
  const indexId=process.env.AGENT_SOP_INDEX_ID
  if(!indexId||!/^[a-zA-Z0-9_-]+$/.test(indexId))throw new AgentGateError('BLOCK_INDEX_UNCONFIGURED')
  const token=await getAccessToken()
  const auth={Authorization:'Bearer '+token}
  const json=async <T>(url:string):Promise<T>=>(await (await responseOrBlock(url,{headers:auth})).json()) as T
  const meta=async(id:string):Promise<DriveMeta>=>{
    if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new AgentGateError('BLOCK_SOP_LINK_INVALID')
    const m=await json<DriveMeta>('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,name,mimeType,modifiedTime,trashed')
    if(m.trashed||!m.modifiedTime)throw new AgentGateError('BLOCK_SOP_UNREADABLE')
    return m
  }
  return {
    async readIndex():Promise<IndexSnapshot>{
      const first=await meta(indexId)
      if(first.mimeType!=='application/vnd.google-apps.spreadsheet'||first.name!==INDEX_TITLE)
        throw new AgentGateError('BLOCK_INDEX_UNREADABLE')
      const sheets=await json<{sheets?:{properties?:{title?:string}}[]}>(
        'https://sheets.googleapis.com/v4/spreadsheets/'+indexId+'?fields=sheets(properties(title))')
      let rows:LiveIndexRow[]|null=null
      for(const sheet of (sheets.sheets||[]).slice(0,10)){
        const title=sheet.properties?.title||''
        if(!title)continue
        const range="'"+title.replace(/'/g,"''")+"'!A1:K100"
        const cells=await json<{values?:string[][]}>('https://sheets.googleapis.com/v4/spreadsheets/'+indexId+
          '/values/'+encodeURIComponent(range))
        const values=cells.values||[]
        const header=values[0]||[]
        const col=(s:string)=>header.indexOf(s)
        if(['ลำดับ','คำสั่งลัด','ลิงก์ SOP','สถานะเอกสาร'].some(v=>col(v)<0))continue
        rows=values.slice(1).filter(v=>v[col('คำสั่งลัด')]).map(v=>({
          sequence:String(v[col('ลำดับ')]||''),shortcut:String(v[col('คำสั่งลัด')]||''),
          sopUrl:String(v[col('ลิงก์ SOP')]||''),status:String(v[col('สถานะเอกสาร')]||'')
        }))
        break
      }
      if(!rows)throw new AgentGateError('BLOCK_INDEX_UNREADABLE')
      return {id:first.id,modifiedTime:first.modifiedTime,rows}
    },
    async readSop(url:string):Promise<SourceDocument>{
      const id=sopIdFromUrl(url)
      const m=await meta(id)
      let text:string
      if(m.mimeType==='application/vnd.google-apps.document'){
        const url='https://www.googleapis.com/drive/v3/files/'+id+'/export?mimeType='+encodeURIComponent('text/plain')
        text=await (await responseOrBlock(url,{headers:auth})).text()
      }else if(['text/plain','text/markdown'].includes(m.mimeType)){
        text=await (await responseOrBlock('https://www.googleapis.com/drive/v3/files/'+id+'?alt=media',{headers:auth})).text()
      }else throw new AgentGateError('BLOCK_SOP_UNREADABLE')
      if(text.length>150000)throw new AgentGateError('BLOCK_SOP_UNREADABLE')
      return {...m,text}
    },
    async readIndexRevision(){return (await meta(indexId)).modifiedTime},
    async readSopRevision(id:string){return (await meta(id)).modifiedTime}
  }
}
