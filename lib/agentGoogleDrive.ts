import {AgentGateError,type SopSource,type IndexSnapshot,type SourceDocument,type LiveIndexRow,sopIdFromUrl} from './agentCore'

// Vercel Functions supply a short-lived OIDC JWT in x-vercel-oidc-token.
// This path never accepts a Google service-account JSON/private key.
const INDEX_TITLE='00-SOP_INDEX - 3Kings Construction'
type OidcConfig={projectNumber:string;poolId:string;providerId:string;serviceAccount:string;
  issuer:string;audience:string;subject:string;environment:'preview'|'production';
  projectId?:string;ownerId?:string}
function requireConfig(name:string):string{
  const value=String(process.env[name]||'').trim()
  if(!value)throw new AgentGateError('BLOCK_DRIVE_IDENTITY_UNCONFIGURED')
  return value
}
export function readOidcConfig(probeOnly=false):OidcConfig{
  const environment=process.env.VERCEL_ENV
  if(environment!=='preview'&&environment!=='production')
    throw new AgentGateError('BLOCK_UNSUPPORTED_ENVIRONMENT')
  // Deliberate second authorization gate: code deployment does not enable the Agent on Production.
  if(environment==='production'&&process.env.AGENT_PRODUCTION_ENABLED!=='true'&&!probeOnly)
    throw new AgentGateError('BLOCK_PRODUCTION_DISABLED')
  const prefix=environment==='production'?'AGENT_PRODUCTION_':'AGENT_'
  const config:OidcConfig={
    environment,
    projectNumber:requireConfig(prefix+'GCP_PROJECT_NUMBER'),
    poolId:requireConfig(prefix+'GCP_POOL_ID'),
    providerId:requireConfig(prefix+'GCP_PROVIDER_ID'),
    serviceAccount:requireConfig(prefix+'GCP_SERVICE_ACCOUNT_EMAIL'),
    issuer:requireConfig(prefix+'OIDC_EXPECTED_ISSUER'),
    audience:requireConfig(prefix+'OIDC_EXPECTED_AUDIENCE'),
    subject:requireConfig(prefix+'OIDC_EXPECTED_SUBJECT'),
    ...(environment==='production'?{
      projectId:requireConfig(prefix+'OIDC_EXPECTED_PROJECT_ID'),
      ownerId:requireConfig(prefix+'OIDC_EXPECTED_OWNER_ID')
    }:{})
  }
  if(!/^\d+$/.test(config.projectNumber)||
    !/^[a-z0-9-]+$/.test(config.poolId)||!/^[a-z0-9-]+$/.test(config.providerId)||
    !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.iam\.gserviceaccount\.com$/.test(config.serviceAccount)||
    !/^https:\/\/oidc\.vercel\.com\/[a-z0-9-]+$/.test(config.issuer)||
    !/^https:\/\/vercel\.com\/[a-z0-9-]+$/.test(config.audience)||
    !/^owner:[a-z0-9-]+:project:[a-z0-9-]+:environment:(preview|production)$/.test(config.subject))
      throw new AgentGateError('BLOCK_DRIVE_IDENTITY_UNCONFIGURED')
  const owner=config.issuer.split('/').pop()
  if(config.audience!=='https://vercel.com/'+owner||
    config.subject!==('owner:'+owner+':project:3kings-site-report:environment:'+environment))
    throw new AgentGateError('BLOCK_OIDC_CONFIGURATION_MISMATCH')
  if(environment==='production'&&(
      config.providerId==='vercel-preview'||
      !/^prj_[a-zA-Z0-9]+$/.test(config.projectId||'')||
      !/^team_[a-zA-Z0-9]+$/.test(config.ownerId||'')||
      (process.env.VERCEL_PROJECT_ID&&process.env.VERCEL_PROJECT_ID!==config.projectId)||
      (process.env.VERCEL_ORG_ID&&process.env.VERCEL_ORG_ID!==config.ownerId)
    ))
    throw new AgentGateError('BLOCK_OIDC_CONFIGURATION_MISMATCH')
  return config
}
export function checkOidcPreviewClaims(rawToken:string,config:OidcConfig):void{
  try {
    if(!rawToken||rawToken.length>12000)throw Error('missing')
    const chunks=rawToken.split('.')
    if(chunks.length!==3||!chunks.every(Boolean))throw Error('invalid JWT')
    const claims=JSON.parse(Buffer.from(chunks[1],'base64url').toString('utf8')) as {
      iss?:string;aud?:string|string[];sub?:string;exp?:number;nbf?:number;
      environment?:string;project_id?:string;owner_id?:string
    }
    const now=Math.floor(Date.now()/1000)
    if(claims.iss!==config.issuer||claims.aud!==config.audience||claims.sub!==config.subject||
      claims.environment!==config.environment||typeof claims.exp!=='number'||claims.exp<=now||
      (typeof claims.nbf==='number'&&claims.nbf>now+60)||
      (config.projectId&&claims.project_id!==config.projectId)||
      (config.ownerId&&claims.owner_id!==config.ownerId))throw Error('claims mismatch')
  }catch{throw new AgentGateError('BLOCK_OIDC_ENVIRONMENT_CLAIMS')}
  // Local claim checks are untrusted hints: Google STS must verify signature, audience, issuer, WIF condition.
}
async function responseOrBlock(url:string,init:RequestInit):Promise<Response>{
  const r=await fetch(url,{...init,cache:'no-store',signal:AbortSignal.timeout(10000)})
  if(!r.ok)throw new AgentGateError('BLOCK_SOP_SOURCE_UNAVAILABLE')
  return r
}
export async function exchangeVercelOidcToken(rawToken:string,probeOnly=false):Promise<string>{
  const cfg=readOidcConfig(probeOnly)
  checkOidcPreviewClaims(rawToken,cfg)
  const pool='projects/'+cfg.projectNumber+'/locations/global/workloadIdentityPools/'+cfg.poolId+
    '/providers/'+cfg.providerId
  const request=new URLSearchParams({
    grant_type:'urn:ietf:params:oauth:grant-type:token-exchange',
    audience:'//iam.googleapis.com/'+pool,
    scope:'https://www.googleapis.com/auth/cloud-platform',
    requested_token_type:'urn:ietf:params:oauth:token-type:access_token',
    subject_token_type:'urn:ietf:params:oauth:token-type:jwt',
    subject_token:rawToken,
  })
  // Google validates Vercel's token signature and IAM Workload Identity Provider conditions.
  const sts=await responseOrBlock('https://sts.googleapis.com/v1/token',{method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},body:request})
  const first=await sts.json() as {access_token?:string}
  if(!first.access_token)throw new AgentGateError('BLOCK_SOP_SOURCE_UNAVAILABLE')
  // A subject-scoped iam.workloadIdentityUser binding is required on this one service account.
  const impersonate=await responseOrBlock('https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+
    encodeURIComponent(cfg.serviceAccount)+':generateAccessToken',{method:'POST',headers:{
    'content-type':'application/json',Authorization:'Bearer '+first.access_token},
    body:JSON.stringify({scope:['https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly'],lifetime:'1200s'})})
  const second=await impersonate.json() as {accessToken?:string}
  if(!second.accessToken)throw new AgentGateError('BLOCK_SOP_SOURCE_UNAVAILABLE')
  return second.accessToken
}
// Keep the prior test contract as an alias; both environments share the same keyless exchange.
export const exchangePreviewOidcToken=exchangeVercelOidcToken
type DriveMeta={id:string;name:string;mimeType:string;modifiedTime:string;trashed?:boolean}
export async function createLiveSopSource(vercelOidcToken:string,probeOnly=false):Promise<SopSource>{
  const indexId=process.env.VERCEL_ENV==='production'
    ?process.env.AGENT_PRODUCTION_SOP_INDEX_ID:process.env.AGENT_SOP_INDEX_ID
  if(!indexId||!/^[a-zA-Z0-9_-]+$/.test(indexId))throw new AgentGateError('BLOCK_INDEX_UNCONFIGURED')
  const token=await exchangeVercelOidcToken(vercelOidcToken,probeOnly)
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
      const readRows=async(title:string):Promise<LiveIndexRow[]|null>=>{
        const range="'"+title.replace(/'/g,"''")+"'!A1:K100"
        const cells=await json<{values?:string[][]}>('https://sheets.googleapis.com/v4/spreadsheets/'+indexId+
          '/values/'+encodeURIComponent(range))
        const values=cells.values||[]
        const header=values[0]||[]
        const col=(s:string)=>header.indexOf(s)
        if(['ลำดับ','คำสั่งลัด','ลิงก์ SOP','สถานะเอกสาร'].some(v=>col(v)<0))return null
        return values.slice(1).filter(v=>v[col('คำสั่งลัด')]).map(v=>({
          sequence:String(v[col('ลำดับ')]||''),shortcut:String(v[col('คำสั่งลัด')]||''),
          sopUrl:String(v[col('ลิงก์ SOP')]||''),status:String(v[col('สถานะเอกสาร')]||'')
        }))
      }
      // The live SOP index uses this canonical tab. Avoid a redundant sheets-list call
      // on the normal path; preserve legacy header discovery if it is absent/renamed.
      let rows:LiveIndexRow[]|null=null
      try{rows=await readRows('SOP_INDEX')}
      catch(e){if(!(e instanceof AgentGateError)||e.code!=='BLOCK_SOP_SOURCE_UNAVAILABLE')throw e}
      if(!rows){
        const sheets=await json<{sheets?:{properties?:{title?:string}}[]}>(
          'https://sheets.googleapis.com/v4/spreadsheets/'+indexId+'?fields=sheets(properties(title))')
        for(const sheet of (sheets.sheets||[]).slice(0,10)){
          const title=sheet.properties?.title||''
          if(!title||title==='SOP_INDEX')continue
          rows=await readRows(title)
          if(rows)break
        }
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
