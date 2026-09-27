import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getVercelOidcToken } from '@vercel/oidc'

export const runtime='nodejs'
export const maxDuration=60

const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'
const MAX_CANDIDATES=8
const CACHE_DAYS=14
const GATEWAY_BLOCK_MS=30*60*1000
const GEMINI_DEFAULT_MODEL='gemini-3.5-flash-lite'

let chosenModel=''
let chosenModelAt=0
let gatewayBlockedUntil=0

type CandidateInput={photoId:string}
type ScoreRow={photo_id:string;score:number;detected_work:string|null;reason:string|null;model:string;analyzed_at:string}
type AIResult={photo_id:string;score:number;detected_work:string|null;reason:string|null;model:string}

class ProviderError extends Error{
  status:number
  provider:string
  constructor(provider:string,status:number,message:string){super(message);this.name='ProviderError';this.provider=provider;this.status=status}
}

function cleanText(value:unknown,max=500){return String(value??'').trim().slice(0,max)}
function clampScore(value:unknown){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):0}
function visualPrompt(task:any){
  return `คุณเป็นผู้ตรวจรูปหน้างานก่อสร้างของ 3 Kings Construction\n\nเป้าหมาย: ประเมินว่าแต่ละรูป “มองเห็นด้วยตา” ว่าเกี่ยวข้องกับ Schedule Task นี้มากแค่ไหน\nTask: ${cleanText(task.task_name,240)}\nArea: ${cleanText(task.area||'-',160)}\nCategory: ${cleanText(task.category||'-',160)}\n\nกติกา:\n- ดูเฉพาะสิ่งที่มองเห็นจริงในภาพ ห้ามเดางานที่ซ่อนอยู่หลังผนัง/ฝ้า\n- 90-100 = เห็นงานเป้าหมายชัดเจนมาก\n- 70-89 = เกี่ยวข้องโดยตรง/เป็นขั้นตอนของงานเดียวกัน\n- 40-69 = งานใกล้เคียงหรือพื้นที่เดียวกัน แต่ไม่ยืนยันว่าเป็นงานเป้าหมาย\n- 0-39 = ไม่เกี่ยวข้องหรือหลักฐานไม่พอ\n- ถ้าภาพกว้างและมีหลายงาน ให้ให้คะแนนเฉพาะความเกี่ยวข้องกับ Task เป้าหมาย\n- ตอบ JSON เท่านั้น รูปแบบ {"results":[{"photo_id":"uuid","score":0,"detected_work":"คำสั้นๆ","reason":"เหตุผลสั้นๆ"}]}\n- ต้องมีผลครบทุก photo_id ที่ให้มา และห้ามสร้าง photo_id ใหม่`
}

async function visionModel(){
  const forced=cleanText(process.env.AI_VISION_MODEL,120)
  if(forced)return forced
  if(chosenModel&&Date.now()-chosenModelAt<6*60*60*1000)return chosenModel
  try{
    const response=await fetch('https://ai-gateway.vercel.sh/v1/models',{cache:'no-store',signal:AbortSignal.timeout(8000)})
    if(response.ok){
      const json=await response.json() as any
      const models=Array.isArray(json?.data)?json.data:[]
      const vision=models.filter((m:any)=>m?.type==='language'&&Array.isArray(m?.tags)&&m.tags.includes('vision'))
      const keywordRank=(id:string)=>{
        const v=id.toLowerCase()
        if(v.includes('flash-lite'))return 0
        if(v.includes('flash'))return 1
        if(v.includes('mini'))return 2
        if(v.includes('haiku'))return 3
        return 9
      }
      const price=(m:any)=>Number(m?.pricing?.input||999)+Number(m?.pricing?.output||999)
      vision.sort((a:any,b:any)=>keywordRank(a.id)-keywordRank(b.id)||price(a)-price(b))
      if(vision[0]?.id){chosenModel=String(vision[0].id);chosenModelAt=Date.now();return chosenModel}
    }
  }catch{}
  chosenModel='google/gemini-3.1-pro-preview';chosenModelAt=Date.now();return chosenModel
}

function parseJsonText(raw:string){
  const trimmed=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')
  try{return JSON.parse(trimmed)}catch{}
  const first=trimmed.indexOf('{');const last=trimmed.lastIndexOf('}')
  if(first>=0&&last>first){try{return JSON.parse(trimmed.slice(first,last+1))}catch{}}
  throw new Error('ai_invalid_json')
}

