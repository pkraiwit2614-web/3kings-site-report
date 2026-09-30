'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { dateTH, pct } from '@/lib/format'
import { sortTasksByNumber } from '@/lib/taskOrder'

type PhotoMode='latest'|'before_after'
type PPhoto={
  id:string;project_id:string;task_id:string|null;report_date:string;phase:string;caption:string;image_url:string;
  source:'site-report'|'drive';matched:boolean;verified:boolean;room_no?:string|null;folder_name?:string|null
}

const PAGE=500
const DEFECT_DONE_URL='https://drive.google.com/drive/folders/1GJy5xu2eQMbv4MIKnQC5df7m_CpyocXK'

function overlaps(task:any,start:string,end:string){
  if(!task.planned_start&&!task.planned_end)return false
  const s=task.planned_start||task.planned_end||''
  const e=task.planned_end||task.planned_start||''
  return s<=end&&e>=start
}
function shortNote(task:any){return task.notes?.trim()||task.next_action?.trim()||task.blocker?.trim()||'—'}
function phaseLabel(phase:string,matched=true){
  if(!matched)return 'รูปภาพรวม'
  if(phase==='before')return 'ก่อนทำ'
  if(phase==='after')return 'หลังทำ'
  if(phase==='during')return 'ระหว่างทำ'
  return 'รูปหน้างาน'
}
function sourceLabel(source:PPhoto['source']){return source==='drive'?'Google Drive':'Site Report'}
function evidenceLabel(photo:PPhoto,taskId?:string){
  if(photo.verified&&(!taskId||photo.task_id===taskId))return `Verified • ${sourceLabel(photo.source)}`
  if(taskId&&photo.task_id===taskId)return `${photo.source==='drive'?'Task Match':'Task Photo'} • ${sourceLabel(photo.source)}`
  if(photo.task_id)return `Mapped • ${sourceLabel(photo.source)}`
  return `Plot fallback • ${sourceLabel(photo.source)}`
}
function evidenceRank(photo:PPhoto){
  if(photo.verified)return 0
  if(photo.matched&&photo.source==='site-report')return 1
  if(photo.matched)return 2
  return 3
}
function sortEvidenceLatest(a:PPhoto,b:PPhoto){
  const rank=evidenceRank(a)-evidenceRank(b)
  return rank!==0?rank:b.report_date.localeCompare(a.report_date)||b.id.localeCompare(a.id)
}
function extractRoomNo(fileName:string,folderName?:string|null){
  const find=(value:string)=>value.toUpperCase().match(/([AB]\d{3,4})/)?.[1]||null
  return find(fileName)||find(folderName||'')
}
function fileSafe(value:string){return value.replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim()}
function formatDateTime(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)
}
function statusStyle(value:string|null|undefined){
  const s=String(value||'').toLowerCase()
  if(s.includes('complete')||s.includes('เสร็จ')||s.includes('on track'))return {fill:'E9F6EF',line:'CFE9DA',text:'196645'}
  if(s.includes('delay')||s.includes('ล่าช้า')||s.includes('block'))return {fill:'FDECEB',line:'F1CDCA',text:'9E312D'}
  if(s.includes('progress')||s.includes('ดำเนิน')||s.includes('risk'))return {fill:'FFF3DC',line:'F0DFB8',text:'85570D'}
  return {fill:'F0F2F4',line:'D8DDE2',text:'5F6873'}
}
function delayStyle(days:number){
  if(days>7)return {fill:'FFF2F1',line:'EDCAC6',text:'B23C36'}
  if(days>=1&&days<=6)return {fill:'FFF8E7',line:'EAD8A4',text:'96630D'}
  return {fill:'F6F7F8',line:'E0E4E8',text:'27364A'}
}
async function urlToDataUri(url:string,cache:Map<string,string>){
  if(cache.has(url))return cache.get(url)||''
  try{
    const res=await fetch(url)
    if(!res.ok)return ''
    const blob=await res.blob()
    const data=await new Promise<string>((resolve,reject)=>{
      const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error);r.readAsDataURL(blob)
    })
    cache.set(url,data)
    return data
  }catch{return ''}
}
async function loadAllDrivePhotos(s:any){
  let rows:any[]=[]
  for(let from=0;;from+=PAGE){
    const result=await s.from('drive_photo_index')
      .select('id,project_id,schedule_task_id,drive_file_id,drive_folder_name,file_name,drive_url,photo_date,phase,match_method,match_score,indexed_at,is_active,verified_at,verified_by,mapping_note')
      .eq('is_active',true).order('photo_date',{ascending:false}).range(from,from+PAGE-1)
    if(result.error)throw result.error
    const batch=result.data||[]
    rows=rows.concat(batch)
    if(batch.length<PAGE)break
  }
  return rows
}
function readFilters(){
  const selects=[...document.querySelectorAll<HTMLSelectElement>('.ep-filters select')]
  const dates=[...document.querySelectorAll<HTMLInputElement>('.ep-filters input[type="date"]')]
  return {
    projectId:selects[0]?.value||'',
    photoMode:(selects[1]?.value||'latest') as PhotoMode,
    start:dates[0]?.value||'',
    end:dates[1]?.value||'',
  }
}
function visibleProjectCode(){
  const eyebrow=document.querySelector<HTMLElement>('.ep-stage .ep-eyebrow')?.textContent?.trim()||''
  if(eyebrow)return eyebrow.split('•')[0]?.trim()||''
  const condo=document.querySelector<HTMLElement>('.ep-stage-controls span')?.textContent||''
  if(/Condo\s+A/i.test(condo))return 'CONDO-A'
  if(/Condo\s+B/i.test(condo))return 'CONDO-B'
  return ''
}
function isSlideView(){return Boolean(document.querySelector('.ep-stage .ep-slide'))}

