import type { NextRequest } from 'next/server'
import sharp from 'sharp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'
const TZ='Asia/Bangkok'
const CLOSED_PROC=/(ส่งของแล้ว|รับของแล้ว|ปิดงาน|เสร็จสมบูรณ์|complete|completed|closed)/i
const FOLLOW_PROC=/(ขอ ETA|ขอวัน|ยืนยัน|รอยืนยัน|รอเช็ก|ต้องยืนยัน|รอสินค้า|รอส่ง|รอผลิต|นัดเข้า|มัดจำ|รอวัสดุ)/i
const ORIGINAL_LOGO_SOURCE='https://raw.githubusercontent.com/pkraiwit2614-web/3kings-site-report/2ac4e1e93248fef20e23b0a9897bcca880f3f497/components/BrandLogo.tsx'

type Project={id:string;code:string;name:string;target_handover:string|null;sort_order:number}
type Task={id:string;project_id:string;source_task_no:string|null;task_name:string;planned_start:string|null;planned_end:string|null;actual_progress:number|null;delay_days:number|null;site_status:string|null;blocker:string|null;next_action:string|null;target_close:string|null}
type Procurement={id:string;project_id:string|null;vendor:string|null;item_name:string;current_status:string|null;po_no:string|null;expected_delivery:string|null;expected_delivery_text:string|null;created_at:string|null}
type Defect={incomplete:number;awaitingCheck:number;pendingHandover:number;hotelDone:number;handoverDone:number}
type Payload={projects:Project[];tasks:Task[];procurement:Procurement[];defect:Defect;latestSync:string|null}
type RankedTask={task:Task;project:Project|null;score:number;dueDays:number|null;targetDays:number|null}
type RankedProc={item:Procurement;project:Project|null;score:number;dueDays:number|null}

const assetsPromise=(async()=>{
  const [regularRes,boldRes,logoRes]=await Promise.all([
    fetch('https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansThai/NotoSansThai-Regular.ttf'),
    fetch('https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansThai/NotoSansThai-Bold.ttf'),
    fetch(ORIGINAL_LOGO_SOURCE)
  ])
  const regular=regularRes.ok?Buffer.from(await regularRes.arrayBuffer()):null
  const bold=boldRes.ok?Buffer.from(await boldRes.arrayBuffer()):null
  let logo:string|null=null
  if(logoRes.ok){
    const source=await logoRes.text()
    const dataUri=source.match(/const logoSrc = '([^']+)'/)?.[1]||''
    const encoded=dataUri.split(',')[1]
    if(encoded){
      const png=await sharp(Buffer.from(encoded,'base64')).png().toBuffer()
      logo=png.toString('base64')
    }
  }
  return {regular,bold,logo}
})().catch(()=>({regular:null,bold:null,logo:null}))

