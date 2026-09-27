'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { sortTasksByNumber } from '@/lib/taskOrder'

type PhotoRow={
  drive_file_id:string;drive_folder_id:string|null;project_id:string;schedule_task_id:string|null;file_name:string;
  photo_date:string;phase:string|null;verified_at:string|null;indexed_at:string|null
}
type TaskRow={id:string;project_id:string;source_task_no:string|null;task_name:string;area:string|null;category:string|null}
type ProjectRow={id:string;code:string;name:string}
type SmartPhoto=PhotoRow&{relation:'direct'|'similar'|'plot';similarity:number;sourceTask?:TaskRow}

const PHOTO_PAGE_SIZE=500
const FALLBACK_STRIDE=4
const FAMILY_GROUPS=[
  ['ฝ้า','เพดาน','ชายคา','ceiling'],['กระเบื้อง','tile'],['สี','paint','skim','ฉาบ'],
  ['ท่อ','ระบายน้ำ','ประปา','สุขาภิบาล','drain','plumbing'],['แอร์','ปรับอากาศ','fcu','ccu','aircon','air conditioning'],
  ['ราว','กันตก','railing'],['สระ','pool','บันไดลงสระ','สไลเดอร์'],
  ['ประตู','หน้าต่าง','อลูมิเนียม','กระจก','door','window','aluminium','glass'],['หลังคา','รางน้ำ','roof','gutter','vg'],
  ['ไฟฟ้า','electrical','electric'],['โครงสร้าง','คอนกรีต','เทพื้น','structure','concrete'],['steam','ห้อง steam'],
] as const

function norm(value:string|null|undefined){return String(value||'').toLowerCase().replace(/[._()\-–—/\\,:;]+/g,' ').replace(/\s+/g,' ').trim()}
function tokens(value:string|null|undefined){return new Set(norm(value).split(' ').filter(x=>x.length>1))}
function family(task:TaskRow){const text=norm(`${task.task_name} ${task.area||''} ${task.category||''}`);return FAMILY_GROUPS.findIndex(group=>group.some(k=>text.includes(norm(k))))}
function taskSimilarity(a:TaskRow,b:TaskRow){
  if(a.id===b.id)return 1
  const fa=family(a),fb=family(b);const sameFamily=fa>=0&&fa===fb;const sameArea=Boolean(a.area&&b.area&&norm(a.area)===norm(b.area));const sameCategory=Boolean(a.category&&b.category&&norm(a.category)===norm(b.category))
  const at=tokens(`${a.task_name} ${a.area||''}`),bt=tokens(`${b.task_name} ${b.area||''}`);const intersection=[...at].filter(x=>bt.has(x)).length;const union=new Set([...at,...bt]).size;const jaccard=union?intersection/union:0
  return (sameFamily?.55:0)+(sameArea?.2:0)+(sameCategory?.1:0)+(jaccard*.15)
}
function newest(a:PhotoRow,b:PhotoRow){return b.photo_date.localeCompare(a.photo_date)||String(b.indexed_at||'').localeCompare(String(a.indexed_at||''))||b.drive_file_id.localeCompare(a.drive_file_id)}
function rotateFrom<T>(rows:T[],offset:number){if(rows.length<2)return rows;const start=((offset%rows.length)+rows.length)%rows.length;return [...rows.slice(start),...rows.slice(0,start)]}
function uniquePush(target:SmartPhoto[],rows:SmartPhoto[],limit=4){for(const row of rows){if(target.length>=limit)break;if(!target.some(x=>x.drive_file_id===row.drive_file_id))target.push(row)}}
function dateLabel(value:string){const[y,m,d]=value.split('-');return y&&m&&d?`${d}/${m}/${Number(y)+543}`:value}
function phaseLabel(value:string|null){if(value==='before')return'ก่อนทำ';if(value==='after')return'หลังทำ';if(value==='during')return'ระหว่างทำ';return'รูปหน้างาน'}
function setText(el:Element|null,value:string){if(el&&el.textContent!==value)el.textContent=value}

