import {canEditDefect,resolveAccessRole} from '@/lib/accessControl'
import {NextRequest,NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {createHash} from 'node:crypto'

export const runtime='nodejs'
export const maxDuration=60

const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||''
const GEMINI_MODEL=process.env.GEMINI_DEFECT_MODEL||'gemini-3.5-flash-lite'
const MAX_FILE_SIZE=20*1024*1024

type ValidationResult={
  is_defect:boolean
  rooms:string[]
  defect_count:number
  reason:string
  defects:Array<{room:string;detail:string}>
}

function clean(value:unknown,max=1000){return String(value??'').trim().slice(0,max)}
function parseJson(raw:string){
  const text=raw.trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'')
  try{return JSON.parse(text)}catch{}
  const a=text.indexOf('{'),b=text.lastIndexOf('}')
  if(a>=0&&b>a)return JSON.parse(text.slice(a,b+1))
  throw new Error('validation_invalid_json')
}
function normalizeRoom(value:unknown){
  const room=clean(value,16).toUpperCase().replace(/\s+/g,'')
  return /^[AB][0-9]{3}$/.test(room)?room:''
}
async function logEvent(s:any,userId:string,sessionId:string|null,userAgent:string,action:string,target:string,metadata:Record<string,unknown>){
  await s.from('activity_logs').insert({
    user_id:userId,
    client_session_id:sessionId||crypto.randomUUID(),
    event_type:'data_change',
    path:'/defect-flow',
    action,
    target,
    metadata,
    user_agent:userAgent.slice(0,500)||null,
  }).catch(()=>null)
}
async function validatePdf(bytes:Buffer,fileName:string):Promise<ValidationResult>{
  const apiKey=clean(process.env.GEMINI_API_KEY||'',512)
  if(!apiKey)throw new Error('defect_validator_not_configured')
  const prompt=`คุณเป็นตัวกรองเอกสาร Defect ของโครงการ Above Condo A+B

ตรวจ PDF นี้แบบเข้มงวดก่อนอนุญาตให้เข้าระบบ Defect
ชื่อไฟล์: ${fileName}

ให้ is_defect=true เฉพาะเมื่อเอกสารมี "รายการปัญหา/งานค้าง/Defect/Handover issue" ที่ผูกกับเลขห้องจริงรูปแบบ Axxx หรือ Bxxx อย่างน้อย 1 ห้อง
ตัวอย่างที่ต้อง reject: รายการวัสดุ, PO/PR, จำนวนโคมไฟ, ใบส่งของ, invoice, progress report, schedule, payroll, daily report หรือเอกสารอื่นที่ไม่ใช่รายการ Defect แม้จะมีเลขห้องอยู่
ห้ามเดาเลขห้องหรือรายละเอียดที่ไม่เห็นในเอกสาร

ตอบ JSON เท่านั้น:
{
  "is_defect": true,
  "rooms": ["A511"],
  "defect_count": 1,
  "reason": "เหตุผลสั้นๆ",
  "defects": [{"room":"A511","detail":"ข้อความปัญหาจากเอกสารแบบสั้น"}]
}

ถ้าไม่ใช่ Defect ให้ rooms=[] defect_count=0 defects=[]`
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,{
    method:'POST',
    headers:{'content-type':'application/json','x-goog-api-key':apiKey},
    body:JSON.stringify({
      contents:[{role:'user',parts:[
        {text:prompt},
        {inlineData:{mimeType:'application/pdf',data:bytes.toString('base64')}}
      ]}],
      generationConfig:{responseMimeType:'application/json',temperature:0,maxOutputTokens:1800}
    }),
    signal:AbortSignal.timeout(50000),
  })
  const json=await response.json().catch(()=>null) as any
  if(!response.ok)throw new Error(`defect_validator_${response.status}:${clean(json?.error?.message||'request_failed',240)}`)
  const raw=(json?.candidates?.[0]?.content?.parts||[]).map((p:any)=>typeof p?.text==='string'?p.text:'').join('\n')
  const parsed=parseJson(raw)
  const defects=(Array.isArray(parsed?.defects)?parsed.defects:[])
    .map((x:any)=>({room:normalizeRoom(x?.room),detail:clean(x?.detail,600)}))
    .filter((x:any)=>x.room&&x.detail)
  const rooms=[...new Set([
    ...(Array.isArray(parsed?.rooms)?parsed.rooms:[]).map(normalizeRoom).filter(Boolean),
    ...defects.map((x:any)=>x.room)
  ])] as string[]
  const isDefect=parsed?.is_defect===true&&rooms.length>0&&defects.length>0
  return {
    is_defect:isDefect,
    rooms:isDefect?rooms:[],
    defect_count:isDefect?defects.length:0,
    reason:clean(parsed?.reason,isDefect?1000:1000)||'No defect evidence',
    defects:isDefect?defects:[],
  }
}

