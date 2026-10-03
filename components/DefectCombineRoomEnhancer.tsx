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

const COMBINE_GROUPS:string[][]=[
  ['A213','A214'],
  ['A217','A218'],
  ['A221','A222'],
  ['A223','A224','A225'],
  ['A308','A309'],
  ['A313','A314'],
  ['A317','A318'],
  ['A402','A403'],
  ['A404','A405'],
  ['A413','A414'],
  ['A417','A418'],
  ['A506','A507'],
  ['A508','A509'],
  ['A513','A514'],
  ['A521','A522'],
  ['A602','A603'],
  ['A604','A605'],
  ['A606','A607'],
  ['A608','A609'],
  ['A613','A614'],
  ['A621','A622'],
  ['A623','A624'],
  ['A702','A703'],
  ['A704','A705'],
  ['A706','A707'],
  ['A708','A709'],
  ['A713','A714'],
  ['A717','A718'],
  ['B610','B611'],
  ['B614','B615'],
  ['B712','B713'],
]

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
  const byRoom=new Map(rows.map(row=>[row.room_no,row]))
  const result=new Map<string,CombineMeta>()

  COMBINE_GROUPS.forEach(rooms=>{
    const groupRows=rooms.map(room=>byRoom.get(room)).filter((row):row is RoomSource=>Boolean(row))
    if(!groupRows.length)return
    const detail=mergedDetail(groupRows)
    groupRows.forEach(row=>result.set(row.room_no,{rooms,detail}))
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

    const existingCode=roomCell.querySelector<HTMLElement>('.combine-room-code')
    const existingBadge=roomCell.querySelector<HTMLElement>('.combine-room-badge')
    if(combine){
      if(!existingCode){
        const code=document.createElement('span')
        code.className='combine-room-code'
        code.textContent='c'
        code.title='ห้อง Combine'
        roomCell.querySelector('b')?.insertAdjacentElement('afterend',code)
      }

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
    }else{
      existingCode?.remove()
      existingBadge?.remove()
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
    let tableObserver:MutationObserver|null=null
    let discoveryObserver:MutationObserver|null=null
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

      const attachToTable=()=>{
        if(cancelled||tableObserver)return Boolean(tableObserver)
        const root=document.querySelector('.defect-table')
        if(!root)return false
        decorate()
        tableObserver=new MutationObserver(decorate)
        tableObserver.observe(root,{childList:true,subtree:true,characterData:true})
        discoveryObserver?.disconnect()
        discoveryObserver=null
        return true
      }

      if(!attachToTable()){
        discoveryObserver=new MutationObserver(()=>{ void attachToTable() })
        discoveryObserver.observe(document.body,{childList:true,subtree:true})
      }
    }

    void run()
    return()=>{
      cancelled=true
      tableObserver?.disconnect()
      discoveryObserver?.disconnect()
    }
  },[])

  return <style jsx global>{`
    .combine-room-code{display:inline-block;margin-left:1px;color:#385d9d;font-size:7px;font-weight:900;line-height:1;vertical-align:super}
    .combine-room-badge{display:inline-flex;margin-top:5px;padding:2px 6px;border-radius:999px;background:#eef3ff;border:1px solid #c9d7f5;color:#385d9d;font-size:7.5px;font-weight:850;line-height:1.25;white-space:nowrap}
    .hotel-handover-note{display:block;max-width:180px;margin:5px auto 0;color:#5c6a78;font-size:7.5px;font-weight:700;line-height:1.3;white-space:normal}
    @media print{.combine-room-code{font-size:6.5px}.combine-room-badge{font-size:7px}.hotel-handover-note{font-size:7px}}
  `}</style>
}
