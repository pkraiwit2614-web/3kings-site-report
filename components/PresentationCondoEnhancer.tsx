'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

type Building='A'|'B'
type SafePhoto={
  id:string
  project_id:string
  drive_file_id:string
  drive_url:string|null
  drive_folder_name:string|null
  file_name:string
  photo_date:string
  room_no:string
}
type ProjectRow={id:string;code:string}
type RoomRow={room_no:string;building:string;status_group:string|null}
type DrivePhotoRow={id:string;project_id:string;drive_file_id:string;drive_url:string|null;drive_folder_name:string|null;file_name:string;photo_date:string;is_active:boolean}

const DONE_STATUSES=new Set([
  'Hotel - Awaiting Check',
  'Hotel - Checked Complete',
  'Non-Hotel - Handover Complete',
])

const MEANINGS={
  danger:{label:'Defect ยังไม่เสร็จ'},
  warn:{label:'รอ Hotel ตรวจ / Pending Handover'},
  good:{label:'Hotel ตรวจแล้ว / ส่งมอบแล้ว'},
  neutral:{label:'Awaiting Sale'},
} as const

const COLOR_PREFIX=/^(แดง|เหลือง|เขียว|เทา)\s*[•:\-–—]?\s*/

function extractRoomNo(fileName:string,folderName?:string|null){
  const find=(value:string)=>value.toUpperCase().match(/([AB]\d{3,4})/)?.[1]||null
  return find(fileName)||find(folderName||'')
}

function buildingFromText(text:string):Building|null{
  const upper=text.toUpperCase()
  if(upper.includes('ABOVE CONDO A')||upper.includes('CONDO A'))return 'A'
  if(upper.includes('ABOVE CONDO B')||upper.includes('CONDO B'))return 'B'
  return null
}

function currentPeriod(){
  const inputs=[...document.querySelectorAll<HTMLInputElement>('.ep-filters input[type="date"]')]
  return {start:inputs[0]?.value||'',end:inputs[1]?.value||''}
}

function photosForPeriod(list:SafePhoto[]){
  const {start,end}=currentPeriod()
  const inRange=list.filter(p=>(!start||p.photo_date>=start)&&(!end||p.photo_date<=end))
  const sorted=inRange.slice().sort((a,b)=>b.photo_date.localeCompare(a.photo_date)||b.id.localeCompare(a.id))
  const byRoom=new Map<string,SafePhoto>()
  for(const photo of sorted){ if(!byRoom.has(photo.room_no))byRoom.set(photo.room_no,photo) }
  return [...byRoom.values()].slice(0,4)
}

function fillPhotoGrid(container:HTMLElement,photos:SafePhoto[],building:Building,compact:boolean){
  const signature=photos.map(p=>p.id).join('|')||`none-${building}`
  if(container.dataset.signature===signature)return
  container.dataset.signature=signature
  container.replaceChildren()

  if(!photos.length){
    const empty=document.createElement('div')
    empty.className='verified-condo-empty'
    empty.textContent=`ยังไม่มีรูป Defect Done ที่ยืนยันว่าเป็นตึก ${building} และเป็นห้องที่ปิดงานแล้วในช่วงวันที่เลือก`
    container.appendChild(empty)
    return
  }

  for(const photo of photos){
    const link=document.createElement('a')
    link.className='verified-condo-photo'
    link.href=photo.drive_url||`https://drive.google.com/file/d/${photo.drive_file_id}/view`
    link.target='_blank'
    link.rel='noreferrer'
    link.title=`${photo.room_no} • ${photo.photo_date}`

    const img=document.createElement('img')
    img.src=`/api/drive-photo?fileId=${encodeURIComponent(photo.drive_file_id)}&size=${compact?720:1100}`
    img.alt=`Defect Done ${photo.room_no}`
    img.loading='lazy'

    const badge=document.createElement('span')
    badge.className='verified-condo-room'
    badge.textContent=photo.room_no

    const date=document.createElement('small')
    date.className='verified-condo-date'
    date.textContent=photo.photo_date.split('-').reverse().join('/')

    link.append(img,badge,date)
    container.appendChild(link)
  }
}