function normalizeResults(rawResults:any[],photos:any[],model:string):AIResult[]{
  const allowed=new Set(photos.map(p=>p.id))
  const byId=new Map<string,any>()
  for(const row of rawResults){const id=cleanText(row?.photo_id,80);if(allowed.has(id))byId.set(id,row)}
  return photos.map(photo=>{
    const row=byId.get(photo.id)||{}
    return {photo_id:photo.id,score:clampScore(row.score),detected_work:cleanText(row.detected_work,180)||null,reason:cleanText(row.reason,360)||null,model}
  })
}

async function gatewayScore(request:NextRequest,task:any,photos:any[]){
  const token=process.env.AI_GATEWAY_API_KEY||await getVercelOidcToken()
  if(!token)throw new ProviderError('vercel',401,'ai_gateway_auth_unavailable')
  const model=await visionModel()
  const content:any[]=[{type:'text',text:visualPrompt(task)}]
  for(const photo of photos){
    content.push({type:'text',text:`PHOTO_ID=${photo.id} • วันที่ ${photo.photo_date} • ชื่อไฟล์ ${cleanText(photo.file_name,160)}`})
    content.push({type:'image_url',image_url:{url:`${request.nextUrl.origin}/api/drive-photo?fileId=${encodeURIComponent(photo.drive_file_id)}&size=768`,detail:'low'}})
  }
  const response=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({model,temperature:0,max_tokens:1400,messages:[{role:'user',content}]}),signal:AbortSignal.timeout(50000),
  })
  const json=await response.json().catch(()=>null) as any
  if(!response.ok)throw new ProviderError('vercel',response.status,`ai_gateway_${response.status}:${cleanText(json?.error?.message||json?.message||'request_failed',320)}`)
  const message=json?.choices?.[0]?.message?.content
  const text=typeof message==='string'?message:Array.isArray(message)?message.map((x:any)=>x?.text||x?.content||'').join('\n'):''
  const parsed=parseJsonText(text)
  return {model,results:normalizeResults(Array.isArray(parsed?.results)?parsed.results:[],photos,model)}
}

async function loadDriveInline(fileId:string){
  const sources=[
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w640`,
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=view&confirm=t`,
  ]
  for(const source of sources){
    try{
      const response=await fetch(source,{redirect:'follow',cache:'force-cache',headers:{'user-agent':'3KingsConstruction/1.0'},signal:AbortSignal.timeout(10000)})
      const mimeType=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()
      if(!response.ok||!mimeType.startsWith('image/'))continue
      const bytes=await response.arrayBuffer()
      if(!bytes.byteLength||bytes.byteLength>5*1024*1024)continue
      return {mimeType,data:Buffer.from(bytes).toString('base64')}
    }catch{}
  }
  return null
}

async function geminiDirectScore(task:any,photos:any[]){
  const apiKey=cleanText(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY,512)
  if(!apiKey)throw new ProviderError('gemini',503,'gemini_fallback_not_configured')
  const model=cleanText(process.env.GEMINI_VISION_MODEL,120)||GEMINI_DEFAULT_MODEL
  const loaded=await Promise.all(photos.map(async photo=>({photo,media:await loadDriveInline(photo.drive_file_id)})))
  const parts:any[]=[{text:visualPrompt(task)}]
  const sent:any[]=[]
  for(const item of loaded){
    if(!item.media)continue
    sent.push(item.photo)
    parts.push({text:`PHOTO_ID=${item.photo.id} • วันที่ ${item.photo.photo_date} • ชื่อไฟล์ ${cleanText(item.photo.file_name,160)}`})
    parts.push({inlineData:{mimeType:item.media.mimeType,data:item.media.data}})
  }
  if(!sent.length)throw new ProviderError('gemini',502,'gemini_no_images_available')
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
    method:'POST',
    headers:{'content-type':'application/json','x-goog-api-key':apiKey},
    body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:1400}}),
    signal:AbortSignal.timeout(50000),
  })
  const json=await response.json().catch(()=>null) as any
  if(!response.ok)throw new ProviderError('gemini',response.status,`gemini_${response.status}:${cleanText(json?.error?.message||json?.message||'request_failed',320)}`)
  const text=(json?.candidates?.[0]?.content?.parts||[]).map((p:any)=>typeof p?.text==='string'?p.text:'').join('\n')
  const parsed=parseJsonText(text)
  const directModel=`gemini-direct/${model}`
  const scored=normalizeResults(Array.isArray(parsed?.results)?parsed.results:[],sent,directModel)
  const scoredMap=new Map(scored.map(x=>[x.photo_id,x]))
  const results=photos.map(photo=>scoredMap.get(photo.id)||({photo_id:photo.id,score:0,detected_work:null,reason:'โหลดภาพสำหรับวิเคราะห์ไม่ได้',model:directModel} as AIResult))
  return {model:directModel,results}
}

