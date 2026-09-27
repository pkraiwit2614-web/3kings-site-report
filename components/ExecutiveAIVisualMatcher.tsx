'use client'

import { useEffect,useRef,useState } from 'react'
import { getSupabase } from '@/lib/supabase'

type PhotoRow={
  id:string;drive_file_id:string;drive_folder_id:string|null;project_id:string;schedule_task_id:string|null;file_name:string;
  photo_date:string;phase:string|null;verified_at:string|null;indexed_at:string|null
}
type TaskRow={id:string;project_id:string;source_task_no:string|null;task_name:string;area:string|null;category:string|null}
type ProjectRow={id:string;code:string;name:string}
type FeedbackRow={photo_id:string;task_id:string;status:'approved'|'rejected';note:string|null;reviewed_at:string}
type AIScore={photo_id:string;score:number;detected_work:string|null;reason:string|null;model:string;analyzed_at:string}
type Relation='approved'|'direct'|'similar'|'plot'
type Candidate=PhotoRow&{relation:Relation;similarity:number;sourceTask?:TaskRow;ai?:AIScore}
type EditorState={
  photo:PhotoRow;targetTask:TaskRow;project:ProjectRow;tasks:TaskRow[];alternatives:Candidate[];ai:AIScore|null
}
type EditorActions={
  approve:(photoId:string,taskId:string,note?:string)=>Promise<void>
  reject:(photoId:string,taskId:string,note?:string)=>Promise<void>
  replace:(oldPhotoId:string,newPhotoId:string,taskId:string)=>Promise<void>
  remap:(photoId:string,currentTaskId:string,newTaskId:string,note?:string)=>Promise<void>
}

const PHOTO_PAGE_SIZE=500
const AI_CANDIDATES=8
const FAMILY_GROUPS=[
  ['ฝ้า','เพดาน','ชายคา','ceiling'],['กระเบื้อง','tile'],['สี','paint','skim','ฉาบ'],
  ['ท่อ','ระบายน้ำ','ประปา','สุขาภิบาล','drain','plumbing'],['แอร์','ปรับอากาศ','fcu','ccu','aircon','air conditioning'],
  ['ราว','กันตก','railing'],['สระ','pool','บันไดลงสระ','สไลเดอร์'],['ประตู','หน้าต่าง','อลูมิเนียม','กระจก','door','window','aluminium','glass'],
  ['หลังคา','รางน้ำ','roof','gutter','vg'],['ไฟฟ้า','electrical','electric'],['โครงสร้าง','คอนกรีต','เทพื้น','structure','concrete'],['steam','ห้อง steam'],
] as const

