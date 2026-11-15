'use client'

import {useCallback,useEffect,useMemo,useState} from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import useAccessRole from '@/components/useAccessRole'
import {canAccessWorkOrder} from '@/lib/accessControl'
import {getSupabase} from '@/lib/supabase'
import './contractor-quality.css'

type HistoryRow={
 work_id:string;room_group:string;building:string;contractor:string;defect_item:string;
 work_status:string|null;evidence_url:string|null;source_file_id:string|null;
 source_modified_at:string|null;source_confirmed:boolean;source_origin:string;
}
type SnapshotRow={
 work_id:string;room_group:string;building:string;contractor:string;defect_item:string;
 work_status:string|null;source_active:boolean;imported_at:string|null;
}
type DefectItem={work_id:string;room_group:string;building:string;contractor:string;defect_item:string;
 work_status:string|null;evidence_url:string|null;provisional:boolean}
type VendorMetric={name:string;total:number;rooms:number;pending:number}
const VENDORS=['Pre Fur.','RSE','หมู่ 8','ขอพงษ์','ทองทวี'] as const
const MASTER_ID='18P3OFYtOLsslCtDujlSQVf9IQSuplKcx'
const actions:Record<string,string>={
 'Pre Fur.':'ตรวจ Defect เฟอร์นิเจอร์ในห้องที่มีรายการสูง และทบทวนขั้นตอนตรวจรับ/ปรับตั้งบานก่อนส่งมอบ',
 'RSE':'ตรวจสอบ Defect งานระบบอาคาร B พร้อมหลักฐานการทดสอบและตรวจรับระบบ',
 'หมู่ 8':'ตรวจงานเปียกและงานเก็บผิวอาคาร B ในห้องที่มี Defect สะสมสูง',
 'ขอพงษ์':'ตรวจ Defect งานระบบอาคาร A พร้อมการทดสอบหลังติดตั้งและการตรวจรับ',
 'ทองทวี':'ตรวจงานอลูมิเนียมและอุปกรณ์ประตู โดยตรวจจุดบกพร่องและคุณภาพการปรับตั้ง'
}
function teamName(raw:string):string{
 const s=(raw||'').trim()
 if(/^(?:Moo\s*8|หมู่\s*8)$/i.test(s))return 'หมู่ 8'
 if(s==='TTM')return 'ทองทวี'
 if(s.startsWith('ขอพงษ์'))return 'ขอพงษ์'
 return s
}
function category(raw:string):'internal'|'external'|'unconfirmed'{
 const s=teamName(raw)
 if(s==='3 Kings')return 'internal'
 if((VENDORS as readonly string[]).includes(s))return 'external'
 return 'unconfirmed'
}
function thDate(value:string|null|undefined){
 if(!value)return 'ไม่พบเวลาที่บันทึก'
 const d=new Date(value)
 return Number.isNaN(d.getTime())?'ไม่พบเวลาที่บันทึก':new Intl.DateTimeFormat('th-TH',{
  timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false
 }).format(d)+' น.'
}
function maxTime(values:(string|null|undefined)[]):string|null{
 return values.filter((v):v is string=>Boolean(v)).sort().at(-1)||null
}
function roomGroupName(s:string){return (s||'').replace(/\s+/g,'').replace(/\+/g,' + ')}
function toItem(r:HistoryRow|SnapshotRow,provisional:boolean):DefectItem{
 return {work_id:r.work_id,room_group:r.room_group,building:r.building,contractor:teamName(r.contractor),
  defect_item:r.defect_item,work_status:r.work_status,evidence_url:'evidence_url' in r?r.evidence_url:null,provisional}
}
export default function ContractorQualityPage(){
 const {role,ready}=useAccessRole()
 const permitted=canAccessWorkOrder(role)
 const [history,setHistory]=useState<HistoryRow[]>([])
 const [snapshot,setSnapshot]=useState<SnapshotRow[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [refreshed,setRefreshed]=useState<string|null>(null)
 const [building,setBuilding]=useState<'ALL'|'A'|'B'>('ALL')
 const [selected,setSelected]=useState('Pre Fur.')
 const [roomFilter,setRoomFilter]=useState('')
 const reload=useCallback(async()=>{
  const s=getSupabase()
  const [historyRead,snapshotRead]=await Promise.all([
   s.from('contractor_quality_history').select(
    'work_id,room_group,building,contractor,defect_item,work_status,evidence_url,source_file_id,source_modified_at,source_confirmed,source_origin'
   ).order('work_id').limit(1500),
   s.from('defect_work_order_snapshot').select(
    'work_id,room_group,building,contractor,defect_item,work_status,source_active,imported_at'
   ).order('work_id').limit(1500)
  ])
  if(historyRead.error)throw Error('ไม่สามารถอ่านประวัติ Contractor Quality: '+historyRead.error.message)
  if(snapshotRead.error)throw Error('ไม่สามารถตรวจสอบ Work Order Sync: '+snapshotRead.error.message)
  setHistory((historyRead.data||[]) as HistoryRow[])
  setSnapshot((snapshotRead.data||[]) as SnapshotRow[])
  setRefreshed(new Date().toISOString())
 },[])
 useEffect(()=>{
  if(!permitted)return
  let alive=true
  const load=async()=>{try{await reload();if(alive)setError('')}
   catch(e){if(alive)setError(e instanceof Error?e.message:String(e))}
   finally{if(alive)setLoading(false)}}
  void load()
  const focus=()=>{void load()}
  const visible=()=>{if(document.visibilityState==='visible')void load()}
  window.addEventListener('focus',focus)
  document.addEventListener('visibilitychange',visible)
  // Existing Work Order updates may occur while a tab is open; also refresh on the
  // same five-minute cadence used by the existing Work Order viewer.
  const timer=window.setInterval(()=>{void load()},300000)
  const supabase=getSupabase()
  const channel=supabase.channel('contractor-quality-readonly').on('postgres_changes',{
   event:'*',schema:'public',table:'defect_work_order_snapshot'
  },()=>{void load()}).subscribe()
  return()=>{alive=false;window.clearInterval(timer);window.removeEventListener('focus',focus);
   document.removeEventListener('visibilitychange',visible);void supabase.removeChannel(channel)}
 },[permitted,reload])
 const derived=useMemo(()=>{
  const allVerified=history.filter(r=>r.source_confirmed===true&&r.source_origin==='master_register')
  const known=new Set(history.map(r=>r.work_id))
  const pendingSync=snapshot.filter(r=>!known.has(r.work_id))
  const selectedBuilding=(r:{building:string})=>building==='ALL'||r.building===building
  const verified=allVerified.filter(selectedBuilding).map(r=>toItem(r,false))
  const pending=pendingSync.filter(selectedBuilding).map(r=>toItem(r,true))
  const external=verified.filter(r=>category(r.contractor)==='external')
  const unresolved=verified.filter(r=>category(r.contractor)==='unconfirmed')
  const internal=verified.filter(r=>category(r.contractor)==='internal')
  const metrics:VendorMetric[]=VENDORS.map(name=>{
   const v=external.filter(r=>r.contractor===name)
   const p=pending.filter(r=>r.contractor===name)
   return {name,total:v.length,rooms:new Set(v.map(r=>r.room_group)).size,pending:p.length}
  }).filter(x=>x.total||x.pending).sort((a,b)=>(b.total+b.pending)-(a.total+a.pending))
  const top=Object.entries(external.reduce<Record<string,number>>((map,row)=>{
   map[row.room_group]=(map[row.room_group]||0)+1;return map
  },{})).sort((a,b)=>b[1]-a[1]).slice(0,7)
  const mismatched=allVerified.filter(r=>{
   const current=snapshot.find(x=>x.work_id===r.work_id)
   return current&&teamName(current.contractor)!==teamName(r.contractor)
  })
  const sourceOnly=allVerified.filter(r=>!snapshot.some(s=>s.work_id===r.work_id))
  const pendingDbOnly=history.filter(r=>!r.source_confirmed)
  const exactRows=external.filter(r=>r.contractor===selected&&(!roomFilter||r.room_group.toLowerCase().includes(roomFilter.trim().toLowerCase())))
  const eligibleRows=[...exactRows,...pending.filter(r=>r.contractor===selected&&(!roomFilter||r.room_group.toLowerCase().includes(roomFilter.trim().toLowerCase())))]
  const details=eligibleRows.sort((a,b)=>a.room_group.localeCompare(b.room_group)||a.work_id.localeCompare(b.work_id))
  return {allVerified,verified,external,unresolved,internal,pending,metrics,top,
   mismatched,sourceOnly,pendingDbOnly,details,masterTime:maxTime(allVerified.map(r=>r.source_modified_at)),
   workOrderTime:maxTime(snapshot.map(r=>r.imported_at))}
 },[history,snapshot,building,selected,roomFilter])
 const first=derived.metrics[0]
 const maxVendor=Math.max(1,...derived.metrics.map(x=>x.total+x.pending))
 const maxRoom=Math.max(1,...derived.top.map(x=>x[1]))
 const topFiveTotal=derived.top.slice(0,5).reduce((n,r)=>n+r[1],0)
 if(!ready)return <AppShell><section className="panel">กำลังตรวจสอบสิทธิ์ Contractor Quality…</section></AppShell>
 if(!permitted)return <AppShell><section className="panel" role="alert">Contractor Quality เป็นข้อมูลภายในสำหรับผู้ที่มีสิทธิ์ Work Order เท่านั้น</section></AppShell>
 return <AppShell>
  <div className="quality-page">
   <PageHeader title="Contractor Quality" subtitle="Above Condo A + B · วิเคราะห์ประวัติ Defect เพื่อประเมินคุณภาพผู้รับเหมา"
    action={<button className="button" onClick={()=>{setLoading(true);void reload().then(()=>setError('')).catch(e=>setError(String(e))).finally(()=>setLoading(false))}}>Refresh</button>}/>
   {error&&<div className="quality-error" role="alert">{error} · ระบบไม่แสดงผล Sync เป็นสำเร็จเมื่ออ่านข้อมูลไม่ครบ</div>}
   {loading&&!history.length?<section className="panel">กำลังอ่านประวัติ Defect และตรวจข้อมูล Work Order…</section>:history.length===0?
    <section className="panel quality-empty">ยังไม่มีข้อมูลประวัติที่ตรวจสอบแล้วใน Contractor Quality · ห้ามใช้ยอด Work Order คงค้างแทนยอด Defect สะสม</section>:
   <>
    <div className="quality-toolbar">
     <div className="quality-sync-meta">
      <strong>ข้อมูลประวัติ Master ณ {thDate(derived.masterTime)}</strong>
      <span>Work Order Sync ล่าสุด {thDate(derived.workOrderTime)} · โหลดหน้า {thDate(refreshed)}</span>
     </div>
     <div className="quality-toggle" aria-label="เลือกอาคาร">
      {(['ALL','A','B'] as const).map(value=><button key={value} aria-pressed={building===value}
       onClick={()=>{setBuilding(value);setRoomFilter('')}} className={building===value?'selected':''}>
       {value==='ALL'?'A + B':'อาคาร '+value}</button>)}
     </div>
    </div>
    <div className="quality-kpi-grid">
     <div className="quality-kpi"><span>Defect ผู้รับเหมาภายนอก</span><b>{derived.external.length}</b><small>ประวัติที่ยืนยันแล้ว · Work ID</small></div>
     <div className="quality-kpi quality-kpi-accent"><span>ผู้รับเหมาที่มีรายการสูงสุด</span><b className="quality-kpi-name">{first?.name||'—'}</b><small>{first?first.total+' รายการ · '+derived.external.length+' รายการภายนอก':'ไม่มีข้อมูล'}</small></div>
     <div className="quality-kpi"><span>5 กลุ่มห้องที่มีรายการสูง</span><b>{topFiveTotal}</b><small>{derived.external.length?Math.round(topFiveTotal/derived.external.length*100)+'% ของรายการภายนอก':''}</small></div>
     <div className="quality-kpi"><span>งานที่ยังไม่ระบุทีม</span><b>{derived.unresolved.length}</b><small>ต้องยืนยันหลักฐานก่อนประเมิน</small></div>
    </div>
    <div className="quality-insight">
     <span className="quality-insight-icon" aria-hidden="true">!</span>
     <div><strong>ประเด็นบริหาร</strong><p>{first?
      first.name+' มีรายการสะสมที่ยืนยันแล้วสูงสุด '+first.total+' งาน ควรตรวจประเภท Defect ที่เกิดซ้ำและขั้นตอนตรวจรับก่อนพิจารณาใช้ผู้รับเหมารายนี้ในโครงการถัดไป':
      'ยังไม่มีรายการผู้รับเหมาภายนอกที่ยืนยันได้'} จำนวนรายการไม่ใช่อัตรางานเสียจนกว่าจะมีปริมาณงานรับผิดชอบทั้งหมดเป็นตัวหาร</p></div>
    </div>
    <div className="quality-graphs">
     <section className="quality-panel">
      <div className="quality-panel-header"><h2>ผู้รับเหมารายไหนมี Defect มากที่สุด?</h2><small>เรียงตาม Work ID สะสม · ไม่รวม 3 Kings</small></div>
      <div className="quality-bars">
       {derived.metrics.map(r=><button type="button" key={r.name} className={'quality-bar-row '+(selected===r.name?'active':'')}
        onClick={()=>{setSelected(r.name);setRoomFilter('')}} title={'ดูรายการของ '+r.name}>
        <span className="quality-bar-label">{r.name}</span>
        <span className="quality-bar-track"><span className="quality-bar-fill" style={{width:String(r.total/maxVendor*100)+'%'}}/>
         {r.pending>0&&<span className="quality-bar-pending" style={{left:String(r.total/maxVendor*100)+'%',width:String(r.pending/maxVendor*100)+'%'}}/>}</span>
        <strong className="quality-bar-count">{r.total}{r.pending>0&&<small> +{r.pending}*</small>}</strong>
       </button>)}
      </div>
      <div className="quality-legend"><span className="quality-legend-square"/> ยืนยันจาก Master
       <span className="quality-legend-pending"/> เพิ่มใหม่จาก Work Order Sync (*รอตรวจ Master)</div>
     </section>
     <section className="quality-panel">
      <div className="quality-panel-header"><h2>ห้องไหนมี Defect สะสมมากที่สุด?</h2><small>นับ Combine เป็น 1 กลุ่ม · จัดอันดับรายการผู้รับเหมาภายนอก</small></div>
      <div className="quality-bars quality-room-bars">{derived.top.map(([room,count])=><div key={room} className="quality-bar-row">
       <span className="quality-bar-label">{roomGroupName(room)}</span>
       <span className="quality-bar-track"><span className="quality-bar-fill" style={{width:String(count/maxRoom*100)+'%'}}/></span>
       <strong className="quality-bar-count">{count}</strong>
      </div>)}</div>
     </section>
    </div>
    <section className="quality-panel quality-details">
     <div className="quality-panel-header"><h2>เจาะลึกผู้รับเหมา</h2><small>เลือกผู้รับเหมาและค้นหาห้องเพื่อดู Work ID พร้อมหลักฐาน</small></div>
     <div className="quality-detail-controls">
      <label>ผู้รับเหมา<select value={selected} onChange={e=>{setSelected(e.target.value);setRoomFilter('')}}>
       {VENDORS.map(name=><option key={name} value={name}>{name}</option>)}
      </select></label>
      <label>ค้นหาห้อง<input value={roomFilter} onChange={e=>setRoomFilter(e.target.value)} placeholder="เช่น B401 หรือ A404"/></label>
     </div>
     <div className="quality-advice"><b>ข้อเสนอการตรวจสอบ:</b> {actions[selected]}</div>
     <div className="quality-table-scroll"><table><thead><tr><th>Work ID</th><th>ห้อง / Combine</th><th>รายการ Defect</th><th>สถานะ</th><th>หลักฐาน</th></tr></thead>
      <tbody>{derived.details.map(r=><tr key={r.work_id}>
       <td><strong>{r.work_id}</strong>{r.provisional&&<small className="quality-pending-tag">รอตรวจ Master</small>}</td>
       <td>{roomGroupName(r.room_group)}</td><td>{r.defect_item}</td>
       <td>{r.work_status||'—'}</td>
       <td>{r.evidence_url?<a href={r.evidence_url} target="_blank" rel="noopener noreferrer">เปิดหลักฐาน</a>:'—'}</td>
      </tr>)}</tbody></table>
      {derived.details.length===0&&<div className="quality-no-rows">ไม่พบรายการในตัวกรองนี้</div>}
     </div>
    </section>
    <div className="quality-footer-grid">
     <section className="quality-panel">
      <h2>สิ่งที่ควรดำเนินการต่อ</h2>
      <ol className="quality-actions">
       <li>ตรวจ Pre Fur. และกลุ่มห้องที่มี Defect สูงก่อน พร้อมระบุสาเหตุของงานเสีย</li>
       <li>ตรวจ 3 Work IDs ที่ชื่อทีมใน Master และ Work Order Sync ไม่ตรงกัน</li>
       <li>ยืนยันงานที่ยังไม่ระบุผู้รับเหมา และรายการที่ DB มีแต่ Master ไม่มี</li>
       <li>เพิ่มปริมาณงานและความรุนแรง Defect ก่อนตัดสินใจต่อสัญญา</li>
      </ol>
     </section>
     <section className="quality-panel">
      <h2>ความครบถ้วนของข้อมูล</h2>
      <div className="quality-health-row"><span>ประวัติ Master ที่ยืนยันแล้ว</span><b>{derived.allVerified.length}</b></div>
      <div className="quality-health-row"><span>อยู่ใน Master แต่ยังไม่อยู่ใน Work Order DB</span><b>{derived.sourceOnly.length}</b></div>
      <div className="quality-health-row"><span>อยู่เฉพาะฐาน DB เดิม (ยังไม่ยืนยัน)</span><b>{derived.pendingDbOnly.length}</b></div>
      <div className="quality-health-row"><span>ชื่อทีมไม่ตรงกันระหว่าง Master / DB</span><b>{derived.mismatched.length}</b></div>
      <div className="quality-health-row"><span>Work ID ใหม่จาก Work Order Sync รอตรวจ Master</span><b>{derived.pending.length}</b></div>
      <p className="quality-health-note">ยอด Defect สะสมอ่านจาก Master History ไม่ใช้ตัวกรอง Active/HOLD ของใบแจกงาน และไม่ลดลงเมื่องานปิดแล้ว หาก Master เปลี่ยนแต่ประวัติยังไม่อัปเดต ต้องแสดงสถานะข้อมูลค้าง ไม่รายงานว่า Sync ครบ</p>
      <a href={'https://drive.google.com/file/d/'+MASTER_ID+'/view'} target="_blank" rel="noopener noreferrer">ตรวจสอบ Excel Master ต้นทาง</a>
     </section>
    </div>
   </>}
  </div>
 </AppShell>
}