export async function POST(request:NextRequest){
  const bearer=request.headers.get('authorization')||''
  const accessToken=bearer.toLowerCase().startsWith('bearer ')?bearer.slice(7).trim():''
  if(!accessToken)return NextResponse.json({ok:false,error:'missing_auth'},{status:401})

  const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{
    global:{headers:{Authorization:`Bearer ${accessToken}`}},
    auth:{persistSession:false,autoRefreshToken:false}
  })
  const {data:{user},error:userError}=await supabase.auth.getUser(accessToken)
  if(userError||!user)return NextResponse.json({ok:false,error:'invalid_auth'},{status:401})
  const {data:profile}=await supabase.from('profiles').select('role,active').eq('user_id',user.id).maybeSingle()
  if(!profile?.active||!canEditDefect(resolveAccessRole(profile.role,user.id))){
    return NextResponse.json({ok:false,error:'forbidden'},{status:403})
  }

  const body=await request.json().catch(()=>null) as any
  const storagePath=clean(body?.storagePath,600)
  const fileName=clean(body?.fileName,255)
  const mimeType=clean(body?.mimeType,100)
  const fileSize=Number(body?.fileSize||0)
  const clientSessionId=clean(body?.clientSessionId,80)||null
  const userAgent=clean(body?.userAgent,500)
  if(!storagePath.startsWith(user.id+'/')||mimeType!=='application/pdf'||fileSize<=0||fileSize>MAX_FILE_SIZE){
    return NextResponse.json({ok:false,error:'invalid_upload_metadata'},{status:400})
  }

  const cleanup=async()=>{await supabase.storage.from('defect-flow-staging').remove([storagePath]).catch(()=>null)}
  try{
    const {data:file,error:downloadError}=await supabase.storage.from('defect-flow-staging').download(storagePath)
    if(downloadError||!file){await cleanup();return NextResponse.json({ok:false,error:'staging_download_failed'},{status:400})}
    const bytes=Buffer.from(await file.arrayBuffer())
    if(!bytes.length||bytes.length>MAX_FILE_SIZE){await cleanup();return NextResponse.json({ok:false,error:'invalid_pdf_size'},{status:400})}
    const sha256=createHash('sha256').update(bytes).digest('hex')

    const {data:duplicate}=await supabase.from('defect_file_uploads')
      .select('id,file_name')
      .eq('content_sha256',sha256)
      .eq('validation_status','accepted')
      .limit(1)
      .maybeSingle()
    if(duplicate){
      await cleanup()
      await logEvent(supabase,user.id,clientSessionId,userAgent,'defect_pdf_duplicate_ignored',String(duplicate.id),{file_name:fileName,content_sha256:sha256})
      return NextResponse.json({ok:true,status:'duplicate',message:'ไฟล์นี้เคยรับเข้าระบบแล้ว จึงไม่เพิ่มซ้ำ'})
    }

    const validation=await validatePdf(bytes,fileName)
    if(!validation.is_defect){
      await cleanup()
      await logEvent(supabase,user.id,clientSessionId,userAgent,'defect_pdf_rejected_non_defect',fileName,{reason:validation.reason,content_sha256:sha256})
      return NextResponse.json({ok:true,status:'rejected',message:'ไฟล์นี้ไม่ใช่รายการ Defect จึงไม่นำเข้าระบบ',reason:validation.reason})
    }

    const known=await supabase.from('condo_room_status').select('room_no').in('room_no',validation.rooms)
    if(known.error)throw new Error('room_validation_failed')
    const knownRooms=new Set((known.data||[]).map((x:any)=>String(x.room_no)))
    const validRooms=validation.rooms.filter(x=>knownRooms.has(x))
    if(!validRooms.length){
      await cleanup()
      await logEvent(supabase,user.id,clientSessionId,userAgent,'defect_pdf_rejected_unknown_room',fileName,{rooms:validation.rooms,content_sha256:sha256})
      return NextResponse.json({ok:true,status:'rejected',message:'ไม่พบเลขห้องที่ตรงกับฐานข้อมูล Above Condo A+B'})
    }

    const serverToken=process.env.DEFECT_INGEST_SERVER_TOKEN||''
    if(!serverToken)throw new Error('defect_ingest_server_token_missing')
    const {data:registered,error:registerError}=await supabase.rpc('defect_register_validated_file',{
      p_server_token:serverToken,
      p_file_name:fileName,
      p_storage_path:storagePath,
      p_mime_type:mimeType,
      p_file_size:fileSize,
      p_content_sha256:sha256,
      p_detected_rooms:validRooms,
      p_validation_reason:validation.reason,
      p_client_session_id:clientSessionId,
      p_user_agent:userAgent,
    })
    if(registerError)throw registerError
    if(registered?.status==='duplicate'){
      await cleanup()
      return NextResponse.json({ok:true,status:'duplicate',message:'ข้อมูลไฟล์นี้มีอยู่แล้ว จึงไม่เพิ่มซ้ำ'})
    }
    return NextResponse.json({ok:true,status:'accepted',rooms:validRooms,defectCount:validation.defect_count,message:`รับเข้า Defect Flow แล้ว • พบ ${validRooms.length} ห้อง`})
  }catch(error){
    await cleanup()
    await logEvent(supabase,user.id,clientSessionId,userAgent,'defect_pdf_validation_failed',fileName,{error:clean(error instanceof Error?error.message:error,500)})
    console.error('defect upload validation failed',error)
    return NextResponse.json({ok:false,error:'defect_validation_failed',message:'ตรวจสอบไฟล์ไม่สำเร็จ จึงยังไม่เก็บไฟล์เข้าระบบ'},{status:500})
  }
}
