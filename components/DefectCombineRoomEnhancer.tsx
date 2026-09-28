'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'

type RoomSource={
  room_no:string
  building:string
  floor:number|null
  owner_name:string|null
  defect_detail:string|null
}

type CombineMeta={
  rooms:string[]
  detail:string|null
}

function normalizeOwner(value:string|null){
  return (value||'').trim().replace(/\s+/g,' ').toLowerCase()
}

function roomNumber(roomNo:string){
  const match=roomNo.match(/(\d+)$/)
  return match?Number(match[1]):Number.NaN
}

function mergedDetail(rows:RoomSource[]){
  const details=[...new Set(rows.map(r=>r.defect_detail?.trim()).filter((x):x is string=>Boolean(x)))]
  if(!details.length)return null
  const sorted=[...details].sort((a,b)=>b.length-a.length)
  const kept:string[]=[]
  for(const detail of sorted){
    if(kept.some(existing=>existing.includes(detail)))continue
    kept.push(detail)
  }
  return kept.join(' • ')
}

function buildCombineMap(rows:RoomSource[]){
  const grouped=new Map<string,RoomSource[]>()
  rows.forEach(row=>{
    const owner=normalizeOwner(row.owner_name)
    if(!owner||row.floor==null)return
    const key=`${row.building}|${row.floor}|${owner}`
    grouped.set(key,[...(grouped.get(key)||[]),row])
  })

  const result=new Map<string,CombineMeta>()
  grouped.forEach(group=>{
    const sorted=[...group].sort((a,b)=>roomNumber(a.room_no)-roomNumber(b.room_no))
    let chain:RoomSource[]=[]
    const flush=()=>{
      if(chain.length<2){chain=[];return}
      const rooms=chain.map(r=>r.room_no)
      const detail=mergedDetail(chain)
      chain.forEach(r=>result.set(r.room_no,{rooms,detail}))
      chain=[]
    }

    sorted.forEach(row=>{
      if(!chain.length){chain=[row];return}
      const prev=chain[chain.length-1]
      if(roomNumber(row.room_no)===roomNumber(prev.room_no)+1){
        chain.push(row)
      }else{
        flush()
        chain=[row]
      }
    })
    flush()
  })
  return result
}

function getRoomNo(row:HTMLTableRowElement){
  return row.cells[0]?.querySelector('b')?.textContent?.trim()||''
}

function applyEnhancement(combineMap:Map<string,CombineMeta>){
  const table=document.querySelector<HTMLTableElement>('.defect-table table')
  if(!table)return

  const rows=Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr')).filter(row=>row.cells.length>=9)
  rows.forEach(row=>{
    const roomNo=getRoomNo(row)
    if(!roomNo)return

    const combine=combineMap.get(roomNo)
    const roomCell=row.cells[0]
    const detailCell=row.cells[6]
    const programCell=row.cells[5]
    const statusCell=row.cells[7]

    const existingBadge=roomCell.querySelector<HTMLElement>('.combine-room-badge')
    if(combine){
      const text=`Combine: ${combine.rooms.join(' + ')}`
      if(existingBadge){
        if(existingBadge.textContent!==text)existingBadge.textContent=text
      }else{
        const badge=document.createElement('span')
        badge.className='combine-room-badge'
        badge.textContent=text
        badge.title='ห้อง Combine — รายละเอียดงานของทุกเลขห้องในกลุ่มนี้ใช้ชุดเดียวกัน'
        roomCell.appendChild(badge)
      }

      if(combine.detail&&detailCell.textContent?.trim()!==combine.detail){
        detailCell.textContent=combine.detail
      }
    }else if(existingBadge){
      existingBadge.remove()
    }

    const isHotelHandover=programCell.textContent?.includes('ร่วมโรงแรม')&&statusCell.textContent?.includes('ส่งมอบลูกค้าแล้ว')
    const existingNote=statusCell.querySelector<HTMLElement>('.hotel-handover-note')
    if(isHotelHandover){
      const note='หมายเหตุ: ส่งมอบแล้ว • ยังไม่มี Hotel Defect Status ใน Master ล่าสุด'
      if(existingNote){
        if(existingNote.textContent!==note)existingNote.textContent=note
      }else{
        const el=document.createElement('small')
        el.className='hotel-handover-note'
        el.textContent=note
        statusCell.appendChild(el)
      }
    }else if(existingNote){
      existingNote.remove()
    }
  })
}

export default function DefectCombineRoomEnhancer(){
  useEffect(()=>{
    let cancelled=false
    let observer:MutationObserver|null=null
    let queued=false

    const run=async()=>{
      const {data,error}=await getSupabase()
        .from('condo_room_status')
        .select('room_no,building,floor,owner_name,defect_detail')
        .order('building')
        .order('floor')
        .order('room_no')

      if(cancelled||error)return
      const combineMap=buildCombineMap((data||[]) as RoomSource[])

      const decorate=()=>{
        if(cancelled||queued)return
        queued=true
        window.requestAnimationFrame(()=>{
          queued=false
          if(!cancelled)applyEnhancement(combineMap)
        })
      }

      decorate()
      const root=document.querySelector('.defect-table')
      if(root){
        observer=new MutationObserver(decorate)
        observer.observe(root,{childList:true,subtree:true,characterData:true})
      }
    }

    void run()
    return()=>{
      cancelled=true
      observer?.disconnect()
    }
  },[])

  return <style jsx global>{`
    .combine-room-badge{display:inline-flex;margin-top:5px;padding:2px 6px;border-radius:999px;background:#eef3ff;border:1px solid #c9d7f5;color:#385d9d;font-size:7.5px;font-weight:850;line-height:1.25;white-space:nowrap}
    .hotel-handover-note{display:block;max-width:180px;margin:5px auto 0;color:#5c6a78;font-size:7.5px;font-weight:700;line-height:1.3;white-space:normal}
    @media print{.combine-room-badge{font-size:7px}.hotel-handover-note{font-size:7px}}
  `}</style>
}