async function loadAllPhotos(s:any){
  let rows:PhotoRow[]=[]
  for(let from=0;;from+=PHOTO_PAGE_SIZE){
    const result=await s.from('drive_photo_index').select('drive_file_id,drive_folder_id,project_id,schedule_task_id,file_name,photo_date,phase,verified_at,indexed_at').eq('is_active',true).order('photo_date',{ascending:false}).order('indexed_at',{ascending:false}).range(from,from+PHOTO_PAGE_SIZE-1)
    if(result.error)throw result.error
    const batch=(result.data||[]) as PhotoRow[];rows=rows.concat(batch);if(batch.length<PHOTO_PAGE_SIZE)break
  }
  return rows
}
function currentPhotoMode(){const selects=[...document.querySelectorAll<HTMLSelectElement>('.ep-filter select')];return selects.find(s=>[...s.options].some(o=>o.value==='before_after'))?.value||'latest'}
function currentPeriod(){const inputs=[...document.querySelectorAll<HTMLInputElement>('.ep-filter input[type="date"]')];return{start:inputs[0]?.value||'',end:inputs[1]?.value||''}}
function inPeriod(photo:PhotoRow,start:string,end:string){return(!start||photo.photo_date>=start)&&(!end||photo.photo_date<=end)}
function projectCodeFromSlide(slide:Element){const eyebrow=slide.querySelector('.ep-eyebrow')?.textContent||'';return eyebrow.split('•')[0]?.trim()||''}
function projectCodeFromCard(card:Element,projects:ProjectRow[]){const name=card.querySelector('.ep-cover-title b')?.textContent?.trim()||'';return projects.find(p=>p.name.trim()===name)?.code||''}
function directTaskForSlide(slide:Element,project:ProjectRow,tasks:TaskRow[]){
  const taskName=slide.querySelector('h2')?.textContent?.trim()||'';if(!taskName)return null
  const taskArea=(slide.querySelector('header p')?.textContent||'').split('•')[0]?.trim()||''
  const candidates=tasks.filter(t=>t.project_id===project.id&&norm(t.task_name)===norm(taskName));if(candidates.length<=1)return candidates[0]||null
  return candidates.find(t=>t.area&&norm(taskArea).includes(norm(t.area)))||candidates[0]
}
function projectTaskIndex(projectId:string,targetTask:TaskRow,tasks:TaskRow[]){
  const ordered=sortTasksByNumber(tasks.filter(t=>t.project_id===projectId&&t.source_task_no!=='1'))
  const index=ordered.findIndex(t=>t.id===targetTask.id)
  return Math.max(0,index)
}
function choosePhotos(project:ProjectRow,targetTask:TaskRow,photos:PhotoRow[],tasks:TaskRow[],taskById:Map<string,TaskRow>,start:string,end:string){
  const projectPhotos=photos.filter(p=>p.project_id===project.id&&inPeriod(p,start,end)).sort(newest)
  const direct=projectPhotos.filter(p=>p.schedule_task_id===targetTask.id).map(p=>({...p,relation:'direct' as const,similarity:1,sourceTask:targetTask}))
  const similar=projectPhotos.filter(p=>p.schedule_task_id&&p.schedule_task_id!==targetTask.id).map(p=>{const sourceTask=taskById.get(String(p.schedule_task_id));const similarity=sourceTask?taskSimilarity(targetTask,sourceTask):0;return{...p,relation:'similar' as const,similarity,sourceTask}}).filter(p=>p.similarity>=.38).sort((a,b)=>b.similarity-a.similarity||newest(a,b))

  const taskIndex=projectTaskIndex(project.id,targetTask,tasks)
  const fallbackOffset=taskIndex*FALLBACK_STRIDE
  const unmatchedBase=projectPhotos.filter(p=>!p.schedule_task_id).map(p=>({...p,relation:'plot' as const,similarity:0}))
  const unmatched=rotateFrom(unmatchedBase,fallbackOffset)
  const similarIds=new Set(similar.map(p=>p.drive_file_id))
  const otherMappedBase=projectPhotos.filter(p=>p.schedule_task_id&&p.schedule_task_id!==targetTask.id&&!similarIds.has(p.drive_file_id)).map(p=>({...p,relation:'plot' as const,similarity:0,sourceTask:taskById.get(String(p.schedule_task_id))}))
  const otherMapped=rotateFrom(otherMappedBase,fallbackOffset)

  const selected:SmartPhoto[]=[]
  uniquePush(selected,direct,4)
  uniquePush(selected,similar,4)
  uniquePush(selected,unmatched,4)
  uniquePush(selected,otherMapped,4)
  return{selected,taskIndex,unmatchedCount:unmatchedBase.length}
}
function relationText(photo:SmartPhoto){if(photo.relation==='direct')return photo.verified_at?'ตรง Task • Verified':'ตรง Task';if(photo.relation==='similar')return`งานใกล้เคียง • ${photo.sourceTask?.task_name||'Related task'}`;if(photo.sourceTask)return`Plot fallback • ${photo.sourceTask.task_name}`;return'Plot fallback • รูปภาพรวมที่ยังไม่ผูก Task'}

