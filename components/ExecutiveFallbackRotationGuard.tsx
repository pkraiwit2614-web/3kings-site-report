'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { sortTasksByNumber } from '@/lib/taskOrder'

type PhotoRow={id:string;drive_file_id:string;drive_folder_id:string|null;project_id:string;schedule_task_id:string|null;file_name:string;photo_date:string;phase:string|null;indexed_at:string|null}
type TaskRow={id:string;project_id:string;source_task_no:string|null;task_name:string;area:string|null}
type ProjectRow={id:string;code:string;name:string}
const PAGE=500
const STRIDE=4

function norm(v:string|null|undefined){return String(v||'').toLowerCase().replace(/[._()\-–—/\\,:;]+/g,' ').replace(/\s+/g,' ').trim()}
function newest(a:PhotoRow,b:PhotoRow){return b.photo_date.localeCompare(a.photo_date)||String(b.indexed_at||'').localeCompare(String(a.indexed_at||''))||b.id.localeCompare(a.id)}
function inPeriod(p:PhotoRow,start:string,end:string){return(!start||p.photo_date>=start)&&(!end||p.photo_date<=end)}
function period(){const x=[...document.querySelectorAll<HTMLInputElement>('.ep-filter input[type="date"]')];return{start:x[0]?.value||'',end:x[1]?.value||''}}
function mode(){const x=[...document.querySelectorAll<HTMLSelectElement>('.ep-filter select')];return x.find(s=>[...s.options].some(o=>o.value==='before_after'))?.value||'latest'}
function codeFromSlide(slide:Element){return(slide.querySelector('.ep-eyebrow')?.textContent||'').split('•')[0]?.trim()||''}
function taskFromSlide(slide:Element,project:ProjectRow,tasks:TaskRow[]){
  const name=slide.querySelector('h2')?.textContent?.trim()||'';if(!name)return null
  const area=(slide.querySelector('header p')?.textContent||'').split('•')[0]?.trim()||''
  const list=tasks.filter(t=>t.project_id===project.id&&norm(t.task_name)===norm(name));if(list.length<=1)return list[0]||null
  return list.find(t=>t.area&&norm(area).includes(norm(t.area)))||list[0]
}
function rotate<T>(rows:T[],offset:number){if(rows.length<2)return rows;const at=((offset%rows.length)+rows.length)%rows.length;return[...rows.slice(at),...rows.slice(0,at)]}
function setTextNode(el:Element|null,value:string){if(!el)return;const node=el.firstChild;if(node&&node.nodeType===Node.TEXT_NODE){if(node.nodeValue!==value)node.nodeValue=value}else if(el.textContent!==value)el.textContent=value}
async function allPhotos(s:any){let rows:PhotoRow[]=[];for(let from=0;;from+=PAGE){const r=await s.from('drive_photo_index').select('id,drive_file_id,drive_folder_id,project_id,schedule_task_id,file_name,photo_date,phase,indexed_at').eq('is_active',true).order('photo_date',{ascending:false}).order('indexed_at',{ascending:false}).range(from,from+PAGE-1);if(r.error)throw r.error;const b=(r.data||[]) as PhotoRow[];rows=rows.concat(b);if(b.length<PAGE)break}return rows}
function phaseLabel(v:string|null){if(v==='before')return'ก่อนทำ';if(v==='after')return'หลังทำ';if(v==='during')return'ระหว่างทำ';return'รูปหน้างาน'}
function dateLabel(value:string){const[y,m,d]=value.split('-');return y&&m&&d?`${d}/${m}/${Number(y)+543}`:value}