async function scoreWithFallback(request:NextRequest,task:any,photos:any[]){
  if(Date.now()<gatewayBlockedUntil)return geminiDirectScore(task,photos)
  try{return await gatewayScore(request,task,photos)}
  catch(error){
    if(error instanceof ProviderError&&error.provider==='vercel'&&error.status===403){
      gatewayBlockedUntil=Date.now()+GATEWAY_BLOCK_MS
      console.warn('AI Gateway 403; using Gemini direct fallback for 30 minutes')
      return geminiDirectScore(task,photos)
    }
    throw error
  }
}

export async function POST(request:NextRequest){
  try{
    const bearer=request.headers.get('authorization')||''
    const accessToken=bearer.toLowerCase().startsWith('bearer ')?bearer.slice(7).trim():''
    if(!accessToken)return NextResponse.json({ok:false,error:'missing_auth'},{status:401})
    const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{global:{headers:{Authorization:`Bearer ${accessToken}`}},auth:{persistSession:false,autoRefreshToken:false}})
    const {data:{user},error:userError}=await supabase.auth.getUser(accessToken)
    if(userError||!user)return NextResponse.json({ok:false,error:'invalid_auth'},{status:401})
    const {data:profile}=await supabase.from('profiles').select('role,active').eq('user_id',user.id).maybeSingle()
    if(!profile?.active||!['manager','engineer'].includes(profile.role||''))return NextResponse.json({ok:false,error:'forbidden'},{status:403})

    const body=await request.json().catch(()=>null) as any
    const taskId=cleanText(body?.taskId,80)
    const requested=(Array.isArray(body?.candidates)?body.candidates:[]).slice(0,MAX_CANDIDATES) as CandidateInput[]
    const photoIds=[...new Set(requested.map(x=>cleanText(x?.photoId,80)).filter(Boolean))]
    if(!taskId||!photoIds.length)return NextResponse.json({ok:false,error:'invalid_request'},{status:400})

    const [{data:task,error:taskError},{data:photos,error:photoError}]=await Promise.all([
      supabase.from('v_schedule_tasks').select('id,project_id,task_name,area,category').eq('id',taskId).maybeSingle(),
      supabase.from('drive_photo_index').select('id,project_id,drive_file_id,file_name,photo_date').in('id',photoIds).eq('is_active',true),
    ])
    if(taskError||!task)return NextResponse.json({ok:false,error:'task_not_found'},{status:404})
    if(photoError)return NextResponse.json({ok:false,error:'photo_query_failed'},{status:500})
    const validPhotos=(photos||[]).filter((p:any)=>p.project_id===task.project_id)
    if(!validPhotos.length)return NextResponse.json({ok:false,error:'no_project_photos'},{status:400})

    const cutoff=new Date(Date.now()-CACHE_DAYS*24*60*60*1000).toISOString()
    const {data:cached}=await supabase.from('photo_ai_task_scores')
      .select('photo_id,score,detected_work,reason,model,analyzed_at')
      .eq('task_id',taskId).in('photo_id',validPhotos.map((p:any)=>p.id)).gte('analyzed_at',cutoff)
    const cachedMap=new Map((cached||[]).map((x:any)=>[x.photo_id,x]))
    const missing=validPhotos.filter((p:any)=>!cachedMap.has(p.id))
    let fresh:ScoreRow[]=[]
    let model=(cached?.[0] as any)?.model||''

    if(missing.length){
      const ai=await scoreWithFallback(request,task,missing)
      model=ai.model
      const now=new Date().toISOString()
      fresh=ai.results.map((x:any)=>({...x,analyzed_at:now})) as ScoreRow[]
      const rows=fresh.map(x=>({photo_id:x.photo_id,task_id:taskId,score:x.score,detected_work:x.detected_work,reason:x.reason,model:x.model,analyzed_at:now,updated_at:now}))
      const {error:upsertError}=await supabase.from('photo_ai_task_scores').upsert(rows,{onConflict:'photo_id,task_id'})
      if(upsertError)console.error('visual-match cache upsert failed',upsertError.message)
    }

    const combined:ScoreRow[]=[...(cached||[]) as ScoreRow[],...fresh]
    const unique=new Map(combined.map(x=>[x.photo_id,x]))
    const results=[...unique.values()].sort((a,b)=>Number(b.score)-Number(a.score)||String(b.analyzed_at).localeCompare(String(a.analyzed_at)))
    return NextResponse.json({ok:true,taskId,model,cacheDays:CACHE_DAYS,results})
  }catch(error){
    console.error('visual-match failed',error)
    const status=error instanceof ProviderError&&error.status>=400&&error.status<600?error.status:500
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:'unknown_error'},{status})
  }
}