function norm(value:string|null|undefined){return String(value||'').toLowerCase().replace(/[._()\-–—/\\,:;]+/g,' ').replace(/\s+/g,' ').trim()}
function tokens(value:string|null|undefined){return new Set(norm(value).split(' ').filter(x=>x.length>1))}
function family(task:TaskRow){const text=norm(`${task.task_name} ${task.area||''} ${task.category||''}`);return FAMILY_GROUPS.findIndex(group=>group.some(k=>text.includes(norm(k))))}
function taskSimilarity(a:TaskRow,b:TaskRow){
  if(a.id===b.id)return 1
  const fa=family(a),fb=family(b);const sameFamily=fa>=0&&fa===fb
  const sameArea=Boolean(a.area&&b.area&&norm(a.area)===norm(b.area));const sameCategory=Boolean(a.category&&b.category&&norm(a.category)===norm(b.category))
  const at=tokens(`${a.task_name} ${a.area||''}`),bt=tokens(`${b.task_name} ${b.area||''}`);const intersection=[...at].filter(x=>bt.has(x)).length;const union=new Set([...at,...bt]).size
  return (sameFamily?.55:0)+(sameArea?.2:0)+(sameCategory?.1:0)+((union?intersection/union:0)*.15)
}
function newest(a:PhotoRow,b:PhotoRow){return b.photo_date.localeCompare(a.photo_date)||String(b.indexed_at||'').localeCompare(String(a.indexed_at||''))||b.id.localeCompare(a.id)}
function hash(value:string){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rotateRecent<T>(rows:T[],seed:string,windowSize=12){const head=rows.slice(0,windowSize),tail=rows.slice(windowSize);if(head.length<2)return rows;const offset=hash(seed)%head.length;return [...head.slice(offset),...head.slice(0,offset),...tail]}
function dateLabel(value:string){const [y,m,d]=value.split('-');return y&&m&&d?`${d}/${m}/${Number(y)+543}`:value}
function phaseLabel(value:string|null){if(value==='before')return 'ก่อนทำ';if(value==='after')return 'หลังทำ';if(value==='during')return 'ระหว่างทำ';return 'รูปหน้างาน'}
function pairKey(photoId:string,taskId:string){return `${photoId}|${taskId}`}
function setText(el:Element|null,value:string){if(el&&el.textContent!==value)el.textContent=value}
function inPeriod(photo:PhotoRow,start:string,end:string){return (!start||photo.photo_date>=start)&&(!end||photo.photo_date<=end)}
function currentPhotoMode(){const selects=[...document.querySelectorAll<HTMLSelectElement>('.ep-filter select')];return selects.find(s=>[...s.options].some(o=>o.value==='before_after'))?.value||'latest'}
function currentPeriod(){const inputs=[...document.querySelectorAll<HTMLInputElement>('.ep-filter input[type="date"]')];return {start:inputs[0]?.value||'',end:inputs[1]?.value||''}}
function projectCodeFromSlide(slide:Element){return (slide.querySelector('.ep-eyebrow')?.textContent||'').split('•')[0]?.trim()||''}
function projectCodeFromCard(card:Element,projects:ProjectRow[]){const name=card.querySelector('.ep-cover-title b')?.textContent?.trim()||'';return projects.find(p=>p.name.trim()===name)?.code||''}
function fileIdFromImage(img:HTMLImageElement){try{const u=new URL(img.src,window.location.origin);return u.pathname==='/api/drive-photo'?u.searchParams.get('fileId')||'':''}catch{return ''}}
function directTaskForSlide(slide:Element,project:ProjectRow,tasks:TaskRow[]){
  const taskName=slide.querySelector('h2')?.textContent?.trim()||'';if(!taskName)return null
  const taskArea=(slide.querySelector('header p')?.textContent||'').split('•')[0]?.trim()||''
  const candidates=tasks.filter(t=>t.project_id===project.id&&norm(t.task_name)===norm(taskName));if(candidates.length<=1)return candidates[0]||null
  return candidates.find(t=>t.area&&norm(taskArea).includes(norm(t.area)))||candidates[0]
}
async function loadAllPhotos(s:any){
  let rows:PhotoRow[]=[]
  for(let from=0;;from+=PHOTO_PAGE_SIZE){
    const result=await s.from('drive_photo_index').select('id,drive_file_id,drive_folder_id,project_id,schedule_task_id,file_name,photo_date,phase,verified_at,indexed_at').eq('is_active',true).order('photo_date',{ascending:false}).order('indexed_at',{ascending:false}).range(from,from+PHOTO_PAGE_SIZE-1)
    if(result.error)throw result.error;const batch=(result.data||[]) as PhotoRow[];rows=rows.concat(batch);if(batch.length<PHOTO_PAGE_SIZE)break
  }
  return rows
}
function pushUnique(target:Candidate[],rows:Candidate[],limit:number){for(const row of rows){if(target.length>=limit)break;if(!target.some(x=>x.id===row.id))target.push(row)}}

function buildCandidates(project:ProjectRow,target:TaskRow,photos:PhotoRow[],taskById:Map<string,TaskRow>,feedback:Map<string,FeedbackRow>,start:string,end:string){
  const projectPhotos=photos.filter(p=>p.project_id===project.id&&inPeriod(p,start,end)).sort(newest)
  const rejected=new Set(projectPhotos.filter(p=>feedback.get(pairKey(p.id,target.id))?.status==='rejected').map(p=>p.id))
  const approved=projectPhotos.filter(p=>feedback.get(pairKey(p.id,target.id))?.status==='approved').map(p=>({...p,relation:'approved' as const,similarity:1,sourceTask:target}))
  const direct=projectPhotos.filter(p=>!rejected.has(p.id)&&p.schedule_task_id===target.id&&!approved.some(a=>a.id===p.id)).map(p=>({...p,relation:'direct' as const,similarity:1,sourceTask:target}))
  const similar=projectPhotos.filter(p=>!rejected.has(p.id)&&p.schedule_task_id&&p.schedule_task_id!==target.id&&!approved.some(a=>a.id===p.id)).map(p=>{const sourceTask=taskById.get(String(p.schedule_task_id));const similarity=sourceTask?taskSimilarity(target,sourceTask):0;return {...p,relation:'similar' as const,similarity,sourceTask}}).filter(p=>p.similarity>=.38).sort((a,b)=>b.similarity-a.similarity||newest(a,b))
  const unmatched=rotateRecent(projectPhotos.filter(p=>!rejected.has(p.id)&&!p.schedule_task_id&&!approved.some(a=>a.id===p.id)).map(p=>({...p,relation:'plot' as const,similarity:0})),`${target.id}:unmatched`)
  const other=rotateRecent(projectPhotos.filter(p=>!rejected.has(p.id)&&p.schedule_task_id&&p.schedule_task_id!==target.id&&!approved.some(a=>a.id===p.id)&&!similar.some(s=>s.id===p.id)).map(p=>({...p,relation:'plot' as const,similarity:0,sourceTask:taskById.get(String(p.schedule_task_id))})),`${target.id}:mapped`)
  const pool:Candidate[]=[];pushUnique(pool,approved,AI_CANDIDATES);pushUnique(pool,direct,AI_CANDIDATES);pushUnique(pool,similar,AI_CANDIDATES);pushUnique(pool,unmatched,AI_CANDIDATES);pushUnique(pool,other,AI_CANDIDATES)
  return {approved,direct,pool,rejected}
}
function aiRank(candidate:Candidate,maxDate:string){
  if(candidate.relation==='approved')return 1000
  const score=Number(candidate.ai?.score||0)
  const days=Math.max(0,Math.round((new Date(`${maxDate}T00:00:00Z`).getTime()-new Date(`${candidate.photo_date}T00:00:00Z`).getTime())/86400000))
  const recency=Math.max(0,8-Math.min(8,days))
  const directBonus=candidate.relation==='direct'?4:0
  return score+recency+directBonus
}
function finalSelection(candidates:Candidate[],scores:Map<string,AIScore>){
  const withAI=candidates.map(c=>({...c,ai:scores.get(c.id)}));const maxDate=withAI.reduce((m,p)=>!m||p.photo_date>m?p.photo_date:m,'')
  const approved=withAI.filter(x=>x.relation==='approved').sort(newest)
  const scored=withAI.filter(x=>x.relation!=='approved'&&x.ai&&Number(x.ai.score)>=40).sort((a,b)=>aiRank(b,maxDate)-aiRank(a,maxDate)||newest(a,b))
  const fallback=withAI.filter(x=>x.relation!=='approved'&&!scored.some(s=>s.id===x.id)).sort((a,b)=>a.relation===b.relation?newest(a,b):(a.relation==='direct'?-1:b.relation==='direct'?1:a.relation==='similar'?-1:1))
  const result:Candidate[]=[];pushUnique(result,approved,4);pushUnique(result,scored,4);if(!scores.size)pushUnique(result,fallback,4)
  return result.slice(0,4)
}
function relationLabel(photo:Candidate){if(photo.relation==='approved')return 'ยืนยันโดยผู้ใช้';if(photo.ai)return `AI Match ${Math.round(Number(photo.ai.score))}%`;if(photo.relation==='direct')return 'ตรง Task';if(photo.relation==='similar')return 'งานใกล้เคียง';return 'Plot fallback'}
function relationDetail(photo:Candidate){if(photo.ai?.detected_work)return photo.ai.detected_work;if(photo.sourceTask&&photo.relation!=='direct'&&photo.relation!=='approved')return photo.sourceTask.task_name;return photo.file_name}

export default function ExecutiveAIVisualMatcher(){
  const [editor,setEditor]=useState<EditorState|null>(null)
  const [editorTask,setEditorTask]=useState('')
  const [editorNote,setEditorNote]=useState('')
  const [editorSaving,setEditorSaving]=useState(false)
  const [editorMessage,setEditorMessage]=useState('')
  const actionsRef=useRef<EditorActions|null>(null)

  useEffect(()=>{
    let disposed=false,observer:MutationObserver|null=null,scheduled=false
    const s=getSupabase();const aiCache=new Map<string,Map<string,AIScore>>();const aiPending=new Set<string>()
    let cleanupEvents:(()=>void)|undefined

    const setup=async()=>{
      const [photos,taskResult,projectResult,feedbackResult,authResult]=await Promise.all([
        loadAllPhotos(s),s.from('v_schedule_tasks').select('id,project_id,source_task_no,task_name,area,category'),s.from('projects').select('id,code,name').eq('active',true),s.from('photo_task_feedback').select('photo_id,task_id,status,note,reviewed_at'),s.auth.getUser(),
      ])
      if(disposed)return
      if(taskResult.error)throw taskResult.error;if(projectResult.error)throw projectResult.error
      const tasks=(taskResult.data||[]) as TaskRow[],projects=(projectResult.data||[]) as ProjectRow[]
      const user=authResult.data.user;let role=''
      if(user){const {data:profile}=await s.from('profiles').select('role').eq('user_id',user.id).maybeSingle();role=profile?.role||''}
      const editable=Boolean(user&&['manager','engineer'].includes(role))
      const taskById=new Map(tasks.map(t=>[t.id,t])),projectByCode=new Map(projects.map(p=>[p.code,p])),photoById=new Map(photos.map(p=>[p.id,p])),photoByFile=new Map(photos.map(p=>[p.drive_file_id,p]))
      const feedback=new Map<string,FeedbackRow>(((feedbackResult.data||[]) as FeedbackRow[]).map(f=>[pairKey(f.photo_id,f.task_id),f]))

      const saveFeedback=async(photoId:string,taskId:string,status:'approved'|'rejected',note='')=>{
        if(!editable||!user)throw new Error('บัญชีนี้ไม่มีสิทธิ์แก้ไข Photo Mapping')
        const now=new Date().toISOString();const row={photo_id:photoId,task_id:taskId,status,note:note.trim()||null,reviewed_by:user.id,reviewed_at:now,updated_at:now}
        const {error}=await s.from('photo_task_feedback').upsert(row,{onConflict:'photo_id,task_id'});if(error)throw error
        feedback.set(pairKey(photoId,taskId),{photo_id:photoId,task_id:taskId,status,note:row.note,reviewed_at:now});scheduleDecorate()
      }
      const approve=async(photoId:string,taskId:string,note='')=>saveFeedback(photoId,taskId,'approved',note)
      const reject=async(photoId:string,taskId:string,note='')=>saveFeedback(photoId,taskId,'rejected',note)
      const replace=async(oldPhotoId:string,newPhotoId:string,taskId:string)=>{await reject(oldPhotoId,taskId,'แทนที่ระหว่าง Executive Presentation');await approve(newPhotoId,taskId,'เลือกแทนระหว่าง Executive Presentation')}
      const remap=async(photoId:string,currentTaskId:string,newTaskId:string,note='')=>{
        if(!editable||!user)throw new Error('บัญชีนี้ไม่มีสิทธิ์แก้ไข Photo Mapping')
        const photo=photoById.get(photoId),newTask=taskById.get(newTaskId);if(!photo||!newTask||newTask.project_id!==photo.project_id)throw new Error('Task ที่เลือกไม่ตรงกับ Plot ของรูป')
        const now=new Date().toISOString();const {error}=await s.from('drive_photo_index').update({schedule_task_id:newTaskId,match_method:'manual',match_score:1,verified_by:user.id,verified_at:now,mapping_note:note.trim()||'แก้จาก Executive Presentation',updated_at:now}).eq('id',photoId);if(error)throw error
        photo.schedule_task_id=newTaskId;photo.verified_at=now
        if(newTaskId===currentTaskId)await approve(photoId,currentTaskId,note||'ยืนยัน Mapping หลักจาก Executive Presentation');else await reject(photoId,currentTaskId,note||`Mapping หลักแก้เป็น ${newTask.task_name}`)
        scheduleDecorate()
      }
      actionsRef.current={approve,reject,replace,remap}

      const requestAI=async(project:ProjectRow,target:TaskRow,candidates:Candidate[])=>{
        if(!editable||!user)return
        const ids=candidates.filter(x=>x.relation!=='approved').slice(0,AI_CANDIDATES).map(x=>x.id);if(!ids.length)return
        const signature=`${target.id}|${ids.join(',')}`;if(aiPending.has(signature))return
        const existing=aiCache.get(target.id);if(existing&&ids.every(id=>existing.has(id)))return
        aiPending.add(signature);scheduleDecorate()
        try{
          const {data:{session}}=await s.auth.getSession();if(!session?.access_token)throw new Error('auth_session_missing')
          const response=await fetch('/api/ai/visual-match',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${session.access_token}`},body:JSON.stringify({taskId:target.id,candidates:ids.map(photoId=>({photoId}))})})
          const json=await response.json().catch(()=>null) as any;if(!response.ok||!json?.ok)throw new Error(json?.error||`AI ${response.status}`)
          const map=aiCache.get(target.id)||new Map<string,AIScore>();for(const row of (json.results||[]) as AIScore[])map.set(row.photo_id,row);aiCache.set(target.id,map)
        }catch(error){console.warn('AI visual match unavailable',error)}finally{aiPending.delete(signature);scheduleDecorate()}
      }

      const applyCoverFreshness=()=>{
        const {start,end}=currentPeriod();document.querySelectorAll<HTMLElement>('.ep-overview .ep-card').forEach(card=>{
          const code=projectCodeFromCard(card,projects);if(!code||code.startsWith('CONDO-'))return;const project=projectByCode.get(code);if(!project)return
          const freshest=photos.filter(p=>p.project_id===project.id&&inPeriod(p,start,end)).sort(newest)[0],img=card.querySelector<HTMLImageElement>('.ep-cover img');if(!freshest||!img)return
          if(img.dataset.aiCoverFile!==freshest.drive_file_id){img.src=`/api/drive-photo?fileId=${encodeURIComponent(freshest.drive_file_id)}`;img.alt=freshest.file_name;img.dataset.aiCoverFile=freshest.drive_file_id;if(freshest.drive_folder_id)img.dataset.photoFolderUrl=`https://drive.google.com/drive/folders/${freshest.drive_folder_id}`}
        })
      }

      const decorateFigure=(figure:HTMLElement,photo:Candidate,target:TaskRow,project:ProjectRow,alternatives:Candidate[])=>{
        figure.dataset.photoId=photo.id;figure.dataset.taskId=target.id;figure.dataset.projectId=project.id;figure.style.position='relative'
        let controls=figure.querySelector<HTMLElement>('.ai-photo-controls')
        if(!controls){controls=document.createElement('div');controls.className='ai-photo-controls';figure.appendChild(controls)}
        if(editable){
          controls.innerHTML=`<button type="button" data-ai-action="approve" title="ยืนยันว่าใช้กับงานนี้">✓ ใช้</button><button type="button" data-ai-action="edit" title="แก้รูปหรือ Mapping">✎ แก้</button><button type="button" data-ai-action="reject" title="รูปนี้ไม่ตรงกับงานนี้">✕ ไม่ตรง</button>`
        }else controls.innerHTML='<span>AI Visual</span>'
        controls.dataset.alternatives=alternatives.map(x=>x.id).join(',')
      }

      const applyBeforeAfterControls=()=>{
        const slide=document.querySelector<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide)');if(!slide)return
        const code=projectCodeFromSlide(slide),project=projectByCode.get(code);if(!project)return;const target=directTaskForSlide(slide,project,tasks);if(!target)return
        slide.querySelectorAll<HTMLElement>('.ep-photo-grid figure').forEach(figure=>{const img=figure.querySelector<HTMLImageElement>('img');if(!img)return;const photo=photoByFile.get(fileIdFromImage(img));if(!photo)return;decorateFigure(figure,{...photo,relation:photo.schedule_task_id===target.id?'direct':'plot',similarity:0},target,project,[])})
      }

      const applySlide=()=>{
        if(currentPhotoMode()!=='latest'){applyBeforeAfterControls();return}
        const slide=document.querySelector<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide)');if(!slide)return
        const code=projectCodeFromSlide(slide),project=projectByCode.get(code);if(!project)return;const target=directTaskForSlide(slide,project,tasks);if(!target)return
        const {start,end}=currentPeriod(),built=buildCandidates(project,target,photos,taskById,feedback,start,end),scoreMap=aiCache.get(target.id)||new Map<string,AIScore>()
        const selection=finalSelection(built.pool,scoreMap);const aiCandidates=built.pool.filter(x=>x.relation!=='approved').slice(0,AI_CANDIDATES)
        void requestAI(project,target,aiCandidates)
        let grid=slide.querySelector<HTMLElement>('.ep-photo-grid'),empty=slide.querySelector<HTMLElement>('.ep-photo-empty')
        if(!selection.length){if(grid)grid.innerHTML='';if(empty)setText(empty.querySelector('b'),'AI ยังไม่พบรูปที่เกี่ยวข้องเพียงพอ');return}
        if(!grid&&empty){grid=document.createElement('div');grid.className='ep-photo-grid';empty.replaceWith(grid)}if(!grid)return
        while(grid.children.length<selection.length){const f=document.createElement('figure');f.innerHTML='<img alt=""><figcaption><div><b></b><span></span></div><span></span></figcaption>';grid.appendChild(f)}while(grid.children.length>selection.length)grid.lastElementChild?.remove()
        grid.classList.remove('count-1','count-2','count-3','count-4');grid.classList.add(`count-${selection.length}`,'ai-visual-grid')
        const alternatives=built.pool.map(c=>({...c,ai:scoreMap.get(c.id)})).filter(x=>!selection.some(s=>s.id===x.id)).sort((a,b)=>Number(b.ai?.score||0)-Number(a.ai?.score||0)||newest(a,b)).slice(0,6)
        selection.forEach((raw,index)=>{
          const photo={...raw,ai:scoreMap.get(raw.id)},figure=grid!.children[index] as HTMLElement,img=figure.querySelector<HTMLImageElement>('img'),caption=figure.querySelector<HTMLElement>('figcaption');if(!img||!caption)return
          if(img.dataset.aiPhotoFile!==photo.drive_file_id){img.src=`/api/drive-photo?fileId=${encodeURIComponent(photo.drive_file_id)}`;img.alt=photo.file_name;img.dataset.aiPhotoFile=photo.drive_file_id}
          if(photo.drive_folder_id)img.dataset.photoFolderUrl=`https://drive.google.com/drive/folders/${photo.drive_folder_id}`
          setText(caption.querySelector('div b'),`${phaseLabel(photo.phase)} • ${relationLabel(photo)}`);setText(caption.querySelector('div span'),relationDetail(photo));setText(caption.querySelector(':scope > span:last-child'),dateLabel(photo.photo_date));decorateFigure(figure,photo,target,project,alternatives)
        })
        let status=slide.querySelector<HTMLElement>('.ai-visual-status');if(!status){status=document.createElement('div');status.className='ai-visual-status';slide.querySelector('.ep-photo-head')?.insertAdjacentElement('afterend',status)}
        const pending=[...aiPending].some(k=>k.startsWith(`${target.id}|`));const approvedCount=selection.filter(x=>x.relation==='approved').length;const scoredCount=selection.filter(x=>scoreMap.has(x.id)).length
        setText(status,pending?'AI กำลังดูรูปและประเมิน Visual Similarity…':`AI Visual Match • ${scoredCount}/${selection.length} รูปมีคะแนน AI${approvedCount?` • ผู้ใช้ยืนยัน ${approvedCount} รูป`:''} • กด “แก้” ได้ระหว่างพรีเซนต์`)
      }

      const decorate=()=>{scheduled=false;applyCoverFreshness();applySlide()}
      function scheduleDecorate(){if(scheduled||disposed)return;scheduled=true;requestAnimationFrame(decorate)}

      const clickHandler=(event:MouseEvent)=>{
        const button=(event.target as Element|null)?.closest<HTMLButtonElement>('[data-ai-action]');if(!button)return
        const figure=button.closest<HTMLElement>('figure[data-photo-id][data-task-id]');if(!figure)return
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation()
        const photoId=figure.dataset.photoId||'',taskId=figure.dataset.taskId||'',photo=photoById.get(photoId),target=taskById.get(taskId),project=photo?projects.find(p=>p.id===photo.project_id):undefined;if(!photo||!target||!project)return
        const action=button.dataset.aiAction
        if(action==='approve'){button.disabled=true;approve(photoId,taskId,'ยืนยันระหว่าง Executive Presentation').catch(err=>alert(`บันทึกไม่สำเร็จ: ${err instanceof Error?err.message:'unknown'}`)).finally(()=>{button.disabled=false})}
        if(action==='reject'){button.disabled=true;reject(photoId,taskId,'ไม่ตรงงาน — แก้ระหว่าง Executive Presentation').catch(err=>alert(`บันทึกไม่สำเร็จ: ${err instanceof Error?err.message:'unknown'}`)).finally(()=>{button.disabled=false})}
        if(action==='edit'){
          const score=aiCache.get(taskId)?.get(photoId)||null;const {start,end}=currentPeriod();const built=buildCandidates(project,target,photos,taskById,feedback,start,end),scores=aiCache.get(taskId)||new Map<string,AIScore>()
          const alternatives=built.pool.map(c=>({...c,ai:scores.get(c.id)})).filter(x=>x.id!==photoId&&feedback.get(pairKey(x.id,taskId))?.status!=='rejected').sort((a,b)=>Number(b.ai?.score||0)-Number(a.ai?.score||0)||newest(a,b)).slice(0,6)
          setEditor({photo,targetTask:target,project,tasks:tasks.filter(t=>t.project_id===project.id&&t.source_task_no!=='1'),alternatives,ai:score});setEditorTask(photo.schedule_task_id||target.id);setEditorNote('');setEditorMessage('')
        }
      }

      decorate();observer=new MutationObserver(scheduleDecorate);observer.observe(document.body,{childList:true,subtree:true});document.addEventListener('click',clickHandler,true);document.addEventListener('change',scheduleDecorate,true)
      cleanupEvents=()=>{document.removeEventListener('click',clickHandler,true);document.removeEventListener('change',scheduleDecorate,true)}
    }

    setup().catch(err=>console.warn('Executive AI Visual Matcher setup failed',err))
    return()=>{disposed=true;observer?.disconnect();cleanupEvents?.();actionsRef.current=null}
  },[])

  const runEditor=async(action:'approve'|'reject'|'remap',alternativePhotoId?:string)=>{
    if(!editor||!actionsRef.current)return;setEditorSaving(true);setEditorMessage('')
    try{
      if(action==='approve')await actionsRef.current.approve(editor.photo.id,editor.targetTask.id,editorNote||'ยืนยันจากหน้าพรีเซนต์')
      if(action==='reject')await actionsRef.current.reject(editor.photo.id,editor.targetTask.id,editorNote||'ไม่ตรงงานจากหน้าพรีเซนต์')
      if(action==='remap')await actionsRef.current.remap(editor.photo.id,editor.targetTask.id,editorTask,editorNote)
      if(alternativePhotoId)await actionsRef.current.replace(editor.photo.id,alternativePhotoId,editor.targetTask.id)
      setEditor(null)
    }catch(error){setEditorMessage(error instanceof Error?error.message:'บันทึกไม่สำเร็จ')}finally{setEditorSaving(false)}
  }

  return <>
    {editor&&<div className="ai-editor-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!editorSaving)setEditor(null)}}>
      <section className="ai-editor-modal" role="dialog" aria-modal="true" aria-label="แก้รูป Executive Presentation">
        <header><div><span>LIVE PHOTO CORRECTION</span><h3>{editor.targetTask.task_name}</h3><p>{editor.project.code} • {editor.targetTask.area||'-'}</p></div><button className="button" disabled={editorSaving} onClick={()=>setEditor(null)}>ปิด</button></header>
        <div className="ai-editor-body">
          <div className="ai-editor-current">
            <img src={`/api/drive-photo?fileId=${encodeURIComponent(editor.photo.drive_file_id)}&size=1200`} alt={editor.photo.file_name}/>
            <div className="ai-editor-ai"><b>{editor.ai?`AI Match ${Math.round(Number(editor.ai.score))}%`:'ยังไม่มีคะแนน AI'}</b><span>{editor.ai?.detected_work||editor.photo.file_name}</span>{editor.ai?.reason&&<small>{editor.ai.reason}</small>}</div>
            <div className="ai-editor-buttons"><button className="button primary" disabled={editorSaving} onClick={()=>runEditor('approve')}>✓ ใช้รูปนี้กับงานนี้</button><button className="button" disabled={editorSaving} onClick={()=>runEditor('reject')}>✕ ไม่ตรงงานนี้</button></div>
          </div>
          <div className="ai-editor-options">
            <label>ถ้ารูปนี้จริง ๆ เป็นงานอื่น ให้แก้ Mapping หลัก
              <select value={editorTask} disabled={editorSaving} onChange={e=>setEditorTask(e.target.value)}>{editor.tasks.map(t=><option key={t.id} value={t.id}>{t.source_task_no||'-'}. {t.task_name}{t.area?` — ${t.area}`:''}</option>)}</select>
            </label>
            <label>หมายเหตุ<input value={editorNote} disabled={editorSaving} onChange={e=>setEditorNote(e.target.value)} placeholder="เช่น รูปนี้เป็นงานฝ้าชั้น 2 ไม่ใช่งานสี"/></label>
            <button className="button" disabled={editorSaving||!editorTask} onClick={()=>runEditor('remap')}>บันทึก Mapping หลักใหม่</button>
            <div className="ai-alt-head"><b>เลือกรูปอื่นแทนได้ทันที</b><span>เรียงจาก AI Visual Match / ความใหม่</span></div>
            <div className="ai-alt-grid">{editor.alternatives.map(alt=><button key={alt.id} disabled={editorSaving} onClick={()=>runEditor('approve',alt.id)}><img src={`/api/drive-photo?fileId=${encodeURIComponent(alt.drive_file_id)}&size=480`} alt={alt.file_name}/><span>{alt.ai?`AI ${Math.round(Number(alt.ai.score))}%`:'Fallback'} • {dateLabel(alt.photo_date)}</span><small>{alt.ai?.detected_work||alt.sourceTask?.task_name||alt.file_name}</small><em>ใช้รูปนี้แทน</em></button>)}</div>
            {!editor.alternatives.length&&<div className="notice">ยังไม่มีรูปทางเลือกอื่นใน Candidate ชุดนี้</div>}
            {editorMessage&&<div className="notice" style={{color:'var(--red)'}}>{editorMessage}</div>}
          </div>
        </div>
      </section>
    </div>}
    <style jsx global>{`
      .ai-visual-status{margin:0 0 8px;padding:7px 10px;border-radius:9px;background:#edf5ff;border:1px solid #cbdff7;color:#35597d;font-size:10px;font-weight:800}
      .ai-visual-grid figure{position:relative}.ai-photo-controls{position:absolute;z-index:8;left:7px;right:7px;top:7px;display:flex;gap:5px;justify-content:flex-end;pointer-events:auto}.ai-photo-controls button,.ai-photo-controls span{border:1px solid rgba(255,255,255,.32);background:rgba(13,29,49,.84);color:#fff;border-radius:999px;padding:5px 8px;font-size:9px;font-weight:850;backdrop-filter:blur(5px);box-shadow:0 3px 10px rgba(0,0,0,.16)}.ai-photo-controls button{cursor:pointer}.ai-photo-controls button:hover{background:#1f5f99}.ai-photo-controls button:last-child:hover{background:#a13d36}
      .ai-editor-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(5,14,27,.76);display:grid;place-items:center;padding:18px;backdrop-filter:blur(5px)}.ai-editor-modal{width:min(1180px,96vw);max-height:94vh;overflow:auto;background:#fffdf9;border-radius:18px;box-shadow:0 28px 80px rgba(0,0,0,.34);border:1px solid #ddd5c7}.ai-editor-modal>header{position:sticky;top:0;z-index:2;background:#fffdf9;display:flex;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #e4ded4}.ai-editor-modal header span{font-size:9px;font-weight:900;letter-spacing:1.2px;color:#a97920}.ai-editor-modal h3{margin:3px 0;font-size:21px;color:#17243a}.ai-editor-modal header p{margin:0;font-size:11px;color:#6f7781}.ai-editor-body{display:grid;grid-template-columns:minmax(300px,.8fr) minmax(0,1.2fr);gap:16px;padding:16px}.ai-editor-current img{width:100%;height:370px;object-fit:contain;background:#111923;border-radius:12px}.ai-editor-ai{display:grid;gap:3px;padding:10px 0}.ai-editor-ai b{font-size:15px;color:#244d78}.ai-editor-ai span{font-size:11px;color:#374a61}.ai-editor-ai small{font-size:10px;color:#6f7781;line-height:1.4}.ai-editor-buttons{display:flex;gap:7px;flex-wrap:wrap}.ai-editor-options{display:grid;align-content:start;gap:10px}.ai-editor-options label{display:grid;gap:5px;font-size:11px;font-weight:850;color:#566273}.ai-editor-options select,.ai-editor-options input{width:100%;padding:10px;border:1px solid #ddd5c7;border-radius:9px;background:white}.ai-alt-head{display:flex;justify-content:space-between;align-items:end;margin-top:4px}.ai-alt-head b{font-size:13px}.ai-alt-head span{font-size:9px;color:#7a8490}.ai-alt-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ai-alt-grid>button{padding:0;text-align:left;border:1px solid #dfd8cc;border-radius:11px;overflow:hidden;background:#fff;cursor:pointer;display:grid}.ai-alt-grid>button:hover{border-color:#5b8fc3;box-shadow:0 5px 16px rgba(35,83,128,.12)}.ai-alt-grid img{width:100%;height:130px;object-fit:cover;background:#edf0f2}.ai-alt-grid span,.ai-alt-grid small,.ai-alt-grid em{padding:0 8px}.ai-alt-grid span{font-size:10px;font-weight:850;color:#315f9e;margin-top:7px}.ai-alt-grid small{font-size:9px;color:#6d7784;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ai-alt-grid em{font-size:9px;font-style:normal;font-weight:850;color:#247951;margin:5px 0 8px}
      @media(max-width:820px){.ai-editor-body{grid-template-columns:1fr}.ai-editor-current img{height:300px}}@media(max-width:560px){.ai-alt-grid{grid-template-columns:1fr}.ai-editor-backdrop{padding:6px}.ai-editor-modal{width:100%;max-height:97vh}.ai-editor-modal h3{font-size:17px}}
      @media print{.ai-photo-controls,.ai-visual-status,.ai-editor-backdrop{display:none!important}}
    `}</style>
  </>
}
