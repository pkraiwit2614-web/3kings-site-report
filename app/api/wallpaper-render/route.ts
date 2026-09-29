import type { NextRequest } from 'next/server'
import sharp from 'sharp'
import { Resvg } from '@resvg/resvg-js'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'
const TZ = 'Asia/Bangkok'
const CLOSED_PROC = /(ส่งของแล้ว|รับของแล้ว|ปิดงาน|เสร็จสมบูรณ์|complete|completed|closed)/i
const FOLLOW_PROC = /(ขอ ETA|ขอวัน|ยืนยัน|รอยืนยัน|รอเช็ก|ต้องยืนยัน|รอสินค้า|รอส่ง|รอผลิต|นัดเข้า|มัดจำ|รอวัสดุ)/i
const ORIGINAL_LOGO_SOURCE = 'https://raw.githubusercontent.com/pkraiwit2614-web/3kings-site-report/2ac4e1e93248fef20e23b0a9897bcca880f3f497/components/BrandLogo.tsx'
const FONT_DIR = '/tmp/3kings-wallpaper-fonts-v2'

type Project = { id:string; code:string; name:string; target_handover:string|null; sort_order:number }
type Task = { id:string; project_id:string; source_task_no:string|null; task_name:string; planned_start:string|null; planned_end:string|null; actual_progress:number|null; delay_days:number|null; site_status:string|null; blocker:string|null; next_action:string|null; target_close:string|null }
type Procurement = { id:string; project_id:string|null; vendor:string|null; item_name:string; current_status:string|null; po_no:string|null; expected_delivery:string|null; expected_delivery_text:string|null; created_at:string|null }
type Defect = { incomplete:number; awaitingCheck:number; pendingHandover:number; hotelDone:number; handoverDone:number }
type Payload = { projects:Project[]; tasks:Task[]; procurement:Procurement[]; defect:Defect; latestSync:string|null }
type RankedTask = { task:Task; project:Project|null; score:number; dueDays:number|null; targetDays:number|null }
type RankedProc = { item:Procurement; project:Project|null; score:number; dueDays:number|null }

const FONT_URLS = {
  latinRegular: 'https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf',
  latinBold: 'https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf',
  thaiRegular: 'https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansThai/NotoSansThai-Regular.ttf',
  thaiBold: 'https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansThai/NotoSansThai-Bold.ttf'
}

const assetsPromise = (async () => {
  const [latinRegularRes, latinBoldRes, thaiRegularRes, thaiBoldRes, logoRes] = await Promise.all([
    fetch(FONT_URLS.latinRegular), fetch(FONT_URLS.latinBold), fetch(FONT_URLS.thaiRegular), fetch(FONT_URLS.thaiBold), fetch(ORIGINAL_LOGO_SOURCE)
  ])
  if (![latinRegularRes, latinBoldRes, thaiRegularRes, thaiBoldRes].every(r => r.ok)) throw new Error('Required wallpaper font unavailable')

  const [latinRegular, latinBold, thaiRegular, thaiBold] = await Promise.all([
    latinRegularRes.arrayBuffer(), latinBoldRes.arrayBuffer(), thaiRegularRes.arrayBuffer(), thaiBoldRes.arrayBuffer()
  ]).then(list => list.map(x => Buffer.from(x)))

  await fs.mkdir(FONT_DIR, { recursive:true })
  const fontFiles = [
    path.join(FONT_DIR, 'NotoSans-Regular.ttf'),
    path.join(FONT_DIR, 'NotoSans-Bold.ttf'),
    path.join(FONT_DIR, 'NotoSansThai-Regular.ttf'),
    path.join(FONT_DIR, 'NotoSansThai-Bold.ttf')
  ]
  await Promise.all([
    fs.writeFile(fontFiles[0], latinRegular), fs.writeFile(fontFiles[1], latinBold),
    fs.writeFile(fontFiles[2], thaiRegular), fs.writeFile(fontFiles[3], thaiBold)
  ])

  let logo:string|null = null
  if (logoRes.ok) {
    const source = await logoRes.text()
    const dataUri = source.match(/const logoSrc = '([^']+)'/)?.[1] || ''
    const encoded = dataUri.split(',')[1]
    if (encoded) logo = (await sharp(Buffer.from(encoded, 'base64')).png().toBuffer()).toString('base64')
  }
  return { fontFiles, logo }
})()

