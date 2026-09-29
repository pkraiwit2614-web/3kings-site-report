import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'
const TZ = 'Asia/Bangkok'
const CLOSED_PROC = /(ส่งของแล้ว|รับของแล้ว|ปิดงาน|เสร็จสมบูรณ์|complete|completed|closed)/i
const FOLLOW_PROC = /(ขอ ETA|ขอวัน|ยืนยัน|รอยืนยัน|รอเช็ก|ต้องยืนยัน|รอสินค้า|รอส่ง|รอผลิต|นัดเข้า|มัดจำ|รอวัสดุ)/i

const regularFontPromise = fetch('https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansThai/NotoSansThai-Regular.ttf')
  .then(r => r.ok ? r.arrayBuffer() : null)
  .catch(() => null)
const boldFontPromise = fetch('https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansThai/NotoSansThai-Bold.ttf')
  .then(r => r.ok ? r.arrayBuffer() : null)
  .catch(() => null)
const logoPromise = fetch('https://raw.githubusercontent.com/pkraiwit2614-web/3kings-site-report/main/components/BrandLogo.tsx')
  .then(async r => {
    if (!r.ok) return null
    const text = await r.text()
    return text.match(/const logoSrc = '([^']+)'/)?.[1] || null
  })
  .catch(() => null)

type Project = { id:string; code:string; name:string; target_handover:string|null; sort_order:number }
type Task = { id:string; project_id:string; source_task_no:string|null; task_name:string; planned_start:string|null; planned_end:string|null; actual_progress:number|null; delay_days:number|null; site_status:string|null; blocker:string|null; next_action:string|null; target_close:string|null }
type Procurement = { id:string; project_id:string|null; vendor:string|null; item_name:string; current_status:string|null; po_no:string|null; expected_delivery:string|null; expected_delivery_text:string|null; created_at:string|null }
type Defect = { incomplete:number; awaitingCheck:number; pendingHandover:number; hotelDone:number; handoverDone:number }
type Payload = { projects:Project[]; tasks:Task[]; procurement:Procurement[]; defect:Defect; latestSync:string|null }
type RankedTask = { task:Task; project:Project|null; score:number; dueDays:number|null; targetDays:number|null }
type RankedProc = { item:Procurement; project:Project|null; score:number; dueDays:number|null }