export default function ExecutivePowerPointParity20260927(){
  const path=usePathname()
  const running=useRef(false)

  useEffect(()=>{
    if(path!=='/presentation')return

    const exportPowerPoint=async(button:HTMLButtonElement)=>{
      if(running.current)return
      running.current=true
      const original=button.textContent||'ดาวน์โหลด PowerPoint'
      button.disabled=true
      button.textContent='กำลังสร้าง PowerPoint…'
      try{
        const filters=readFilters()
        if(!filters.start||!filters.end)throw new Error('Presentation date range is unavailable')
        const s=getSupabase()
        const [p,t,r,i,rp,dp,cr]=await Promise.all([
          s.from('projects').select('*').eq('active',true).order('sort_order'),
          s.from('v_schedule_tasks').select('*').order('planned_start'),
          s.from('daily_reports').select('id,project_id,report_date').order('report_date',{ascending:false}),
          s.from('report_items').select('id,daily_report_id,schedule_task_id,work_item'),
          s.from('report_photos').select('id,daily_report_id,report_item_id,storage_path,phase,caption,created_at').order('created_at',{ascending:false}),
          loadAllDrivePhotos(s),
          s.from('condo_room_status').select('room_no,building,customer_status,hotel_participation,current_status,status_group,next_action,source_modified_at').order('room_no'),
        ])
        if(p.error)throw p.error
        if(t.error)throw t.error

        const projects=p.data||[]
        const tasks=sortTasksByNumber((t.data||[]).filter((x:any)=>x.source_task_no!=='1')) as any[]
        const reports=r.data||[];const items=i.data||[];const reportPhotos=rp.data||[]
        const reportMap=new Map(reports.map((x:any)=>[x.id,x]))
        const itemMap=new Map(items.map((x:any)=>[x.id,x]))
        const paths=[...new Set(reportPhotos.map((x:any)=>x.storage_path).filter(Boolean))] as string[]
        const signedMap=new Map<string,string>()
        if(paths.length){
          const {data:signed}=await s.storage.from('site-photos').createSignedUrls(paths,60*60)
          ;(signed||[]).forEach((x:any)=>{if(x?.path&&x?.signedUrl)signedMap.set(x.path,x.signedUrl)})
        }
        const sitePhotos:PPhoto[]=reportPhotos.flatMap((photo:any)=>{
          const report:any=reportMap.get(photo.daily_report_id);if(!report)return []
          const item:any=photo.report_item_id?itemMap.get(photo.report_item_id):undefined
          const url=signedMap.get(photo.storage_path)||'';if(!url)return []
          return [{id:`report-${photo.id}`,project_id:report.project_id,task_id:item?.schedule_task_id||null,report_date:report.report_date,phase:photo.phase||'other',caption:photo.caption||item?.work_item||'Site photo',image_url:url,source:'site-report' as const,matched:Boolean(item?.schedule_task_id),verified:false}]
        })
        const drivePhotos:PPhoto[]=(dp as any[]).map(photo=>({
          id:`drive-${photo.id}`,project_id:photo.project_id,task_id:photo.schedule_task_id||null,report_date:photo.photo_date,phase:photo.phase||'other',caption:photo.file_name,
          image_url:`/api/drive-photo?fileId=${encodeURIComponent(photo.drive_file_id)}`,source:'drive' as const,matched:Boolean(photo.schedule_task_id),verified:Boolean(photo.verified_at),
          room_no:extractRoomNo(photo.file_name,photo.drive_folder_name),folder_name:photo.drive_folder_name,
        }))
        const photos=[...sitePhotos,...drivePhotos].filter(x=>x.report_date>=filters.start&&x.report_date<=filters.end)
        const periodTasks=tasks.filter(task=>overlaps(task,filters.start,filters.end))

        const pickPhotos=(projectId:string,taskId?:string)=>{
          const projectPhotos=photos.filter(x=>x.project_id===projectId)
          const direct=taskId?projectPhotos.filter(x=>x.task_id===taskId).slice().sort(sortEvidenceLatest):[]
          const fallback=taskId?projectPhotos.filter(x=>!x.task_id).slice().sort((a,b)=>b.report_date.localeCompare(a.report_date)||b.id.localeCompare(a.id)):[]
          const pool=taskId?[...direct,...fallback]:projectPhotos.slice().sort(sortEvidenceLatest)
          if(filters.photoMode==='latest')return pool.slice(0,4)
          const before=pool.find(x=>x.phase==='before');const after=pool.find(x=>x.phase==='after')
          const chosen:PPhoto[]=[]
          if(before)chosen.push(before)
          if(after&&after.id!==before?.id)chosen.push(after)
          if(!before&&!after&&direct.length>=2){
            const chronological=direct.slice().sort((a,b)=>a.report_date.localeCompare(b.report_date))
            if(chronological[0].report_date!==chronological[chronological.length-1].report_date)chosen.push(chronological[0],chronological[chronological.length-1])
          }
          for(const photo of pool){if(chosen.length>=4)break;if(!chosen.some(x=>x.id===photo.id))chosen.push(photo)}
          return chosen.slice(0,4)
        }
        const pickCondoPhotos=(building:'A'|'B',projectId:string)=>{
          const byRoom=photos.filter(x=>x.source==='drive'&&x.room_no?.toUpperCase().startsWith(building))
          const byProject=photos.filter(x=>x.project_id===projectId)
          const unique=new Map<string,PPhoto>();[...byRoom,...byProject].forEach(x=>unique.set(x.id,x))
          return [...unique.values()].sort((a,b)=>b.report_date.localeCompare(a.report_date)||b.id.localeCompare(a.id)).slice(0,4)
        }

        let exportProjects=projects.filter((x:any)=>!filters.projectId||x.id===filters.projectId)
        if(isSlideView()){
          const code=visibleProjectCode()
          const selected=projects.find((x:any)=>x.code===code)
          if(selected)exportProjects=[selected]
        }

        const mod=await import('pptxgenjs')
        const PptxGenJS=mod.default
        const pptx:any=new PptxGenJS()
        pptx.layout='LAYOUT_WIDE'
        pptx.author='3 Kings Construction';pptx.company='3 Kings Construction';pptx.subject='Executive Presentation View';pptx.title='3 Kings Construction Executive Presentation';pptx.lang='th-TH'
        const imageCache=new Map<string,string>()
        const slideView=isSlideView()

        const addMetricCard=(slide:any,x:number,y:number,w:number,h:number,label:string,value:string,fill:string,line:string,text:string)=>{
          slide.addText(`${label}\n${value}`,{
            x,y,w,h,fontSize:11.5,bold:true,color:text,fill:{color:fill},line:{color:line,width:.9},margin:.08,valign:'mid',breakLine:false
          })
        }

        const addImageGrid=async(slide:any,taskPhotos:PPhoto[],taskId?:string)=>{
          const positions=[
            {x:6.22,y:1.18,w:3.02,h:2.45},{x:9.42,y:1.18,w:3.02,h:2.45},
            {x:6.22,y:4.08,w:3.02,h:2.45},{x:9.42,y:4.08,w:3.02,h:2.45},
          ]
          for(let n=0;n<Math.min(4,taskPhotos.length);n++){
            const photo=taskPhotos[n];const pos=positions[n]
            const data=await urlToDataUri(photo.image_url,imageCache)
            if(data)slide.addImage({data,x:pos.x,y:pos.y,w:pos.w,h:pos.h})
            else slide.addText('รูปไม่พร้อมใช้งาน',{x:pos.x,y:pos.y,w:pos.w,h:pos.h,fontSize:11,color:'7A8490',align:'center',valign:'mid',fill:{color:'F3F4F5'},line:{color:'D7DCE2'}})
            slide.addText(`${phaseLabel(photo.phase,taskId?photo.task_id===taskId:true)} • ${taskId?evidenceLabel(photo,taskId):sourceLabel(photo.source)}\n${dateTH(photo.report_date)}`,{
              x:pos.x,y:pos.y+pos.h+.04,w:pos.w,h:.34,fontSize:7.5,color:'5E6976',margin:0
            })
          }
        }

        const addTaskSlide=async(project:any,task:any,index:number,total:number)=>{
          const slide:any=pptx.addSlide();slide.background={color:'FFFDF9'}
          const status=statusStyle(task.site_status)
          const delay=Number(task.delay_days)||0;const dStyle=delayStyle(delay)
          const actual=Math.max(0,Math.min(1,Number(task.actual_progress)||0))
          const plan=pct(Number(task.current_plan_progress)||0)
          const variance=Number(task.current_variance)||0

          slide.addText(`${project.code} • ${task.category||'งานก่อสร้าง'}`,{x:.55,y:.34,w:6.0,h:.25,fontSize:10.5,bold:true,color:'A97920',charSpacing:.4,margin:0})
          slide.addText(task.task_name||'-',{x:.55,y:.70,w:5.35,h:.62,fontSize:28,bold:true,color:'17243A',margin:0,fit:'shrink'})
          slide.addText(task.area||'-',{x:.55,y:1.40,w:5.25,h:.28,fontSize:11.5,color:'687486',margin:0})
          slide.addText(task.site_status||'ยังไม่ระบุสถานะ',{x:10.50,y:.38,w:2.35,h:.36,fontSize:10.5,bold:true,color:status.text,fill:{color:status.fill},line:{color:status.line,width:1},margin:.08,align:'center',valign:'mid'})

          slide.addText('ACTUAL PROGRESS',{x:.55,y:1.90,w:2.7,h:.22,fontSize:9.5,bold:true,color:'7B715F',charSpacing:.6,margin:0})
          slide.addText(pct(actual),{x:.55,y:2.14,w:2.2,h:.44,fontSize:25,bold:true,color:'17243A',margin:0})
          slide.addShape(pptx.ShapeType.rect,{x:.55,y:2.62,w:5.10,h:.10,line:{color:'E4E0D7',transparency:100},fill:{color:'E4E0D7'}})
          if(actual>0)slide.addShape(pptx.ShapeType.rect,{x:.55,y:2.62,w:5.10*actual,h:.10,line:{color:'2F6FB0',transparency:100},fill:{color:'2F6FB0'}})

          addMetricCard(slide,.55,2.88,2.45,.62,'Plan',plan,'FFFDF8','DDD5C7','17243A')
          addMetricCard(slide,3.15,2.88,2.45,.62,'Variance',`${variance>0?'+':''}${Math.round(variance*100)}%`,'FFFDF8','DDD5C7',variance<0?'B23C36':'17243A')
          addMetricCard(slide,.55,3.65,2.45,.68,'Delay',delay>0?`${delay} วัน`:'—',dStyle.fill,dStyle.line,dStyle.text)
          addMetricCard(slide,3.15,3.65,2.45,.68,'อัปเดต',dateTH(task.source_updated_at),'F6F7F8','E0E4E8','27364A')

          slide.addText('หมายเหตุ / งานถัดไป',{x:.55,y:4.58,w:4.9,h:.22,fontSize:10.5,bold:true,color:'7A705F',margin:0})
          slide.addText(shortNote(task),{x:.55,y:4.85,w:5.05,h:1.08,fontSize:13.5,color:'27364A',valign:'top',margin:.08,fill:{color:'F3F0E8'},line:{color:'DDD5C7',width:1},fit:'shrink'})
          if(task.contractor||task.responsible_person)slide.addText(`ผู้รับผิดชอบ: ${task.contractor||task.responsible_person}`,{x:.55,y:6.15,w:5.05,h:.28,fontSize:10.5,bold:true,color:'4E5B68',margin:0})
          slide.addText(`${index+1} / ${total}`,{x:11.55,y:7.05,w:1.0,h:.18,fontSize:8.5,color:'8A919A',align:'right',margin:0})

          const taskPhotos=pickPhotos(project.id,task.id)
          slide.addText(`${filters.photoMode==='latest'?'รูปล่าสุด':'Before–After'} • วันที่รูปล่าสุด: ${taskPhotos[0]?dateTH(taskPhotos[0].report_date):'-'} • Verified ${taskPhotos.filter(x=>x.task_id===task.id&&x.verified).length} รูป`,{
            x:6.22,y:.78,w:6.22,h:.24,fontSize:8.8,bold:true,color:'5C6875',align:'right',margin:0
          })
          await addImageGrid(slide,taskPhotos,task.id)
        }

        const addCondoSlide=async(project:any,building:'A'|'B')=>{
          const rooms=(cr.data||[]).filter((x:any)=>x.building===building||String(x.room_no||'').startsWith(building))
          const count=(group:string)=>rooms.filter((x:any)=>x.status_group===group).length
          const status=[
            ['ส่งมอบแล้ว','Non-Hotel - Handover Complete','E9F6EF','196645'],
            ['Hotel ตรวจแล้ว','Hotel - Checked Complete','E9F6EF','196645'],
            ['Defect เสร็จ / รอ Hotel ตรวจ','Hotel - Awaiting Check','FFF3DC','85570D'],
            ['Pending Handover','Non-Hotel - Pending Handover','FFF3DC','85570D'],
            ['Defect ยังไม่เสร็จ','Hotel - Incomplete','FDECEB','9E312D'],
            ['Awaiting Sale','Non-Hotel - Awaiting Sale','F0F2F4','5F6873'],
          ] as const
          const slide:any=pptx.addSlide();slide.background={color:'FFFDF9'}
          slide.addText(`CONDO ${building} • DEFECT / HANDOVER STATUS`,{x:.55,y:.34,w:5.7,h:.26,fontSize:10.5,bold:true,color:'A97920',margin:0})
          slide.addText(project.name,{x:.55,y:.72,w:5.25,h:.55,fontSize:27,bold:true,color:'17243A',margin:0})
          const closed=count('Hotel - Checked Complete')+count('Non-Hotel - Handover Complete')
          const remaining=count('Hotel - Incomplete')+count('Hotel - Awaiting Check')+count('Non-Hotel - Pending Handover')
          slide.addText(`ปิดแล้ว ${rooms.length?Math.round(closed/rooms.length*100):0}% • เหลือติดตาม ${remaining} ห้อง`,{x:.55,y:1.40,w:5.0,h:.34,fontSize:15,bold:true,color:'233A5D',margin:0})
          status.forEach(([label,group,fill,text],idx)=>{
            const x=.55+(idx%2)*2.55;const y=2.03+Math.floor(idx/2)*.78
            addMetricCard(slide,x,y,2.37,.62,label,`${count(group)} ห้อง`,fill,text,text)
          })
          const incomplete=rooms.filter((x:any)=>x.status_group==='Hotel - Incomplete').map((x:any)=>x.room_no).sort()
          slide.addText(`ห้อง Defect ยังไม่เสร็จ: ${incomplete.length?incomplete.join(', '):'ไม่มี'}`,{x:.55,y:4.62,w:5.02,h:.65,fontSize:10.5,color:'27364A',fill:{color:'FFF4F2'},line:{color:'E4B5B0',width:1},margin:.09,fit:'shrink'})
          const latest=rooms.map((x:any)=>x.source_modified_at).filter(Boolean).sort().at(-1)
          slide.addText(`อัปเดตสถานะล่าสุด: ${formatDateTime(latest)}`,{x:.55,y:5.55,w:5.0,h:.25,fontSize:9,color:'697482',margin:0})
          const condoPhotos=pickCondoPhotos(building,project.id)
          slide.addText(`Defect Done — ตึก ${building}`,{x:6.22,y:.78,w:6.22,h:.24,fontSize:9,bold:true,color:'5C6875',align:'right',margin:0})
          await addImageGrid(slide,condoPhotos)
          if(!condoPhotos.length)slide.addText('เปิด Picture - Defect Done ใน Google Drive',{x:7.0,y:2.8,w:4.5,h:.55,fontSize:15,bold:true,color:'2F6FB0',align:'center',hyperlink:{url:DEFECT_DONE_URL}})
        }

        for(const project of exportProjects){
          const building=project.code==='CONDO-A'?'A':project.code==='CONDO-B'?'B':null
          if(building){await addCondoSlide(project,building);continue}
          const projectTasks=periodTasks.filter((x:any)=>x.project_id===project.id)
          if(!slideView){
            const cover:any=pptx.addSlide();cover.background={color:'F6F2E9'}
            const projectWeight=projectTasks.reduce((sum:number,x:any)=>sum+Math.max(1,Number(x.planned_duration_days)||1),0)
            const actual=projectWeight?projectTasks.reduce((sum:number,x:any)=>{const w=Math.max(1,Number(x.planned_duration_days)||1);return sum+w*(Number(x.actual_progress)||0)},0)/projectWeight:0
            const plan=projectWeight?projectTasks.reduce((sum:number,x:any)=>{const w=Math.max(1,Number(x.planned_duration_days)||1);return sum+w*(Number(x.imported_plan_progress??x.current_plan_progress)||0)},0)/projectWeight:0
            cover.addText('3 KINGS CONSTRUCTION',{x:.65,y:.48,w:4.2,h:.3,fontSize:11,bold:true,color:'A97920',charSpacing:1.5,margin:0})
            cover.addText(project.name,{x:.65,y:1.08,w:7.2,h:.68,fontSize:28,bold:true,color:'17243A',margin:0})
            cover.addText(`${dateTH(filters.start)} – ${dateTH(filters.end)}`,{x:.65,y:1.88,w:5,h:.34,fontSize:13,color:'687486',margin:0})
            cover.addText(`Actual ${pct(actual)}   •   Plan ${pct(plan)}   •   งานในช่วง ${projectTasks.length} รายการ`,{x:.65,y:2.52,w:7.2,h:.46,fontSize:16,bold:true,color:'233A5D',margin:0})
            await addImageGrid(cover,pickPhotos(project.id))
          }
          for(let index=0;index<projectTasks.length;index++)await addTaskSlide(project,projectTasks[index],index,projectTasks.length)
        }

        await pptx.writeFile({fileName:`Executive-Presentation_${fileSafe(filters.start)}_${fileSafe(filters.end)}.pptx`,compression:true})
      }catch(error){
        console.error('PowerPoint parity export failed',error)
        window.alert('ไม่สามารถสร้าง PowerPoint ได้ กรุณาลองใหม่อีกครั้ง')
      }finally{
        running.current=false
        button.disabled=false
        button.textContent=original
      }
    }

    const onClick=(event:MouseEvent)=>{
      const target=event.target instanceof Element?event.target.closest<HTMLButtonElement>('[data-ui-request="presentation-ppt"]'):null
      if(!target)return
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation()
      void exportPowerPoint(target)
    }
    document.addEventListener('click',onClick,true)
    return()=>document.removeEventListener('click',onClick,true)
  },[path])

  return null
}