function clamp(n:number,min:number,max:number){ return Math.min(max,Math.max(min,n)) }
function clean(v:string|number|null|undefined){
  return String(v ?? '')
    .normalize('NFC')
    .replace(/\u2026/g,'...')
    .replace(/[•·‣▪▫→←↔✓✔⚠★☆]/g,' ')
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu,'')
    .replace(/[\u0000-\u001F\u007F]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
}
function xml(v:string|number|null|undefined){
  return clean(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
}
function compact(v:string|null|undefined,max=48){ const t=clean(v); return t.length>max?`${t.slice(0,Math.max(1,max-3))}...`:t }
function fontClass(v:string|null|undefined){ return /[\u0E00-\u0E7F]/.test(clean(v)) ? 'mixed' : 'latin' }
function dateKey(d=new Date()){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d)
  const g=(t:string)=>p.find(x=>x.type===t)?.value||''
  return `${g('year')}-${g('month')}-${g('day')}`
}
function parseDate(v:string|null|undefined){ const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/); return m?Date.UTC(+m[1],+m[2]-1,+m[3]):null }
function days(v:string|null|undefined,today:string){ const a=parseDate(today),b=parseDate(v); return a===null||b===null?null:Math.round((b-a)/86400000) }
function pct(v:number|null|undefined){ return `${Math.round((Number(v)||0)*100)}%` }
function dueText(d:number|null,date:string|null|undefined,fallback?:string|null){
  if(d===null)return compact(fallback?.trim()||(date||'DATE TBC'),22)
  if(d<0)return `${Math.abs(d)}D OVERDUE`
  if(d===0)return 'DUE TODAY'
  if(d===1)return 'DUE TOMORROW'
  return `IN ${d} DAYS`
}
function syncText(v:string|null){
  if(!v)return 'SOURCE DATE TBC'
  const d=new Date(v); if(Number.isNaN(d.getTime()))return 'SOURCE DATE TBC'
  return new Intl.DateTimeFormat('en-GB',{timeZone:TZ,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d).toUpperCase()
}
function scoreTask(task:Task,project:Project|null,today:string):RankedTask{
  const dueDays=days(task.planned_end,today),targetDays=days(task.target_close,today),handoverDays=days(project?.target_handover,today),startDays=days(task.planned_start,today)
  const hasBlocker=Boolean(task.blocker?.trim()),hasAction=Boolean(task.next_action?.trim()); let score=0
  if(hasBlocker)score+=55; if(hasAction)score+=12
  if(targetDays!==null){if(targetDays<0)score+=55;else if(targetDays===0)score+=50;else if(targetDays<=3)score+=38;else if(targetDays<=7)score+=24}
  if(dueDays!==null){if(dueDays<0)score+=Math.min(35,18+Math.min(17,Math.abs(dueDays)));else if(dueDays===0)score+=30;else if(dueDays<=3)score+=20;else if(dueDays<=7)score+=12}
  if(startDays===0)score+=18; if(handoverDays!==null&&handoverDays>=0&&handoverDays<=35)score+=15
  if(dueDays!==null&&dueDays<-60&&!hasBlocker&&!hasAction&&targetDays===null)score-=80
  return {task,project,score,dueDays,targetDays}
}
function scoreProc(item:Procurement,project:Project|null,today:string):RankedProc{
  const dueDays=days(item.expected_delivery,today),handoverDays=days(project?.target_handover,today),status=`${item.current_status||''} ${item.expected_delivery_text||''}`; let score=0
  if(dueDays!==null){if(dueDays<0)score+=55;else if(dueDays===0)score+=50;else if(dueDays<=3)score+=40;else if(dueDays<=7)score+=28;else if(dueDays<=14)score+=12}
  if(FOLLOW_PROC.test(status))score+=30
  if(!item.expected_delivery&&/(ขอ ETA|ขอวัน|ยืนยัน|รอยืนยัน|รอเช็ก|ต้องยืนยัน)/i.test(status))score+=18
  if(handoverDays!==null&&handoverDays>=0&&handoverDays<=35)score+=10
  return {item,project,score,dueDays}
}

function panel(x:number,y:number,w:number,h:number,index:string,title:string,body:string){
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="#0f1f31" stroke="#334155" stroke-opacity=".65"/><rect x="${x}" y="${y}" width="${w}" height="52" rx="16" fill="#0f172a"/><rect x="${x}" y="${y+36}" width="${w}" height="16" fill="#0f172a"/><rect x="${x+14}" y="${y+14}" width="7" height="24" rx="3.5" fill="#fbbf24"/><text x="${x+34}" y="${y+32}" class="panel-title">${xml(index)}  ${xml(title)}</text>${body}</g>`
}
function taskRows(items:RankedTask[],x:number,y:number,w:number,max=4,tone='#fb7185'){
  if(!items.length)return `<text x="${x+w/2}" y="${y+88}" text-anchor="middle" class="latin muted">NO ITEMS</text>`
  return items.slice(0,max).map((r,i)=>{
    const yy=y+i*57, signal=clean(r.task.next_action?.trim()||r.task.blocker?.trim()||r.task.site_status||'Follow up progress')
    const d=r.task.target_close?r.targetDays:r.dueDays, dt=dueText(d,r.task.target_close||r.task.planned_end), late=d!==null&&d<=0
    const taskName=compact(r.task.task_name,43), detail=compact(signal,60)
    return `<g><line x1="${x}" y1="${yy}" x2="${x+w}" y2="${yy}" stroke="#334155" stroke-opacity=".42"/><rect x="${x+12}" y="${yy+14}" width="5" height="30" rx="3" fill="${tone}"/><rect x="${x+28}" y="${yy+15}" width="76" height="28" rx="8" fill="#1e293b"/><text x="${x+66}" y="${yy+35}" text-anchor="middle" class="latin code">${xml(r.project?.code||'COMMON')}</text><text x="${x+118}" y="${yy+25}" class="${fontClass(taskName)} row-title">${xml(taskName)}</text><text x="${x+118}" y="${yy+45}" class="${fontClass(detail)} row-detail">${xml(detail)}</text><text x="${x+w-18}" y="${yy+25}" text-anchor="end" class="latin right-top">${xml(pct(r.task.actual_progress))}</text><text x="${x+w-18}" y="${yy+45}" text-anchor="end" class="latin ${late?'late':'right-bottom'}">${xml(dt)}</text></g>`
  }).join('')
}
function procRows(items:RankedProc[],x:number,y:number,w:number,max=4){
  if(!items.length)return `<text x="${x+w/2}" y="${y+88}" text-anchor="middle" class="latin muted">NO PROCUREMENT FOLLOW-UP</text>`
  return items.slice(0,max).map((r,i)=>{
    const yy=y+i*57, dt=dueText(r.dueDays,r.item.expected_delivery,r.item.expected_delivery_text), late=r.dueDays!==null&&r.dueDays<=0
    const detail=compact(`${r.item.current_status||'Follow up procurement'}${r.item.po_no?` | ${r.item.po_no}`:''}`,58)
    const item=compact(r.item.item_name,42), vendor=compact(r.item.vendor?.replace(/\s*\(.*$/,'')||'SUPPLIER',18)
    return `<g><line x1="${x}" y1="${yy}" x2="${x+w}" y2="${yy}" stroke="#334155" stroke-opacity=".42"/><rect x="${x+12}" y="${yy+14}" width="5" height="30" rx="3" fill="${late?'#fb7185':'#38bdf8'}"/><rect x="${x+28}" y="${yy+15}" width="76" height="28" rx="8" fill="#1e293b"/><text x="${x+66}" y="${yy+35}" text-anchor="middle" class="latin code">${xml(r.project?.code||'COMMON')}</text><text x="${x+118}" y="${yy+25}" class="${fontClass(item)} row-title">${xml(item)}</text><text x="${x+118}" y="${yy+45}" class="${fontClass(detail)} row-detail">${xml(detail)}</text><text x="${x+w-18}" y="${yy+25}" text-anchor="end" class="${fontClass(vendor)} right-top">${xml(vendor)}</text><text x="${x+w-18}" y="${yy+45}" text-anchor="end" class="latin ${late?'late':'right-bottom'}">${xml(dt)}</text></g>`
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

    const today=dateKey(), pmap=new Map(payload.projects.map(p=>[p.id,p]))
    const ranked=payload.tasks.filter(t=>t.source_task_no!=='1'&&(Number(t.actual_progress)||0)<.999).map(t=>scoreTask(t,pmap.get(t.project_id)||null,today)).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||((a.targetDays??a.dueDays??999)-(b.targetDays??b.dueDays??999)))
    const criticalAll=ranked.filter(x=>Boolean(x.task.blocker?.trim())||(x.targetDays!==null&&x.targetDays<=1)||(x.dueDays!==null&&x.dueDays<=0&&Boolean(x.task.next_action?.trim())))
    const critical=criticalAll.slice(0,4), criticalIds=new Set(critical.map(x=>x.task.id))
    const dueSoon=ranked.filter(x=>!criticalIds.has(x.task.id)&&((x.targetDays!==null&&x.targetDays>=0&&x.targetDays<=7)||(x.dueDays!==null&&x.dueDays>=0&&x.dueDays<=7))).slice(0,3)
    const procurementAll=payload.procurement.filter(x=>!CLOSED_PROC.test(x.current_status||'')).map(x=>scoreProc(x,pmap.get(x.project_id||'')||null,today)).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)
    const procurement=procurementAll.slice(0,4)
    const handovers=payload.projects.map(p=>({project:p,days:days(p.target_handover,today)})).filter(x=>x.days!==null&&x.days>=0&&x.days<=45).sort((a,b)=>(a.days??999)-(b.days??999)).slice(0,3)
    const blockers=ranked.filter(x=>Boolean(x.task.blocker?.trim())).length
    const delayed=payload.tasks.filter(t=>t.source_task_no!=='1'&&(Number(t.actual_progress)||0)<.999&&(Number(t.delay_days)||0)>0).length
    const openRooms=payload.defect.incomplete+payload.defect.awaitingCheck+payload.defect.pendingHandover

    const assets=await assetsPromise
    const logo=assets.logo?`<image href="data:image/png;base64,${assets.logo}" x="34" y="34" width="74" height="74" preserveAspectRatio="xMidYMid meet"/>`:`<circle cx="71" cy="71" r="37" fill="#f8fafc"/><text x="71" y="80" text-anchor="middle" class="latin" font-size="24" font-weight="700" fill="#0f172a">3K</text>`

    const kpis=[
      [criticalAll.length,'CRITICAL','Action required','#fb7185'],
      [blockers,'BLOCKERS','Needs resolution','#f97316'],
      [delayed,'DELAYED','Past due / incomplete','#fbbf24'],
      [procurementAll.length,'PROCUREMENT','Follow-up required','#38bdf8'],
      [openRooms,'DEFECT / HANDOVER','Open room actions','#a78bfa']
    ] as const
    const kpiSvg=kpis.map((k,i)=>{const x=250+i*318;return `<g><rect x="${x}" y="140" width="302" height="78" rx="14" fill="#0f1f31" stroke="#334155" stroke-opacity=".6"/><rect x="${x+14}" y="154" width="5" height="48" rx="3" fill="${k[3]}"/><text x="${x+31}" y="172" class="latin kpi-number" fill="${k[3]}">${xml(k[0])}</text><text x="${x+31}" y="194" class="latin kpi-label">${xml(k[1])}</text><text x="${x+286}" y="207" text-anchor="end" class="latin tiny muted-fill">${xml(k[2])}</text></g>`}).join('')

    const handoverSvg=handovers.length?handovers.map((h,i)=>{const x=264+i*228;return `<g><rect x="${x}" y="644" width="212" height="38" rx="9" fill="#3b2f0b" stroke="#8a6b14"/><rect x="${x+10}" y="654" width="6" height="18" rx="3" fill="#fbbf24"/><text x="${x+26}" y="668" class="latin code">${xml(h.project.code)}</text><text x="${x+200}" y="668" text-anchor="end" class="latin tiny amber">${xml(h.days===0?'HANDOVER TODAY':`${h.days} DAYS`)}</text></g>`}).join(''):`<text x="480" y="668" text-anchor="middle" class="latin muted">NO HANDOVER WITHIN 45 DAYS</text>`

    const defectData=[
      ['HOTEL INCOMPLETE','Repair outstanding',payload.defect.incomplete,'#fb7185'],
      ['AWAITING HOTEL CHECK','Waiting verification',payload.defect.awaitingCheck,'#fbbf24'],
      ['PENDING HANDOVER','Non-hotel rooms',payload.defect.pendingHandover,'#38bdf8'],
      ['HOTEL CHECKED','Checked complete',payload.defect.hotelDone,'#34d399'],
      ['HANDOVER COMPLETE','Non-hotel complete',payload.defect.handoverDone,'#22c55e']
    ] as const
    const defectSvg=defectData.map((d,i)=>{const x=1091+i*157;return `<g><rect x="${x}" y="650" width="145" height="150" rx="12" fill="#0b1d2b" stroke="${d[3]}" stroke-opacity=".5"/><rect x="${x+12}" y="662" width="121" height="4" rx="2" fill="${d[3]}"/><text x="${x+72.5}" y="688" text-anchor="middle" class="latin def-title">${xml(d[0])}</text><text x="${x+72.5}" y="710" text-anchor="middle" class="latin def-sub">${xml(d[1])}</text><text x="${x+72.5}" y="763" text-anchor="middle" class="latin def-num" fill="${d[3]}">${xml(d[2])}</text></g>`}).join('')

    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
      <style>
        text{fill:#f8fafc}.latin{font-family:"Noto Sans"}.thai{font-family:"Noto Sans Thai"}.mixed{font-family:"Noto Sans Thai","Noto Sans"}.muted{font-size:15px;fill:#64748b}.muted-fill{fill:#94a3b8}.tiny{font-size:11px}.amber{fill:#fbbf24}.panel-title{font-family:"Noto Sans";font-size:16px;font-weight:700}.code{font-size:14px;font-weight:700;fill:#dbeafe}.row-title{font-size:17px;font-weight:700}.row-detail{font-size:13px;fill:#94a3b8}.right-top{font-size:14px;font-weight:700;fill:#e2e8f0}.right-bottom{font-size:12px;font-weight:700;fill:#cbd5e1}.late{font-size:12px;font-weight:700;fill:#fb7185}.kpi-number{font-size:29px;font-weight:700}.kpi-label{font-size:13px;font-weight:700;fill:#e2e8f0}.def-title{font-size:10px;font-weight:700;fill:#cbd5e1}.def-sub{font-size:9px;fill:#94a3b8}.def-num{font-size:39px;font-weight:700}
      </style>
      <rect width="1920" height="1080" fill="#071421"/><rect width="220" height="1080" fill="#06101b"/><line x1="220" y1="0" x2="220" y2="1080" stroke="#334155" stroke-opacity=".45"/>
      ${logo}<text x="122" y="61" class="latin" font-size="21" font-weight="700">3 Kings</text><text x="122" y="86" class="latin" font-size="21" font-weight="700">Construction</text><text x="122" y="104" class="latin tiny muted-fill">SITE COMMAND</text>
      <line x1="26" y1="136" x2="194" y2="136" stroke="#334155"/><text x="28" y="181" class="latin tiny muted-fill">DESKTOP</text><text x="28" y="211" class="latin tiny muted-fill">COMMAND</text><text x="28" y="241" class="latin tiny muted-fill">WORKSPACE</text><text x="28" y="938" class="latin" font-size="9" fill="#475569">PEOPLE | PLAN | EXECUTE | DELIVER</text>
      <text x="250" y="45" class="latin tiny amber">LIVE SITE COMMAND</text><text x="250" y="91" class="latin" font-size="39" font-weight="700">TODAY'S</text><text x="430" y="91" class="latin" font-size="39" font-weight="700" fill="#fbbf24">COMMAND CENTER</text><text x="250" y="116" class="latin" font-size="13" fill="#94a3b8">CRITICAL WORK | SCHEDULE | PROCUREMENT | HANDOVER | DEFECT</text>
      <rect x="1580" y="36" width="288" height="72" rx="12" fill="#0b2231" stroke="#1d536e"/><circle cx="1600" cy="58" r="5" fill="#34d399"/><text x="1614" y="62" class="latin tiny" fill="#38bdf8">DATA SOURCE</text><text x="1600" y="84" class="latin" font-size="18" font-weight="700" fill="#e0f2fe">LIVE</text><text x="1600" y="101" class="latin" font-size="10" fill="#94a3b8">UPDATED ${xml(syncText(payload.latestSync))}</text>
      ${kpiSvg}
      ${panel(250,236,794,330,'01','CRITICAL FOLLOW-UP / BLOCKERS',taskRows(critical,250,288,794,4,'#fb7185'))}
      ${panel(1060,236,808,330,'02','PROCUREMENT FOLLOW-UP',procRows(procurement,1060,288,808,4))}
      ${panel(250,582,794,308,'03','DUE SOON / HANDOVER',handoverSvg+taskRows(dueSoon,250,690,794,3,'#fbbf24'))}
      ${panel(1060,582,808,308,'04','CONDO HANDOVER / DEFECT',defectSvg+`<text x="1078" y="827" class="latin tiny muted-fill">COUNTS FROM CURRENT CONDO ROOM MASTER</text>`)}
      <text x="250" y="934" class="latin" font-size="10" fill="#475569">AUTO UPDATE EVERY 15 MIN | CURRENT MASTER DATA | WINDOWS TASKBAR SAFE AREA</text>
    </svg>`

    const renderer=new Resvg(svg,{font:{loadSystemFonts:false,fontFiles:assets.fontFiles,defaultFontFamily:'Noto Sans',sansSerifFamily:'Noto Sans'},textRendering:2,shapeRendering:2})
    const rendered=renderer.render().asPng()
    const png=await sharp(rendered).resize(width,height,{fit:'fill'}).png().toBuffer()
    return new Response(new Uint8Array(png),{status:200,headers:{'Content-Type':'image/png','Cache-Control':'no-store, max-age=0','Content-Disposition':'inline; filename="3kings-command-center.png"','X-Wallpaper-Renderer':'english-first-v3'}})
  }catch(error){
    console.error('wallpaper-render failed',error)
    return new Response('Wallpaper render failed',{status:500})
  }
}