export default function PresentationCondoEnhancer(){
  const [safePhotos,setSafePhotos]=useState<Record<Building,SafePhoto[]>>({A:[],B:[]})

  useEffect(()=>{
    let cancelled=false
    ;(async()=>{
      const s=getSupabase()
      const [projectRes,roomRes,photoRes]=await Promise.all([
        s.from('projects').select('id,code').in('code',['CONDO-A','CONDO-B']),
        s.from('condo_room_status').select('room_no,building,status_group'),
        s.from('drive_photo_index').select('id,project_id,drive_file_id,drive_url,drive_folder_name,file_name,photo_date,is_active').eq('is_active',true).order('photo_date',{ascending:false}),
      ])
      if(cancelled)return

      const projectByCode=new Map(((projectRes.data||[]) as ProjectRow[]).map(p=>[p.code,p.id]))
      const roomStatus=new Map(((roomRes.data||[]) as RoomRow[]).map(r=>[r.room_no.toUpperCase(),r.status_group]))
      const result:Record<Building,SafePhoto[]>={A:[],B:[]}

      for(const raw of (photoRes.data||[]) as DrivePhotoRow[]){
        const roomNo=extractRoomNo(raw.file_name,raw.drive_folder_name)
        if(!roomNo)continue
        const building=roomNo.startsWith('A')?'A':roomNo.startsWith('B')?'B':null
        if(!building)continue
        const expectedProject=projectByCode.get(`CONDO-${building}`)
        if(!expectedProject||raw.project_id!==expectedProject)continue
        if(!DONE_STATUSES.has(roomStatus.get(roomNo)||''))continue
        result[building].push({...raw,room_no:roomNo})
      }
      setSafePhotos(result)
    })().catch(()=>{})
    return()=>{cancelled=true}
  },[])

  useEffect(()=>{
    let raf=0
    const apply=()=>{
      cancelAnimationFrame(raf)
      raf=requestAnimationFrame(()=>{
        // Overview cards: show only verified Condo Defect Done photos from completed rooms.
        document.querySelectorAll<HTMLElement>('.condo-card').forEach(card=>{
          const building=buildingFromText(card.textContent||'')
          if(!building)return
          const cover=card.querySelector<HTMLElement>('.ep-cover')
          if(!cover)return
          cover.querySelectorAll<HTMLElement>(':scope > img, :scope > .ep-cover-empty').forEach(el=>{el.style.display='none'})
          let grid=cover.querySelector<HTMLElement>('.verified-condo-cover')
          if(!grid){
            grid=document.createElement('div')
            grid.className='verified-condo-cover'
            cover.prepend(grid)
          }
          fillPhotoGrid(grid,photosForPeriod(safePhotos[building]),building,true)
        })

        // Show presentation meanings only; keep color as a visual cue without naming the color.
        document.querySelectorAll<HTMLElement>('.condo-tone-row span').forEach(span=>{
          const tone=(['danger','warn','good','neutral'] as const).find(t=>span.classList.contains(t))
          if(!tone)return
          const meaning=MEANINGS[tone]
          const current=(span.dataset.originalText||span.textContent||'').trim()
          if(!span.dataset.originalText)span.dataset.originalText=current
          const metrics=current.replace(COLOR_PREFIX,'').trim()
          const next=`${meaning.label}${metrics?` — ${metrics}`:''}`
          if(span.textContent!==next)span.textContent=next
        })

        // Fullscreen/detail Condo slide: do not reuse generic site photos.
        const slide=document.querySelector<HTMLElement>('.condo-slide')
        if(slide){
          const building=buildingFromText(slide.textContent||'')
          if(building){
            const photoSection=slide.querySelector<HTMLElement>('.ep-photo-section')
            if(photoSection){
              photoSection.querySelectorAll<HTMLElement>(':scope > .ep-photo-grid, :scope > .ep-photo-empty').forEach(el=>{el.style.display='none'})
              let verified=photoSection.querySelector<HTMLElement>('.verified-condo-slide-photos')
              if(!verified){
                verified=document.createElement('div')
                verified.className='verified-condo-slide-photos'
                photoSection.appendChild(verified)
              }
              fillPhotoGrid(verified,photosForPeriod(safePhotos[building]),building,false)
              const head=photoSection.querySelector<HTMLElement>('.ep-photo-head b')
              if(head&&head.textContent!==`ตัวอย่างห้องปิดงาน Defect แล้ว — ตึก ${building}`)head.textContent=`ตัวอย่างห้องปิดงาน Defect แล้ว — ตึก ${building}`
            }

            const statusPanel=slide.querySelector<HTMLElement>('.condo-status-panel')
            if(statusPanel&&!statusPanel.querySelector('.verified-condo-legend')){
              const legend=document.createElement('div')
              legend.className='verified-condo-legend'
              ;(['danger','warn','good','neutral'] as const).forEach(tone=>{
                const item=document.createElement('div')
                item.className=`${tone}`
                const span=document.createElement('span'); span.textContent=MEANINGS[tone].label
                item.append(span); legend.appendChild(item)
              })
              const six=statusPanel.querySelector('.condo-six-status')
              statusPanel.insertBefore(legend,six||null)
            }
          }
        }
      })
    }

    apply()
    const observer=new MutationObserver(apply)
    observer.observe(document.body,{childList:true,subtree:true})
    document.addEventListener('change',apply,true)
    return()=>{cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('change',apply,true)}
  },[safePhotos])

  return <style jsx global>{`
    .condo-card .ep-cover:after{z-index:2;pointer-events:none}
    .condo-card .ep-cover-title{z-index:3}
    .verified-condo-cover{position:absolute;inset:0;z-index:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:2px;background:#dfe4e8}
    .verified-condo-photo{position:relative;display:block;min-width:0;min-height:0;overflow:hidden;background:#e8e5de}
    .verified-condo-photo img{width:100%;height:100%;object-fit:cover;display:block}
    .verified-condo-room{position:absolute;left:7px;top:7px;padding:4px 7px;border-radius:999px;background:rgba(18,36,58,.88);color:white;font-size:9px;font-weight:900;letter-spacing:.3px}
    .verified-condo-date{position:absolute;right:6px;top:7px;padding:3px 6px;border-radius:999px;background:rgba(255,255,255,.9);color:#36485d;font-size:7px;font-weight:800}
    .verified-condo-empty{grid-column:1/-1;grid-row:1/-1;display:grid;place-items:center;padding:20px;text-align:center;color:#667381;background:#eef1f3;font-size:10px;font-weight:800;line-height:1.5}
    .condo-tone-row{grid-template-columns:1fr 1fr!important}
    .condo-tone-row span{text-align:left!important;padding:7px 8px!important;line-height:1.35}
    .verified-condo-slide-photos{display:grid;grid-template-columns:1fr 1fr;gap:9px;min-height:480px}
    .verified-condo-slide-photos .verified-condo-photo{height:235px;border:1px solid #e3ddd4;border-radius:12px}
    .verified-condo-slide-photos>.verified-condo-photo:only-child{grid-column:1/-1;height:500px}
    .verified-condo-slide-photos .verified-condo-room{font-size:11px;padding:5px 8px}
    .verified-condo-slide-photos .verified-condo-date{font-size:9px}
    .verified-condo-slide-photos>.verified-condo-empty{min-height:480px;border:1px dashed #d8d1c6;border-radius:12px;background:#faf8f3}
    .verified-condo-legend{display:grid;grid-template-columns:1fr 1fr;gap:7px}
    .verified-condo-legend>div{display:grid;grid-template-columns:1fr;align-items:center;gap:7px;padding:7px 9px;border-radius:9px;border:1px solid transparent;font-size:9px;font-weight:800}
    .verified-condo-legend .danger{background:#fff2f1;border-color:#edcac6;color:#9f3530}.verified-condo-legend .warn{background:#fff8e7;border-color:#ead8a4;color:#8b5b0d}.verified-condo-legend .good{background:#eef9f3;border-color:#cce5d6;color:#206d49}.verified-condo-legend .neutral{background:#f1f3f5;border-color:#d8dde2;color:#59636d}
    @media(max-width:620px){.verified-condo-slide-photos{grid-template-columns:1fr}.verified-condo-slide-photos .verified-condo-photo,.verified-condo-slide-photos>.verified-condo-photo:only-child{height:260px}.verified-condo-legend{grid-template-columns:1fr}.condo-tone-row{grid-template-columns:1fr!important}}
  `}</style>
}
