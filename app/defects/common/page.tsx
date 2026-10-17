'use client'

import { useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import DefectReportTabs from '@/components/DefectReportTabs'
import prepared from './common-defects-ab-prepared.json'

const allRows = prepared.rows.map(row => ({
  id: row.defect_id, sourceNo: row.source_no, sourcePage: row.source_page,
  building: row.building, area: row.floor_area, location: row.location,
  work: row.work_description, workType: row.work_type, team: row.contractor_team,
  supervisor: row.supervisor, status: row.status, notes: row.review_notes,
  sourceUrl: row.source_file_url, sourceName: row.source_file,
  originalEnglish: row.original_english, originalDone: row.original_done,
  originalRemarks: row.original_remarks, roomReference: row.room_reference,
  photoFilename: row.photo_filename, teamConfirmed: row.team_confirmation
}))
const uniqueSorted = (values:string[]) => Array.from(new Set(values)).sort((a,b)=>a.localeCompare(b,'th',{numeric:true}))
const areas = uniqueSorted(allRows.map(r=>r.area))
const teams = uniqueSorted(allRows.map(r=>r.team))
const workTypes = uniqueSorted(allRows.map(r=>r.workType))
const formatDateTH = (iso:string) => new Intl.DateTimeFormat('th-TH',{
  timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,
}).format(new Date(iso))+' น.'

export default function CommonDefectReportPage(){
  const [building,setBuilding]=useState('')
  const [q,setQ]=useState('')
  const [workType,setWorkType]=useState('')
  const [team,setTeam]=useState('')
  const [area,setArea]=useState('')
  const filtered=useMemo(()=>{
    const needle=q.trim().toLocaleLowerCase()
    return allRows.filter(row=>{
      if(building&&row.building!==building)return false
      if(workType&&row.workType!==workType)return false
      if(team&&row.team!==team)return false
      if(area&&row.area!==area)return false
      if(!needle)return true
      return [row.id,String(row.sourceNo),row.location,row.area,row.work,row.workType,row.team,row.supervisor,row.notes,row.originalEnglish,row.originalRemarks,row.roomReference]
        .some(value=>value.toLocaleLowerCase().includes(needle))
    })
  },[q,building,workType,team,area])
  const reset=()=>{setQ('');setBuilding('');setWorkType('');setTeam('');setArea('')}
  const countByTeam=(value:string)=>allRows.filter(r=>(!building||r.building===building)&&r.team===value).length
  return <AppShell>
    <PageHeader
      title="Above Condo — Defect Report"
      subtitle="รายละเอียด Defect ส่วนกลาง อาคาร A และ B (Common Area)"
      action={<div className="common-header-actions">
        <div className="common-sync"><span>Snapshot จัดเตรียมข้อมูล (ไม่ซิงก์ Excel อัตโนมัติ)</span><b>{prepared.prepared_on.split('-').reverse().join('/')}</b></div>
        <button type="button" className="button common-print" onClick={()=>window.print()}>Print</button>
      </div>}
    />
    <DefectReportTabs active="common" />
    <section className="panel common-intro" aria-label="ภาพรวม Defect ส่วนกลาง">
      <div className="common-intro-heading">
        <div><h2>Common Area — อาคาร A และ B</h2><p>แสดงจำนวน <strong>รายการงาน</strong> ไม่ใช่จำนวนห้อง และไม่รวมในยอด Condo/Defect Flow รายห้อง</p></div>
        <b className="common-total">{allRows.length} <small>รายการต้นทาง</small></b>
      </div>
      <div className="common-counters">
        {(['A','B'] as const).map(b=><button type="button" className="common-counter common-building" aria-pressed={building===b} onClick={()=>setBuilding(building===b?'':b)} key={b}><span>อาคาร {b}</span><b>{allRows.filter(r=>r.building===b).length}</b><small>รายการ</small></button>)}
        {teams.map(name=><div className="common-counter" key={name}><span>{name}</span><b>{countByTeam(name)}</b><small>รายการ</small></div>)}
      </div>
      <p className="common-caution">สถานะ: <strong>รอตรวจสถานะจริง</strong> — PDF ต้นทางยังไม่ยืนยัน DONE ทุกข้อ ไม่ให้นับทั้งหมดเป็นงานค้างหรือเสร็จแล้วโดยอัตโนมัติ ผู้คุมงานส่วนกลางทั้งหมด: <strong>บังศักดิ์</strong></p>
    </section>
    <section className="panel common-filter" aria-label="ตัวกรองงาน Defect ส่วนกลาง">
      <div className="common-controls">
        <label><span>กรองอาคาร</span><select aria-label="กรองอาคาร" value={building} onChange={e=>setBuilding(e.target.value)}><option value="">อาคาร A และ B</option><option value="A">อาคาร A</option><option value="B">อาคาร B</option></select></label>
        <label><span>ค้นหารายการ / จุดงาน</span><input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="เช่น CA-A-023, A515, เคลือบพื้น" /></label>
        <label><span>กรองงาน</span><select value={workType} onChange={e=>setWorkType(e.target.value)}><option value="">ทุกประเภทงาน</option>{workTypes.map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span>กรองทีม</span><select value={team} onChange={e=>setTeam(e.target.value)}><option value="">ทุกทีม</option>{teams.map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span>กรองพื้นที่</span><select value={area} onChange={e=>setArea(e.target.value)}><option value="">ทุกพื้นที่</option>{areas.map(x=><option key={x}>{x}</option>)}</select></label>
        {(q||building||workType||team||area)&&<button type="button" className="button" onClick={reset}>ล้างตัวกรอง</button>}
      </div>
    </section>
    <section className="panel common-results" aria-label="รายละเอียด Defect ส่วนกลาง">
      <div className="common-table-heading"><h2>รายการ Defect ส่วนกลาง</h2><p>แสดง {filtered.length} จาก {allRows.length} รายการ • รหัส CA-A-001 ถึง CA-A-058 และ B-COM-001 ถึง B-COM-048 อ้างอิง PDF ต้นฉบับ</p></div>
      <div className="common-scroll">
        <table className="common-table">
          <thead><tr><th scope="col">ลำดับ / เลขงาน</th><th scope="col">พื้นที่ / จุดงาน</th><th scope="col">รายละเอียดงาน</th><th scope="col">ทีมรับผิดชอบ</th><th scope="col">สถานะ / ตรวจสอบ</th><th scope="col">หลักฐาน</th></tr></thead>
          <tbody>{filtered.map((row,i)=><tr key={row.id}>
            <td><small>{i+1} · อาคาร {row.building}</small><strong>{row.id}</strong></td>
            <td><b>{row.location}</b><small>{row.area}</small></td>
            <td className="common-work"><b>{row.work}</b><small>{row.workType}</small>{row.originalEnglish&&<small>EN: {row.originalEnglish}</small>}{row.notes&&<p className="common-work-note">{row.notes}</p>}</td>
            <td><b>{row.team}</b><small>ผู้คุม: {row.supervisor}</small>{row.teamConfirmed&&<small>{row.teamConfirmed}</small>}</td>
            <td><span className="common-status">{row.status}</span><small>ยังไม่ยืนยันวันที่แจ้ง / วันที่เสร็จ</small></td>
            <td><a href={row.sourceUrl} target="_blank" rel="noreferrer">เปิด PDF ต้นฉบับ ↗</a><small>{row.sourceName} • ข้อ {row.sourceNo} • หน้า {row.sourcePage}</small>{row.photoFilename&&<small>ภาพอ้างอิง: {row.photoFilename}</small>}</td>
          </tr>)}
          {filtered.length===0&&<tr><td colSpan={6} className="common-empty">ไม่พบรายการตามเงื่อนไข</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="common-provenance">แหล่งข้อมูล: Master ส่วนกลาง A+B (106 รายการ) จาก <a href="https://drive.google.com/file/d/1B-SXQnoNQMth4D6p-2VaEcDEIRj5VQ5N/view" target="_blank" rel="noreferrer">PDF อาคาร A</a> และ <a href="https://drive.google.com/file/d/1_BphOcgcPtumnm7pg1cffXAAomMP1iU9/view" target="_blank" rel="noreferrer">PDF อาคาร B</a> • สถานะทั้งหมดรอยืนยัน • ข้อมูลนี้เป็น Snapshot ไม่ได้ซิงก์ Excel หรือเขียนกลับข้อมูล Condo รายห้อง</p>
    </section>
    <style jsx>{`
      .common-header-actions{display:flex;align-items:center;gap:10px;justify-content:flex-end;flex-wrap:wrap}
      .common-sync{display:flex;flex-direction:column;text-align:right;line-height:1.3}.common-sync span{color:var(--muted);font-size:9px;font-weight:700}.common-sync b{color:var(--navy);font-size:10px}
      .common-intro{margin-bottom:12px}.common-intro-heading{display:flex;gap:15px;align-items:center;justify-content:space-between}.common-intro h2,.common-table-heading h2{font-size:17px;margin:0;color:var(--navy)}.common-intro p{font-size:11px;margin:5px 0;color:var(--muted)}
      .common-total{font-size:26px;white-space:nowrap;color:var(--navy)}.common-total small{font-size:10px;font-weight:600}
      .common-counters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}.common-building{font:inherit;cursor:pointer;text-align:left}.common-building[aria-pressed=true]{border-color:var(--navy);outline:1px solid var(--navy)}.common-counter{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}.common-counter span{flex:1;font-size:12px;font-weight:750}.common-counter b{font-size:22px;color:var(--navy)}.common-counter small{font-size:9px;color:var(--muted)}
      .common-intro .common-caution{background:#fff8ed;border-left:3px solid #bd8e34;border-radius:4px;padding:9px 12px;color:#71551e;font-size:11px;line-height:1.5}
      .common-filter{margin-bottom:12px}.common-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}.common-controls label{display:flex;flex:1;min-width:145px;flex-direction:column;gap:5px}.common-controls label:first-child{flex:2;min-width:230px}.common-controls label span{font-size:10px;font-weight:750;color:var(--muted)}.common-controls input,.common-controls select{max-width:100%;width:100%;min-height:36px;padding:7px 10px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--text);font:inherit;font-size:12px}
      .common-table-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}.common-table-heading p{font-size:10px;color:var(--muted);margin:0}.common-scroll{max-height:750px;overflow:auto;border:1px solid var(--line);border-radius:9px}.common-table{border-collapse:collapse;min-width:1050px;width:100%;font-size:11px}.common-table th{position:sticky;top:0;z-index:1;background:#eaf0f6;color:#34465d;text-align:left;font-size:10px;padding:11px;border-bottom:1px solid var(--line)}.common-table td{padding:10px 11px;border-bottom:1px solid var(--line);vertical-align:top;line-height:1.45}.common-table tbody tr:nth-child(even){background:#f8fafc}.common-table td strong,.common-table td b{font-weight:750;color:var(--navy)}.common-table td strong,.common-table td small{display:block}.common-table td small{color:var(--muted);font-size:9px;margin-top:4px}.common-table td a{font-size:10px}.common-work{min-width:320px;max-width:520px}.common-work-note{font-size:10px;line-height:1.5;white-space:normal;overflow-wrap:anywhere;margin:6px 0 0;color:var(--muted)}.common-status{font-size:10px;color:#85570d;background:#fff3dc;border:1px solid #f0dfb8;border-radius:99px;padding:4px 7px;display:inline-block;white-space:nowrap}.common-empty{text-align:center;padding:36px!important}.common-provenance{font-size:9px;line-height:1.6;color:var(--muted);margin:12px 0 0}
      @media(max-width:850px){.common-intro-heading{align-items:flex-start}.common-table-heading{display:block}.common-table-heading p{margin-top:4px}.common-counters{grid-template-columns:1fr}}
      @media print{
        @page{size:A4 landscape;margin:8mm}
        .common-header-actions,.common-filter{display:none!important}.common-scroll{overflow:visible!important;max-height:none!important;border:0!important}.common-results,.common-intro{box-shadow:none!important;border:0!important;padding:0!important}.common-table{min-width:0!important;table-layout:fixed!important;font-size:8px!important}.common-table thead{display:table-header-group!important}.common-table tr{break-inside:avoid!important;page-break-inside:avoid!important}.common-table th{position:static!important;padding:4px!important;font-size:8px!important}.common-table td{padding:4px!important;font-size:8px!important;overflow-wrap:anywhere}.common-table td small,.common-table td a,.common-work-note,.common-provenance{font-size:7px!important}.common-work{min-width:0!important;max-width:none!important}.common-status{white-space:normal!important;font-size:7px!important}.common-counters{grid-template-columns:repeat(3,1fr)!important;gap:4px!important}.common-counter{padding:4px!important}.common-counter b{font-size:15px!important}.common-intro .common-caution{padding:5px!important}.common-table th:nth-child(1){width:12%}.common-table th:nth-child(2){width:19%}.common-table th:nth-child(3){width:32%}.common-table th:nth-child(4){width:12%}.common-table th:nth-child(5){width:15%}.common-table th:nth-child(6){width:10%}
      }
    `}</style>
  </AppShell>
}