export default function ExecutiveFallbackRotationGuard(){
  useEffect(()=>{
    let dead=false,observer:MutationObserver|null=null,scheduled=false
    const run=async()=>{
      const s=getSupabase()
      const[photos,tr,pr]=await Promise.all([allPhotos(s),s.from('v_schedule_tasks').select('id,project_id,source_task_no,task_name,area'),s.from('projects').select('id,code,name').eq('active',true)])
      if(dead||tr.error||pr.error)return
      const tasks=(tr.data||[]) as TaskRow[],projects=(pr.data||[]) as ProjectRow[]
      const projectByCode=new Map(projects.map(p=>[p.code,p])),photoById=new Map(photos.map(p=>[p.id,p]))

      const apply=()=>{
        scheduled=false
        if(mode()!=='latest')return
        const slide=document.querySelector<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide)');if(!slide)return
        const project=projectByCode.get(codeFromSlide(slide));if(!project)return
        const task=taskFromSlide(slide,project,tasks);if(!task)return
        const ordered=sortTasksByNumber(tasks.filter(t=>t.project_id===project.id&&t.source_task_no!=='1'))
        const taskIndex=Math.max(0,ordered.findIndex(t=>t.id===task.id))
        const{start,end}=period()
        const pool=photos.filter(p=>p.project_id===project.id&&!p.schedule_task_id&&inPeriod(p,start,end)).sort(newest)
        if(!pool.length)return
        const rotated=rotate(pool,taskIndex*STRIDE)
        const figures=[...slide.querySelectorAll<HTMLElement>('.ep-photo-grid figure')]
        const shown=new Set<string>()
        for(const figure of figures){const current=photoById.get(figure.dataset.photoId||'');if(current?.schedule_task_id)shown.add(current.id)}
        let cursor=0,fallbackSlot=0
        for(const figure of figures){
          const current=photoById.get(figure.dataset.photoId||'')
          const label=figure.querySelector('figcaption div b')?.textContent||''
          const userApproved=label.includes('ยืนยันโดยผู้ใช้')
          if(!current||current.schedule_task_id||userApproved)continue
          let replacement:PhotoRow|undefined
          while(cursor<rotated.length){const candidate=rotated[cursor++];if(!shown.has(candidate.id)){replacement=candidate;break}}
          if(!replacement){replacement=rotated[fallbackSlot%rotated.length]}
          fallbackSlot++
          if(!replacement)continue
          shown.add(replacement.id)
          const img=figure.querySelector<HTMLImageElement>('img');if(!img)continue
          const wanted=`/api/drive-photo?fileId=${encodeURIComponent(replacement.drive_file_id)}`
          if(img.dataset.fallbackGuardFile!==replacement.drive_file_id){img.src=wanted;img.alt=replacement.file_name;img.dataset.aiPhotoFile=replacement.drive_file_id;img.dataset.fallbackGuardFile=replacement.drive_file_id}
          figure.dataset.photoId=replacement.id
          if(replacement.drive_folder_id)img.dataset.photoFolderUrl=`https://drive.google.com/drive/folders/${replacement.drive_folder_id}`
          setTextNode(figure.querySelector('figcaption div b'),`${phaseLabel(replacement.phase)} • Plot fallback`)
          setTextNode(figure.querySelector('figcaption div span'),'รูปภาพรวมที่ยังไม่ผูก Task • หมุนชุดตามลำดับงาน')
          setTextNode(figure.querySelector('figcaption > span:last-child'),dateLabel(replacement.photo_date))
        }
      }
      const schedule=()=>{if(dead||scheduled)return;scheduled=true;requestAnimationFrame(()=>requestAnimationFrame(apply))}
      apply()
      observer=new MutationObserver(schedule)
      observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['src','data-photo-id','data-ai-photo-file']})
      document.addEventListener('click',schedule,true);document.addEventListener('change',schedule,true);document.addEventListener('keyup',schedule,true)
      return()=>{document.removeEventListener('click',schedule,true);document.removeEventListener('change',schedule,true);document.removeEventListener('keyup',schedule,true)}
    }
    let cleanup:(()=>void)|undefined
    run().then(fn=>{cleanup=fn}).catch(()=>{})
    return()=>{dead=true;observer?.disconnect();cleanup?.()}
  },[])
  return null
}