function clamp(n:number,min:number,max:number){ return Math.min(max,Math.max(min,n)) }
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
function compact(v:string|null|undefined,max=56){
  const t=(v||'').replace(/\s+/g,' ').trim()
  return t.length>max?`${t.slice(0,max-1)}…`:t
}
function pct(v:number|null|undefined){ return `${Math.round((Number(v)||0)*100)}%` }
function dueText(d:number|null,date:string|null|undefined,fallback?:string|null){
  if(d===null)return fallback?.trim()||(date||'DATE TBC')
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

function WorkRow({code,title,detail,rightTop,rightBottom,tone='amber'}:{code:string;title:string;detail:string;rightTop:string;rightBottom:string;tone?:'red'|'amber'|'blue'}){
  const dot=tone==='red'?'#fb7185':tone==='blue'?'#38bdf8':'#fbbf24'
  return <div style={{display:'flex',alignItems:'center',gap:10,padding:'7px 10px',borderTop:'1px solid rgba(148,163,184,.12)',minHeight:44}}>
    <div style={{display:'flex',width:5,height:24,borderRadius:5,background:dot}}/>
    <div style={{display:'flex',width:60,justifyContent:'center',padding:'4px 6px',borderRadius:7,background:'rgba(148,163,184,.10)',fontSize:12,fontWeight:700,color:'#dbeafe'}}>{code}</div>
    <div style={{display:'flex',flexDirection:'column',flex:1,minWidth:0}}>
      <div style={{display:'flex',fontSize:14,fontWeight:700,color:'#f8fafc'}}>{compact(title,50)}</div>
      <div style={{display:'flex',fontSize:10,color:'#94a3b8',marginTop:2}}>{compact(detail,70)}</div>
    </div>
    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',width:140}}>
      <div style={{display:'flex',fontSize:12,fontWeight:700,color:'#e2e8f0'}}>{compact(rightTop,18)}</div>
      <div style={{display:'flex',fontSize:9,fontWeight:700,color:rightBottom.includes('OVERDUE')||rightBottom==='DUE TODAY'?'#fb7185':'#cbd5e1',marginTop:2}}>{rightBottom}</div>
    </div>
  </div>
}
function Panel({index,title,children}:{index:string;title:string;children:React.ReactNode}){
  return <div style={{display:'flex',flexDirection:'column',flex:1,minWidth:0,minHeight:0,border:'1px solid rgba(148,163,184,.18)',borderRadius:14,background:'rgba(15,31,49,.84)',overflow:'hidden'}}>
    <div style={{display:'flex',alignItems:'center',height:38,padding:'0 13px',background:'rgba(15,23,42,.78)',borderBottom:'1px solid rgba(148,163,184,.14)'}}>
      <div style={{display:'flex',fontSize:10,fontWeight:700,color:'#fbbf24',marginRight:9}}>{index}</div>
      <div style={{display:'flex',fontSize:13,fontWeight:700,color:'#e2e8f0'}}>{title}</div>
    </div>
    <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0}}>{children}</div>
  </div>
}
function Kpi({value,label,sub,tone}:{value:number|string;label:string;sub:string;tone:string}){
  return <div style={{display:'flex',flexDirection:'column',justifyContent:'center',flex:1,minWidth:0,height:68,padding:'8px 12px',border:'1px solid rgba(148,163,184,.16)',borderRadius:12,background:'rgba(15,31,49,.78)'}}>
    <div style={{display:'flex',fontSize:24,fontWeight:700,color:tone}}>{value}</div>
    <div style={{display:'flex',fontSize:10,fontWeight:700,color:'#e2e8f0',marginTop:1}}>{label}</div>
    <div style={{display:'flex',fontSize:8,color:'#94a3b8',marginTop:2}}>{sub}</div>
  </div>
}
function DefectTile({label,value,sub,tone}:{label:string;value:number;sub:string;tone:string}){
  return <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flex:1,minWidth:0,padding:6,borderRadius:10,border:`1px solid ${tone}55`,background:`${tone}12`}}>
    <div style={{display:'flex',fontSize:9,fontWeight:700,color:'#cbd5e1',textAlign:'center'}}>{label}</div>
    <div style={{display:'flex',fontSize:24,fontWeight:700,color:tone,marginTop:3}}>{value}</div>
    <div style={{display:'flex',fontSize:7,color:'#94a3b8',marginTop:2,textAlign:'center'}}>{sub}</div>
  </div>
}