function clamp(n:number,min:number,max:number){return Math.min(max,Math.max(min,n))}
function dateKey(d=new Date()){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d)
  const v=(t:string)=>p.find(x=>x.type===t)?.value||''
  return `${v('year')}-${v('month')}-${v('day')}`
}
function parseDate(v:string|null|undefined){
  if(!v)return null
  const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m?Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])):null
}
function days(v:string|null|undefined,today:string){
  const a=parseDate(today),b=parseDate(v)
  return a===null||b===null?null:Math.round((b-a)/86400000)
}
function compact(v:string|null|undefined,max=48){
  const t=(v||'').replace(/\s+/g,' ').trim()
  return t.length>max?`${t.slice(0,max-1)}…`:t
}
function xml(v:string|number|null|undefined){
  return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
}
function pct(v:number|null|undefined){return `${Math.round((Number(v)||0)*100)}%`}
function dueText(d:number|null,date:string|null|undefined,fallback?:string|null){
  if(d===null)return compact(fallback?.trim()||(date||'DATE TBC'),22)
  if(d<0)return `${Math.abs(d)}D OVERDUE`
  if(d===0)return 'DUE TODAY'
  if(d===1)return 'DUE TOMORROW'
  return `IN ${d} DAYS`
}
function scoreTask(task:Task,project:Project|null,today:string):RankedTask{
  const dueDays=days(task.planned_end,today),targetDays=days(task.target_close,today),handoverDays=days(project?.target_handover,today),startDays=days(task.planned_start,today)
  const hasBlocker=Boolean(task.blocker?.trim()),hasAction=Boolean(task.next_action?.trim())
  let score=0
  if(hasBlocker)score+=55
  if(hasAction)score+=12
  if(targetDays!==null){if(targetDays<0)score+=55;else if(targetDays===0)score+=50;else if(targetDays<=3)score+=38;else if(targetDays<=7)score+=24}
  if(dueDays!==null){if(dueDays<0)score+=Math.min(35,18+Math.min(17,Math.abs(dueDays)));else if(dueDays===0)score+=30;else if(dueDays<=3)score+=20;else if(dueDays<=7)score+=12}
  if(startDays===0)score+=18
  if(handoverDays!==null&&handoverDays>=0&&handoverDays<=35)score+=15
  if(dueDays!==null&&dueDays<-60&&!hasBlocker&&!hasAction&&targetDays===null)score-=80
  return {task,project,score,dueDays,targetDays}
}
function scoreProc(item:Procurement,project:Project|null,today:string):RankedProc{
  const dueDays=days(item.expected_delivery,today),handoverDays=days(project?.target_handover,today)
  const status=`${item.current_status||''} ${item.expected_delivery_text||''}`
  let score=0
  if(dueDays!==null){if(dueDays<0)score+=55;else if(dueDays===0)score+=50;else if(dueDays<=3)score+=40;else if(dueDays<=7)score+=28;else if(dueDays<=14)score+=12}
  if(FOLLOW_PROC.test(status))score+=30
  if(!item.expected_delivery&&/(ขอ ETA|ขอวัน|ยืนยัน|รอยืนยัน|รอเช็ก|ต้องยืนยัน)/i.test(status))score+=18
  if(handoverDays!==null&&handoverDays>=0&&handoverDays<=35)score+=10
  return {item,project,score,dueDays}
}
function syncText(v:string|null){
  if(!v)return 'SOURCE DATE TBC'
  const d=new Date(v)
  if(Number.isNaN(d.getTime()))return 'SOURCE DATE TBC'
  return new Intl.DateTimeFormat('en-GB',{timeZone:TZ,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d).toUpperCase()
}

function panel(x:number,y:number,w:number,h:number,index:string,title:string,body:string){
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="#0f1f31" stroke="#334155" stroke-opacity=".65"/><rect x="${x}" y="${y}" width="${w}" height="42" rx="16" fill="#0f172a"/><rect x="${x}" y="${y+28}" width="${w}" height="14" fill="#0f172a"/><text x="${x+16}" y="${y+27}" class="tiny amber">${xml(index)}</text><text x="${x+48}" y="${y+27}" class="panel-title">${xml(title)}</text>${body}</g>`
}
function taskRows(items:RankedTask[],x:number,y:number,w:number,max=4,tone='#fb7185'){
  if(!items.length)return `<text x="${x+w/2}" y="${y+90}" text-anchor="middle" class="muted">NO ITEMS</text>`
  return items.slice(0,max).map((r,i)=>{
    const yy=y+i*56
    const signal=r.task.next_action?.trim()||r.task.blocker?.trim()||r.task.site_status||'Follow up progress'
    const d=r.task.target_close?r.targetDays:r.dueDays
    const dt=dueText(d,r.task.target_close||r.task.planned_end)
    const late=d!==null&&d<=0
    return `<g><line x1="${x}" y1="${yy}" x2="${x+w}" y2="${yy}" stroke="#334155" stroke-opacity=".45"/><rect x="${x+12}" y="${yy+14}" width="5" height="28" rx="3" fill="${tone}"/><rect x="${x+28}" y="${yy+14}" width="74" height="28" rx="8" fill="#1e293b"/><text x="${x+65}" y="${yy+34}" text-anchor="middle" class="code">${xml(r.project?.code||'COMMON')}</text><text x="${x+116}" y="${yy+24}" class="row-title">${xml(compact(r.task.task_name,43))}</text><text x="${x+116}" y="${yy+43}" class="row-detail">${xml(compact(signal,62))}</text><text x="${x+w-18}" y="${yy+24}" text-anchor="end" class="right-top">${xml(pct(r.task.actual_progress))}</text><text x="${x+w-18}" y="${yy+43}" text-anchor="end" class="${late?'late':'right-bottom'}">${xml(dt)}</text></g>`
  }).join('')
}
function procRows(items:RankedProc[],x:number,y:number,w:number,max=4){
  if(!items.length)return `<text x="${x+w/2}" y="${y+90}" text-anchor="middle" class="muted">NO PROCUREMENT FOLLOW-UP</text>`
  return items.slice(0,max).map((r,i)=>{
    const yy=y+i*56
    const dt=dueText(r.dueDays,r.item.expected_delivery,r.item.expected_delivery_text)
    const late=r.dueDays!==null&&r.dueDays<=0
    const detail=`${r.item.current_status||'Follow up procurement'}${r.item.po_no?` · ${r.item.po_no}`:''}`
    return `<g><line x1="${x}" y1="${yy}" x2="${x+w}" y2="${yy}" stroke="#334155" stroke-opacity=".45"/><rect x="${x+12}" y="${yy+14}" width="5" height="28" rx="3" fill="${late?'#fb7185':'#38bdf8'}"/><rect x="${x+28}" y="${yy+14}" width="74" height="28" rx="8" fill="#1e293b"/><text x="${x+65}" y="${yy+34}" text-anchor="middle" class="code">${xml(r.project?.code||'COMMON')}</text><text x="${x+116}" y="${yy+24}" class="row-title">${xml(compact(r.item.item_name,43))}</text><text x="${x+116}" y="${yy+43}" class="row-detail">${xml(compact(detail,61))}</text><text x="${x+w-18}" y="${yy+24}" text-anchor="end" class="right-top">${xml(compact(r.item.vendor?.replace(/\s*\(.*$/,'')||'SUPPLIER',18))}</text><text x="${x+w-18}" y="${yy+43}" text-anchor="end" class="${late?'late':'right-bottom'}">${xml(dt)}</text></g>`
  }).join('')
}

export async function GET(req:NextRequest){
  try{
    const token=req.headers.get('x-wallpaper-token')?.trim()||''
    if(token.length<20)return new Response('Unauthorized',{status:401})
    const requestUrl=new URL(req.url)
    const width=clamp(Number(requestUrl.searchParams.get('w')||1920)||1920,1280,3840)
    const height=clamp(Number(requestUrl.searchParams.get('h')||1080)||1080,720,2160)

    const rpc=await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_wallpaper_payload`,{
      method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({p_token:token}),cache:'no-store'
    })
    if(!rpc.ok)return new Response('Data source unavailable',{status:502})
    const payload=(await rpc.json()) as Payload|null
    if(!payload)return new Response('Unauthorized',{status:401})

    const today=dateKey()
    const pmap=new Map(payload.projects.map(p=>[p.id,p]))
    const ranked=payload.tasks.filter(t=>t.source_task_no!=='1'&&(Number(t.actual_progress)||0)<.999).map(t=>scoreTask(t,pmap.get(t.project_id)||null,today)).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||((a.targetDays??a.dueDays??999)-(b.targetDays??b.dueDays??999)))
    const critical=ranked.filter(x=>Boolean(x.task.blocker?.trim())||(x.targetDays!==null&&x.targetDays<=1)||(x.dueDays!==null&&x.dueDays<=0&&Boolean(x.task.next_action?.trim()))).slice(0,4)
    const criticalIds=new Set(critical.map(x=>x.task.id))
    const dueSoon=ranked.filter(x=>!criticalIds.has(x.task.id)&&((x.targetDays!==null&&x.targetDays>=0&&x.targetDays<=7)||(x.dueDays!==null&&x.dueDays>=0&&x.dueDays<=7))).slice(0,4)
    const procurement=payload.procurement.filter(x=>!CLOSED_PROC.test(x.current_status||'')).map(x=>scoreProc(x,pmap.get(x.project_id||'')||null,today)).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,4)
    const handovers=payload.projects.map(p=>({project:p,days:days(p.target_handover,today)})).filter(x=>x.days!==null&&x.days>=0&&x.days<=45).sort((a,b)=>(a.days??999)-(b.days??999)).slice(0,3)
    const blockers=ranked.filter(x=>Boolean(x.task.blocker?.trim())).length
    const delayed=payload.tasks.filter(t=>t.source_task_no!=='1'&&(Number(t.actual_progress)||0)<.999&&(Number(t.delay_days)||0)>0).length

    const assets=await assetsPromise
    const regularFace=assets.regular?`@font-face{font-family:NotoThai;src:url(data:font/ttf;base64,${assets.regular.toString('base64')});font-weight:400;}`:''
    const boldFace=assets.bold?`@font-face{font-family:NotoThai;src:url(data:font/ttf;base64,${assets.bold.toString('base64')});font-weight:700;}`:''
    const logo=assets.logo?`<image href="data:image/png;base64,${assets.logo}" x="34" y="34" width="74" height="74" preserveAspectRatio="xMidYMid meet"/>`:`<circle cx="71" cy="71" r="37" fill="#f8fafc"/><text x="71" y="80" text-anchor="middle" font-size="24" font-weight="700" fill="#0f172a">3K</text>`

    const kpis=[
      [critical.length,'CRITICAL','Immediate control','#fb7185'],[blockers,'OPEN BLOCKERS','Need unblock','#f97316'],[delayed,'DELAYED TASKS','Incomplete + delay','#fbbf24'],[procurement.length,'PROCUREMENT','Need follow-up','#38bdf8'],[payload.defect.incomplete+payload.defect.awaitingCheck+payload.defect.pendingHandover,'DEFECT / HANDOVER','Open room follow-up','#a78bfa']
    ] as const
    const kpiSvg=kpis.map((k,i)=>{const x=250+i*318;return `<g><rect x="${x}" y="140" width="302" height="74" rx="14" fill="#0f1f31" stroke="#334155" stroke-opacity=".6"/><text x="${x+18}" y="171" font-size="29" font-weight="700" fill="${k[3]}">${xml(k[0])}</text><text x="${x+18}" y="193" class="kpi-label">${xml(k[1])}</text><text x="${x+18}" y="207" class="tiny muted-fill">${xml(k[2])}</text></g>`}).join('')

    const handoverSvg=handovers.length?handovers.map((h,i)=>{const x=264+i*220;return `<g><rect x="${x}" y="619" width="204" height="34" rx="8" fill="#3b2f0b" stroke="#8a6b14"/><text x="${x+12}" y="641" class="code">${xml(h.project.code)}</text><text x="${x+192}" y="641" text-anchor="end" class="tiny amber">${xml(h.days===0?'HANDOVER TODAY':`${h.days}D TO HANDOVER`)}</text></g>`}).join(''):`<text x="480" y="641" text-anchor="middle" class="muted">NO HANDOVER WITHIN 45 DAYS</text>`

    const defectData=[
      ['HOTEL INCOMPLETE',payload.defect.incomplete,'Outstanding repair','#fb7185'],['AWAITING CHECK',payload.defect.awaitingCheck,'Hotel verification','#fbbf24'],['PENDING HANDOVER',payload.defect.pendingHandover,'Non-hotel rooms','#38bdf8'],['HOTEL COMPLETE',payload.defect.hotelDone,'Checked complete','#34d399'],['HANDOVER COMPLETE',payload.defect.handoverDone,'Non-hotel complete','#22c55e']
    ] as const
    const defectSvg=defectData.map((d,i)=>{const x=1091+i*157;return `<g><rect x="${x}" y="625" width="145" height="168" rx="12" fill="#0b1d2b" stroke="${d[3]}" stroke-opacity=".45"/><text x="${x+72.5}" y="655" text-anchor="middle" class="def-label">${xml(d[0])}</text><text x="${x+72.5}" y="708" text-anchor="middle" font-size="39" font-weight="700" fill="${d[3]}">${xml(d[1])}</text><text x="${x+72.5}" y="739" text-anchor="middle" class="tiny muted-fill">${xml(d[2])}</text></g>`}).join('')

    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
      <style>${regularFace}${boldFace}
        text{font-family:${assets.regular?'NotoThai,':'Arial,'}sans-serif;fill:#f8fafc}.bold{font-weight:700}.muted{font-size:15px;fill:#64748b}.muted-fill{fill:#94a3b8}.tiny{font-size:11px}.amber{fill:#fbbf24}.panel-title{font-size:17px;font-weight:700}.code{font-size:14px;font-weight:700;fill:#dbeafe}.row-title{font-size:17px;font-weight:700}.row-detail{font-size:13px;fill:#94a3b8}.right-top{font-size:14px;font-weight:700;fill:#e2e8f0}.right-bottom{font-size:12px;font-weight:700;fill:#cbd5e1}.late{font-size:12px;font-weight:700;fill:#fb7185}.kpi-label{font-size:13px;font-weight:700;fill:#e2e8f0}.def-label{font-size:11px;font-weight:700;fill:#cbd5e1}
      </style>
      <rect width="1920" height="1080" fill="#071421"/><rect width="220" height="1080" fill="#06101b"/><line x1="220" y1="0" x2="220" y2="1080" stroke="#334155" stroke-opacity=".45"/>
      ${logo}<text x="122" y="61" font-size="21" font-weight="700">3 Kings</text><text x="122" y="86" font-size="21" font-weight="700">Construction</text><text x="122" y="104" class="tiny muted-fill">SITE COMMAND</text>
      <line x1="26" y1="136" x2="194" y2="136" stroke="#334155"/><text x="28" y="181" class="tiny muted-fill">DESKTOP</text><text x="28" y="211" class="tiny muted-fill">COMMAND</text><text x="28" y="241" class="tiny muted-fill">WORKSPACE</text><text x="28" y="942" font-size="9" fill="#475569">PEOPLE · PLAN · EXECUTE · DELIVER</text>
      <text x="250" y="48" class="tiny amber">LIVE SITE COMMAND</text><text x="250" y="95" font-size="39" font-weight="700">TODAY'S</text><text x="430" y="95" font-size="39" font-weight="700" fill="#fbbf24">COMMAND CENTER</text><text x="250" y="119" font-size="13" fill="#94a3b8">Priority control for schedule · procurement · handover · defect follow-up</text>
      <rect x="1580" y="38" width="288" height="70" rx="12" fill="#0b2231" stroke="#1d536e"/><text x="1600" y="59" class="tiny" fill="#38bdf8">DATA SOURCE</text><text x="1600" y="82" font-size="18" font-weight="700" fill="#e0f2fe">LIVE</text><text x="1600" y="99" font-size="10" fill="#94a3b8">UPDATED ${xml(syncText(payload.latestSync))}</text>
      ${kpiSvg}
      ${panel(250,232,794,340,'01','CRITICAL FOLLOW-UP / BLOCKERS',taskRows(critical,250,274,794,4,'#fb7185'))}
      ${panel(1060,232,808,340,'02','PROCUREMENT FOLLOW-UP',procRows(procurement,1060,274,808,4))}
      ${panel(250,588,794,300,'03','DUE SOON / HANDOVER',handoverSvg+taskRows(dueSoon,250,662,794,4,'#fbbf24'))}
      ${panel(1060,588,808,300,'04','CONDO HANDOVER / DEFECT',defectSvg+`<text x="1078" y="825" class="tiny muted-fill">STATUS COUNTS FROM CURRENT CONDO ROOM MASTER</text>`)}
      <text x="250" y="936" font-size="10" fill="#475569">AUTO-REFRESH DATA · WALLPAPER UPDATE EVERY 15 MIN · SAFE AREA RESERVED BELOW FOR WINDOWS TASKBAR</text>
    </svg>`

    const png=await sharp(Buffer.from(svg)).resize(width,height,{fit:'fill'}).png().toBuffer()
    return new Response(new Uint8Array(png),{status:200,headers:{'Content-Type':'image/png','Cache-Control':'no-store, max-age=0','Content-Disposition':'inline; filename="3kings-command-center.png"'}})
  }catch(error){
    console.error('wallpaper-render failed',error)
    return new Response('Wallpaper render failed',{status:500})
  }
}