export default function ExecutiveSmartPhotoFallbackV2(){
  useEffect(()=>{
    let disposed=false,observer:MutationObserver|null=null,scheduled=false
    const setup=async()=>{
      const s=getSupabase()
      const[photos,taskResult,projectResult]=await Promise.all([loadAllPhotos(s),s.from('v_schedule_tasks').select('id,project_id,source_task_no,task_name,area,category'),s.from('projects').select('id,code,name').eq('active',true)])
      if(disposed)return;if(taskResult.error)throw taskResult.error;if(projectResult.error)throw projectResult.error
      const tasks=(taskResult.data||[]) as TaskRow[],projects=(projectResult.data||[]) as ProjectRow[]
      const taskById=new Map(tasks.map(t=>[t.id,t])),projectByCode=new Map(projects.map(p=>[p.code,p]))

      const applyCoverFreshness=()=>{
        const{start,end}=currentPeriod()
        document.querySelectorAll<HTMLElement>('.ep-overview .ep-card').forEach(card=>{
          const code=projectCodeFromCard(card,projects);if(!code||code.startsWith('CONDO-'))return;const project=projectByCode.get(code);if(!project)return
          const freshest=photos.filter(p=>p.project_id===project.id&&inPeriod(p,start,end)).sort(newest)[0];const img=card.querySelector<HTMLImageElement>('.ep-cover img');if(!freshest||!img)return
          const wanted=`/api/drive-photo?fileId=${encodeURIComponent(freshest.drive_file_id)}`
          if(img.dataset.smartCoverFile!==freshest.drive_file_id){img.src=wanted;img.alt=freshest.file_name;img.dataset.smartCoverFile=freshest.drive_file_id;if(freshest.drive_folder_id)img.dataset.photoFolderUrl=`https://drive.google.com/drive/folders/${freshest.drive_folder_id}`}
        })
      }

      const applySlide=()=>{
        if(currentPhotoMode()!=='latest')return
        const slide=document.querySelector<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide)');if(!slide)return
        const code=projectCodeFromSlide(slide),project=projectByCode.get(code);if(!project)return
        const targetTask=directTaskForSlide(slide,project,tasks);if(!targetTask)return
        const{start,end}=currentPeriod();const{selected,taskIndex,unmatchedCount}=choosePhotos(project,targetTask,photos,tasks,taskById,start,end);if(!selected.length)return

        let grid=slide.querySelector<HTMLElement>('.ep-photo-grid');const empty=slide.querySelector<HTMLElement>('.ep-photo-empty')
        if(!grid&&empty){grid=document.createElement('div');grid.className=`ep-photo-grid count-${selected.length} smart-photo-grid`;empty.replaceWith(grid)}
        if(!grid)return;grid.classList.add('smart-photo-grid')
        while(grid.children.length<selected.length){const figure=document.createElement('figure');figure.innerHTML='<img alt=""><figcaption><div><b></b><span></span></div><span></span></figcaption>';grid.appendChild(figure)}
        while(grid.children.length>selected.length)grid.lastElementChild?.remove()
        grid.classList.remove('count-1','count-2','count-3','count-4');grid.classList.add(`count-${selected.length}`)

        selected.forEach((photo,index)=>{
          const figure=grid!.children[index] as HTMLElement,img=figure.querySelector<HTMLImageElement>('img'),caption=figure.querySelector<HTMLElement>('figcaption');if(!img||!caption)return
          const wanted=`/api/drive-photo?fileId=${encodeURIComponent(photo.drive_file_id)}`
          if(img.dataset.smartPhotoFile!==photo.drive_file_id){img.src=wanted;img.alt=photo.file_name;img.dataset.smartPhotoFile=photo.drive_file_id}
          if(photo.drive_folder_id)img.dataset.photoFolderUrl=`https://drive.google.com/drive/folders/${photo.drive_folder_id}`
          img.title=photo.relation==='direct'?'รูปที่ผูกกับงานนี้':photo.relation==='similar'?'รูปจากงานใกล้เคียงใน Plot เดียวกัน':'รูป fallback ชุดอื่นตามลำดับ Task'
          setText(caption.querySelector('div b'),phaseLabel(photo.phase));setText(caption.querySelector('div span'),relationText(photo));setText(caption.querySelector(':scope > span:last-child'),dateLabel(photo.photo_date));figure.dataset.smartRelation=photo.relation
        })
        const latest=selected.reduce((v,p)=>!v||p.photo_date>v?p.photo_date:v,''),directCount=selected.filter(p=>p.relation==='direct').length,similarCount=selected.filter(p=>p.relation==='similar').length,plotCount=selected.filter(p=>p.relation==='plot').length
        setText(slide.querySelector('.ep-photo-head span'),`วันที่รูปล่าสุด: ${latest?dateLabel(latest):'-'} • ตรง Task ${directCount} • งานใกล้เคียง ${similarCount} • Plot fallback ${plotCount}`)
        const note=slide.querySelector<HTMLElement>('.ep-fallback-note')
        if(note){const cycle=unmatchedCount?Math.floor((taskIndex*FALLBACK_STRIDE)/unmatchedCount)+1:1;setText(note,similarCount||plotCount?`Smart fallback: งานนี้ใช้รูปงานใกล้เคียง ${similarCount} รูป + รูปภาพรวม Plot ${plotCount} รูป โดยจัด fallback ตามลำดับ Task เพื่อไม่วนรูปเดิมซ้ำทุกงาน${cycle>1?' • ชุดรูปเริ่มวนซ้ำเพราะจำนวนรูปไม่พอ':''}`:'รูปทั้งหมดตรงกับ Task นี้')}
      }

      const decorate=()=>{scheduled=false;applyCoverFreshness();applySlide()}
      const scheduleDecorate=()=>{if(scheduled||disposed)return;scheduled=true;window.requestAnimationFrame(decorate)}
      decorate()
      observer=new MutationObserver(scheduleDecorate);observer.observe(document.body,{childList:true,subtree:true,characterData:true})
      document.addEventListener('click',scheduleDecorate,true);document.addEventListener('change',scheduleDecorate,true);document.addEventListener('keyup',scheduleDecorate,true)
      return()=>{document.removeEventListener('click',scheduleDecorate,true);document.removeEventListener('change',scheduleDecorate,true);document.removeEventListener('keyup',scheduleDecorate,true)}
    }
    let cleanupEvents:(()=>void)|undefined
    setup().then(fn=>{cleanupEvents=fn}).catch(()=>{})
    return()=>{disposed=true;observer?.disconnect();cleanupEvents?.()}
  },[])
  return null
}