export async function GET(req:NextRequest){
  try{
    const token=req.headers.get('x-wallpaper-token')?.trim()||''
    if(token.length<20)return new Response('Unauthorized',{status:401})

    const url=new URL(req.url)
    const width=clamp(Number(url.searchParams.get('w')||1920)||1920,1280,3840)
    const height=clamp(Number(url.searchParams.get('h')||1080)||1080,720,2160)

    const rpc=await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_wallpaper_payload`,{
      method:'POST',
      headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_token:token}),cache:'no-store'
    })
    if(!rpc.ok)return new Response('Data source unavailable',{status:502})
    const payload=(await rpc.json()) as Payload|null
    if(!payload)return new Response('Unauthorized',{status:401})

    const today=dateKey()
    const pmap=new Map(payload.projects.map(p=>[p.id,p]))
    const ranked=payload.tasks.map(t=>scoreTask(t,pmap.get(t.project_id)||null,today)).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||((a.targetDays??a.dueDays??999)-(b.targetDays??b.dueDays??999)))
    const critical=ranked.filter(x=>Boolean(x.task.blocker?.trim())||(x.targetDays!==null&&x.targetDays<=1)||(x.dueDays!==null&&x.dueDays<=0&&Boolean(x.task.next_action?.trim()))).slice(0,4)
    const criticalIds=new Set(critical.map(x=>x.task.id))
    const dueSoon=ranked.filter(x=>!criticalIds.has(x.task.id)&&((x.targetDays!==null&&x.targetDays>=0&&x.targetDays<=7)||(x.dueDays!==null&&x.dueDays>=0&&x.dueDays<=7))).slice(0,4)
    const procurement=payload.procurement.filter(x=>!CLOSED_PROC.test(x.current_status||'')).map(x=>scoreProc(x,pmap.get(x.project_id||'')||null,today)).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,4)
    const handovers=payload.projects.map(p=>({project:p,days:days(p.target_handover,today)})).filter(x=>x.days!==null&&x.days>=0&&x.days<=45).sort((a,b)=>(a.days??999)-(b.days??999)).slice(0,3)
    const blockers=ranked.filter(x=>Boolean(x.task.blocker?.trim())).length
    const delayed=payload.tasks.filter(t=>(Number(t.actual_progress)||0)<.999&&(Number(t.delay_days)||0)>0).length

    const [regular,bold,logo]=await Promise.all([regularFontPromise,boldFontPromise,logoPromise])
    const fonts=[] as {name:string;data:ArrayBuffer;weight:400|700;style:'normal'}[]
    if(regular)fonts.push({name:'Noto Sans Thai',data:regular,weight:400,style:'normal'})
    if(bold)fonts.push({name:'Noto Sans Thai',data:bold,weight:700,style:'normal'})
    const family=regular?'Noto Sans Thai':'Arial'
    const empty=(text:string)=><div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,color:'#64748b',fontSize:12}}>{text}</div>

    return new ImageResponse(
      <div style={{display:'flex',width:'100%',height:'100%',background:'#071421',color:'#f8fafc',fontFamily:family}}>
        <aside style={{display:'flex',flexDirection:'column',width:220,height:'100%',padding:'26px 20px 108px',background:'#06101b',borderRight:'1px solid rgba(148,163,184,.12)'}}>
          <div style={{display:'flex',alignItems:'center',gap:11}}>
            {logo?<img src={logo} width="60" height="60" alt="3 Kings Construction" style={{objectFit:'contain'}}/>:<div style={{display:'flex',width:60,height:60,borderRadius:30,alignItems:'center',justifyContent:'center',background:'#f8fafc',color:'#111827',fontSize:22,fontWeight:700}}>3K</div>}
            <div style={{display:'flex',flexDirection:'column'}}><div style={{display:'flex',fontSize:16,fontWeight:700,lineHeight:1.1}}>3 Kings</div><div style={{display:'flex',fontSize:16,fontWeight:700,lineHeight:1.1}}>Construction</div><div style={{display:'flex',fontSize:8,color:'#94a3b8',marginTop:5}}>SITE COMMAND</div></div>
          </div>
          <div style={{display:'flex',height:1,background:'rgba(148,163,184,.18)',margin:'26px 0'}}/>
          <div style={{display:'flex',flexDirection:'column',gap:11,fontSize:9,fontWeight:700,color:'#64748b'}}><div style={{display:'flex'}}>DESKTOP</div><div style={{display:'flex'}}>COMMAND</div><div style={{display:'flex'}}>WORKSPACE</div></div>
          <div style={{display:'flex',marginTop:'auto',fontSize:7,color:'#475569'}}>PEOPLE · PLAN · EXECUTE · DELIVER</div>
        </aside>

        <section style={{display:'flex',flexDirection:'column',flex:1,minWidth:0,padding:'20px 24px 104px',gap:9}}>
          <header style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{display:'flex',flexDirection:'column'}}><div style={{display:'flex',fontSize:9,fontWeight:700,color:'#fbbf24'}}>LIVE SITE COMMAND</div><div style={{display:'flex',fontSize:31,fontWeight:700,marginTop:3}}>TODAY&apos;S <span style={{display:'flex',color:'#fbbf24',marginLeft:8}}>COMMAND CENTER</span></div><div style={{display:'flex',fontSize:10,color:'#94a3b8',marginTop:3}}>Schedule · Procurement · Handover · Defect follow-up</div></div>
            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',padding:'8px 12px',borderRadius:10,border:'1px solid rgba(56,189,248,.25)',background:'rgba(14,165,233,.08)'}}><div style={{display:'flex',fontSize:8,fontWeight:700,color:'#38bdf8'}}>DATA SOURCE</div><div style={{display:'flex',fontSize:13,fontWeight:700,color:'#e0f2fe',marginTop:2}}>LIVE</div><div style={{display:'flex',fontSize:7,color:'#94a3b8',marginTop:2}}>UPDATED {syncText(payload.latestSync)}</div></div>
          </header>

          <div style={{display:'flex',gap:8}}>
            <Kpi value={critical.length} label="CRITICAL" sub="Immediate control" tone="#fb7185"/>
            <Kpi value={blockers} label="OPEN BLOCKERS" sub="Need unblock" tone="#f97316"/>
            <Kpi value={delayed} label="DELAYED TASKS" sub="Incomplete + delay" tone="#fbbf24"/>
            <Kpi value={procurement.length} label="PROCUREMENT" sub="Need follow-up" tone="#38bdf8"/>
            <Kpi value={payload.defect.incomplete+payload.defect.awaitingCheck+payload.defect.pendingHandover} label="DEFECT / HANDOVER" sub="Open room follow-up" tone="#a78bfa"/>
          </div>

          <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0,gap:8}}>
            <div style={{display:'flex',flex:1,minHeight:0,gap:8}}>
              <Panel index="01" title="CRITICAL FOLLOW-UP / BLOCKERS">{critical.length?critical.map(x=><WorkRow key={x.task.id} code={x.project?.code||'COMMON'} title={x.task.task_name} detail={x.task.next_action?.trim()||x.task.blocker?.trim()||x.task.site_status||'Follow up progress'} rightTop={pct(x.task.actual_progress)} rightBottom={dueText(x.task.target_close?x.targetDays:x.dueDays,x.task.target_close||x.task.planned_end)} tone="red"/>):empty('NO CRITICAL ITEMS')}</Panel>
              <Panel index="02" title="PROCUREMENT FOLLOW-UP">{procurement.length?procurement.map(x=><WorkRow key={x.item.id} code={x.project?.code||'COMMON'} title={x.item.item_name} detail={`${x.item.current_status||'Follow up procurement status'}${x.item.po_no?` · ${x.item.po_no}`:''}`} rightTop={compact(x.item.vendor?.replace(/\s*\(.*$/,'')||'SUPPLIER',18)} rightBottom={dueText(x.dueDays,x.item.expected_delivery,x.item.expected_delivery_text)} tone={x.dueDays!==null&&x.dueDays<=0?'red':'blue'}/>):empty('NO PROCUREMENT FOLLOW-UP')}</Panel>
            </div>
            <div style={{display:'flex',flex:1,minHeight:0,gap:8}}>
              <Panel index="03" title="DUE SOON / HANDOVER">
                <div style={{display:'flex',padding:'6px 9px',gap:6,borderBottom:'1px solid rgba(148,163,184,.12)'}}>{handovers.length?handovers.map(x=><div key={x.project.id} style={{display:'flex',flex:1,alignItems:'center',justifyContent:'space-between',padding:'5px 7px',borderRadius:7,background:'rgba(251,191,36,.08)',border:'1px solid rgba(251,191,36,.18)'}}><div style={{display:'flex',fontSize:10,fontWeight:700}}>{x.project.code}</div><div style={{display:'flex',fontSize:8,color:'#fbbf24'}}>{x.days===0?'HANDOVER TODAY':`${x.days}D TO HANDOVER`}</div></div>):<div style={{display:'flex',fontSize:9,color:'#64748b'}}>NO HANDOVER WITHIN 45 DAYS</div>}</div>
                {dueSoon.length?dueSoon.map(x=><WorkRow key={x.task.id} code={x.project?.code||'COMMON'} title={x.task.task_name} detail={x.task.next_action?.trim()||x.task.site_status||'Upcoming work'} rightTop={pct(x.task.actual_progress)} rightBottom={dueText(x.task.target_close?x.targetDays:x.dueDays,x.task.target_close||x.task.planned_end)} tone="amber"/>):empty('NO DUE-SOON ITEMS')}
              </Panel>
              <Panel index="04" title="CONDO HANDOVER / DEFECT">
                <div style={{display:'flex',gap:6,padding:'8px',flex:1,alignItems:'stretch'}}>
                  <DefectTile label="HOTEL INCOMPLETE" value={payload.defect.incomplete} sub="Outstanding repair" tone="#fb7185"/>
                  <DefectTile label="AWAITING CHECK" value={payload.defect.awaitingCheck} sub="Hotel verification" tone="#fbbf24"/>
                  <DefectTile label="PENDING HANDOVER" value={payload.defect.pendingHandover} sub="Non-hotel rooms" tone="#38bdf8"/>
                  <DefectTile label="HOTEL COMPLETE" value={payload.defect.hotelDone} sub="Checked complete" tone="#34d399"/>
                  <DefectTile label="HANDOVER COMPLETE" value={payload.defect.handoverDone} sub="Non-hotel complete" tone="#22c55e"/>
                </div>
                <div style={{display:'flex',height:18,alignItems:'center',padding:'0 9px',fontSize:7,color:'#64748b',borderTop:'1px solid rgba(148,163,184,.12)'}}>STATUS COUNTS FROM CURRENT CONDO ROOM MASTER</div>
              </Panel>
            </div>
          </div>
        </section>
      </div>,
      {width,height,fonts:fonts.length?fonts:undefined,headers:{'Cache-Control':'no-store, max-age=0','Content-Disposition':'inline; filename="3kings-command-center.png"'}}
    )
  }catch(error){
    console.error('wallpaper-png render failed',error)
    return new Response('Wallpaper render failed',{status:500})
  }
}
