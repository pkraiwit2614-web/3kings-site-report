'use client'

import {useCallback,useEffect,useMemo,useState} from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import {getSupabase} from '@/lib/supabase'
import {loadPermissions,PERMISSION_EVENT} from '@/lib/permissionClient'
import {canAccessPath,permissionDecision,type PermissionSnapshot} from '@/lib/accessControl'
import useAccessRole from '@/components/useAccessRole'
import type {ContactEntry,EditableContact} from '@/lib/contactBook'
import {normalizedPhone} from '@/lib/contactBook'
import styles from './contact-book.module.css'

const blank:EditableContact={category:'ผู้รับเหมา',service_group:'',organization:'',contact_name:'',
  phone:'',work_scope:'',project_area:'',review_note:'',secondary_phone:'',active:'ใช่',aliases:''}

function dateTimeTH(value:string|null){
  if(!value)return 'ยังไม่มีข้อมูล'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return 'รอตรวจสอบ'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',
    year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' น.'
}
function errorInThai(code:string){
  if(code==='duplicate_contact_phone'||code.startsWith('duplicate_contact_phone:'))return 'เบอร์โทรซ้ำกับรายชื่ออื่น กรุณาตรวจสอบก่อนบันทึก'
  if(code==='contact_book_busy')return 'มีผู้ใช้อื่นกำลังบันทึกรายชื่อ กรุณาลองใหม่หลังโหลดข้อมูลล่าสุด'
  if(code==='contact_book_source_changed_reload')return 'ไฟล์ต้นทางถูกแก้ไขแล้ว กรุณาโหลดใหม่ก่อนบันทึก เพื่อป้องกันการเขียนทับข้อมูล'
  if(code==='contact_drive_not_configured'||code==='contact_drive_file_not_shared_or_denied')return 'การเชื่อมต่อ Drive ยังไม่พร้อม จึงยังไม่บันทึกข้อมูล'
  if(code==='contact_required_fields')return 'กรอกชื่อบริษัท ชื่อผู้ติดต่อ ประเภทงานและโครงการให้ครบ'
  if(code==='invalid_contact_phone'||code==='invalid_secondary_phone')return 'รูปแบบเบอร์โทรไม่ถูกต้อง'
  if(code==='contact_drive_verification_failed_refresh_before_retry')return 'เขียนไฟล์แล้วแต่ยืนยันข้อมูลกลับไม่ได้ กรุณาโหลดล่าสุดก่อนลองอีกครั้ง'
  if(code==='contact_permissions_not_installed')return 'โมดูลสิทธิ์ Contact Book ยังไม่ติดตั้งในฐานข้อมูล'
  if(code==='permission_check_unavailable')return 'ยังตรวจสอบสิทธิ์จากฐานข้อมูลไม่ได้'
  return 'ดำเนินการไม่สำเร็จ ('+code+') กรุณาตรวจสอบก่อนลองอีกครั้ง'
}

export default function ContactBookPage(){
  const {role,ready}=useAccessRole()
  const [permissions,setPermissions]=useState<PermissionSnapshot|null>(null)
  const [rows,setRows]=useState<ContactEntry[]>([])
  const [version,setVersion]=useState('')
  const [updatedAt,setUpdatedAt]=useState<string|null>(null)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [query,setQuery]=useState('')
  const [category,setCategory]=useState('')
  const [group,setGroup]=useState('')
  const [project,setProject]=useState('')
  const [editing,setEditing]=useState<ContactEntry|null|undefined>(undefined)
  const [form,setForm]=useState<EditableContact>(blank)
  const [confirm,setConfirm]=useState(false)
  const canView=!!role&&!!permissions&&canAccessPath(role,'/contact-book',permissions)
  const canManage=!!role&&!!permissions&&permissionDecision(role,'contact_book','manage',false,permissions)&&canView

  const reload=useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const session=await getSupabase().auth.getSession()
      const token=session.data.session?.access_token
      if(!token)throw new Error('unauthorized')
      const response=await fetch('/api/contact-book',{headers:{authorization:'Bearer '+token},cache:'no-store'})
      const result=await response.json()
      if(!response.ok)throw new Error(result.error||'contact_book_request_failed')
      setRows(result.rows||[]);setVersion(String(result.sourceVersion||''));setUpdatedAt(result.updatedAt||null)
    }catch(e){setError(errorInThai(e instanceof Error?e.message:String(e)))}finally{setLoading(false)}
  },[])

  useEffect(()=>{
    let disposed=false
    const update=()=>{void loadPermissions(true).then(value=>{if(!disposed)setPermissions(value)}).catch(()=>{if(!disposed)setError('ไม่สามารถโหลด Role Permission Matrix ได้')})}
    update();window.addEventListener(PERMISSION_EVENT,update)
    return()=>{disposed=true;window.removeEventListener(PERMISSION_EVENT,update)}
  },[])
  useEffect(()=>{if(ready&&canView)void reload()},[ready,canView,reload])

  const groups=useMemo(()=>Array.from(new Set(rows.map(x=>x.service_group).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'th')),[rows])
  const projects=useMemo(()=>Array.from(new Set(rows.flatMap(x=>{
    const s=x.project_area
    return [s.includes('Villa')?'Above Villa':'',s.includes('Condo')?'Above Condo':'',
      s.includes('Mirage')?'Mirage':'',s.includes('Karon')?'Karon':''].filter(Boolean)
  }))).sort(),[rows])
  const filtered=useMemo(()=>{
    const term=query.toLocaleLowerCase('th-TH').replace(/[\s()+\-]/g,'')
    return rows.filter(x=>(!category||x.category===category)&&(!group||x.service_group===group)
      &&(!project||x.project_area.includes(project==='Above Villa'?'Villa':project==='Above Condo'?'Condo':project))
      &&(!term||[x.contact_id,x.organization,x.aliases,x.contact_name,x.phone,x.secondary_phone,x.service_group,
        x.work_scope,x.project_area].some(v=>String(v||'').toLocaleLowerCase('th-TH').replace(/[\s()+\-]/g,'').includes(term))))
  },[rows,query,category,group,project])

  const duplicate=useMemo(()=>{
    const values=[form.phone,form.secondary_phone].map(normalizedPhone).filter(Boolean)
    return rows.find(x=>x.contact_id!==editing?.contact_id&&
      [x.phone,x.secondary_phone].some(phone=>phone&&values.includes(normalizedPhone(phone))))
  },[rows,form.phone,form.secondary_phone,editing])
  const edit=(value:ContactEntry|null)=>{
    setForm(value?{category:value.category,service_group:value.service_group,organization:value.organization,
      contact_name:value.contact_name,phone:value.phone,work_scope:value.work_scope,project_area:value.project_area,
      review_note:value.review_note,secondary_phone:value.secondary_phone,active:value.active,aliases:value.aliases}:{...blank})
    setEditing(value);setConfirm(false);setError('');setSuccess('')
  }
  const change=(key:keyof EditableContact,value:string)=>setForm(v=>({...v,[key]:value}))
  async function save(){
    if(!canManage||saving||duplicate||!confirm)return
    setSaving(true);setError('');setSuccess('')
    try{
      const session=await getSupabase().auth.getSession()
      const token=session.data.session?.access_token
      if(!token)throw new Error('unauthorized')
      const response=await fetch('/api/contact-book',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
        body:JSON.stringify({contactId:editing?.contact_id||null,expectedVersion:version,contact:form}),cache:'no-store'})
      const result=await response.json()
      if(!response.ok)throw new Error(result.error||'contact_book_request_failed')
      if(!result.driveVerified)throw new Error('contact_drive_verification_failed')
      setEditing(undefined);setConfirm(false)
      setSuccess('บันทึกและตรวจสอบข้อมูลในไฟล์ Drive เรียบร้อยแล้ว · '+result.record.contact_id)
      await reload()
    }catch(e){setError(errorInThai(e instanceof Error?e.message:String(e)))}finally{setSaving(false)}
  }

  return <AppShell>
    <PageHeader title="Contact Book" subtitle="ทะเบียนผู้รับเหมาและร้านค้า • ค้นหาและจัดการรายชื่อผู้ติดต่อ"
      action={<div className={styles.headerActions}>
        <div className={styles.freshness}><small>อัพเดทล่าสุด</small><b>{dateTimeTH(updatedAt)}</b></div>
      </div>}/>
    {success&&<p role="status" className={styles.success}>{success}</p>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {!ready||!permissions?<p className="panel">กำลังตรวจสอบสิทธิ์…</p>
    :!canView?<p className="panel" role="alert">ไม่มีสิทธิ์เข้าถึง Contact Book</p>
    :<>
      <section className={styles.filters} aria-label="ค้นหา Contact Book">
        <div className={styles.filterRow}>
          <label className={styles.searchLabel}>ค้นหาชื่อบริษัท / เบอร์โทร / งาน / โครงการ
            <input aria-label="ค้นหาชื่อบริษัท เบอร์โทร ประเภทงาน หรือโครงการ" value={query}
              placeholder="เช่น TTM, 081…, Plot 6, งานอลูมิเนียม" onChange={e=>setQuery(e.target.value)}/>
          </label>
          <label>ประเภท
            <select aria-label="ประเภทผู้ติดต่อ" value={category} onChange={e=>setCategory(e.target.value)}>
              <option value="">ทุกประเภท</option><option>ผู้รับเหมา</option><option>ร้านค้า</option>
            </select>
          </label>
          <label>ประเภทงาน
            <select aria-label="ประเภทงาน" value={group} onChange={e=>setGroup(e.target.value)}>
              <option value="">ทุกประเภทงาน</option>{groups.map(g=><option key={g}>{g}</option>)}
            </select>
          </label>
          <label>โครงการ
            <select aria-label="โครงการ" value={project} onChange={e=>setProject(e.target.value)}>
              <option value="">ทุกโครงการ</option>{projects.map(p=><option key={p}>{p}</option>)}
            </select>
          </label>
          <button className="button" onClick={()=>{setQuery('');setCategory('');setGroup('');setProject('')}}>ล้างตัวกรอง</button>
        </div>
        <div className={styles.filterBottom}>
          <span>{loading?'กำลังโหลดข้อมูล…':`แสดง ${filtered.length} จาก ${rows.length} รายชื่อ`}</span>
          <div className={styles.actions}>
            <button className="button" disabled={loading} onClick={()=>void reload()}>โหลดข้อมูลล่าสุด</button>
            {canManage&&<button className="button primary" disabled={loading||!version} onClick={()=>edit(null)}>+ เพิ่มรายชื่อ</button>}
          </div>
        </div>
      </section>
      <section className={`panel ${styles.listPanel}`} aria-label="ตารางรายชื่อผู้ติดต่อ">
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="เลื่อนดูตาราง Contact Book โดยหัวตารางตรึงอยู่ด้านบน">
          <table className={styles.table}>
            <thead><tr><th>บริษัท / ทีม</th><th>ประเภท / งาน</th><th>โครงการ</th><th>ผู้ติดต่อ</th><th>เบอร์โทร</th><th>หมายเหตุ</th>{canManage&&<th className={styles.editCol}>จัดการ</th>}</tr></thead>
            <tbody>
              {filtered.map(item=><tr key={item.contact_id}>
                <td><b>{item.organization}</b><small>{item.contact_id}{item.aliases?' · '+item.aliases:''}</small></td>
                <td><span className={styles.category}>{item.category}</span><small>{item.service_group}</small><small>{item.work_scope}</small></td>
                <td>{item.project_area||'-'}</td>
                <td>{item.contact_name||'-'}</td>
                <td><a className={styles.phone} href={`tel:${normalizedPhone(item.phone)}`}>{item.phone}</a>{item.secondary_phone&&<small>{item.secondary_phone}</small>}</td>
                <td><small>{item.verified_status}</small>{item.review_note&&<small>{item.review_note}</small>}</td>
                {canManage&&<td className={styles.editCol}><button className="button" onClick={()=>edit(item)}>แก้ไข</button></td>}
              </tr>)}
              {!loading&&filtered.length===0&&<tr><td colSpan={canManage?7:6} style={{textAlign:'center',padding:22}}>ไม่พบข้อมูลตามเงื่อนไข</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <p className={styles.footer}>ข้อมูลมาจาก Contact Book บน Google Drive · เบอร์ที่ระบุว่า “ยังไม่โทรยืนยัน” ควรตรวจสอบกับผู้ติดต่อก่อนใช้งาน</p>
    </>}
    {editing!==undefined&&canManage&&<div className={styles.backdrop} onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setEditing(undefined)}}>
      <section data-contact-book-editor className={styles.dialog} role="dialog" aria-modal="true" aria-label={editing?'แก้ไขรายชื่อ':'เพิ่มรายชื่อ'}>
        <div className={styles.dialogTop}><div><h2>{editing?'แก้ไขรายชื่อ':'เพิ่มรายชื่อใหม่'}</h2><p>ตรวจสอบข้อมูลก่อนยืนยันบันทึกลง Google Drive</p></div><button type="button" className="button" disabled={saving} onClick={()=>{setEditing(undefined);setConfirm(false)}}>ปิด</button></div>
        <div className={styles.formGrid}>
          <label>ประเภท<select value={form.category} onChange={e=>change('category',e.target.value)}><option>ผู้รับเหมา</option><option>ร้านค้า</option></select></label>
          <label>ประเภทงาน<input value={form.service_group} onChange={e=>change('service_group',e.target.value)}/></label>
          <label>บริษัท / ทีม *<input required value={form.organization} onChange={e=>change('organization',e.target.value)}/></label>
          <label>ชื่อผู้ติดต่อ *<input required value={form.contact_name} onChange={e=>change('contact_name',e.target.value)}/></label>
          <label>เบอร์โทรหลัก *<input required inputMode="tel" value={form.phone} onChange={e=>change('phone',e.target.value)}/></label>
          <label>เบอร์โทรสำรอง<input inputMode="tel" value={form.secondary_phone} onChange={e=>change('secondary_phone',e.target.value)}/></label>
          <label>งานที่รับผิดชอบ *<input required value={form.work_scope} onChange={e=>change('work_scope',e.target.value)}/></label>
          <label>โครงการ / พื้นที่ *<input required value={form.project_area} onChange={e=>change('project_area',e.target.value)}/></label>
          <label>ชื่อเรียกอื่น<input value={form.aliases} onChange={e=>change('aliases',e.target.value)}/></label>
          <label>สถานะ<select value={form.active} onChange={e=>change('active',e.target.value)}><option value="ใช่">ใช้งาน</option><option value="ไม่ใช่">ไม่ใช้งาน</option></select></label>
          <label className={styles.full}>หมายเหตุ<textarea rows={3} value={form.review_note} onChange={e=>change('review_note',e.target.value)}/></label>
        </div>
        {duplicate&&<p role="alert" className={styles.error}>พบเบอร์ซ้ำ: {duplicate.organization} ({duplicate.contact_id})</p>}
        {error&&<p role="alert" className={styles.error}>{error}</p>}
        {confirm?<div className={styles.confirm} role="region" aria-label="ยืนยันก่อนบันทึก">
          <b>ตรวจสอบข้อมูลที่จะบันทึก</b>
          <p>{form.organization} · {form.contact_name} · {form.phone}</p>
          <p>{form.category} / {form.work_scope} / {form.project_area}</p>
          <p>ระบบจะตรวจเบอร์ซ้ำ ตรวจเวอร์ชันไฟล์ และอ่านข้อมูลจาก Drive กลับเพื่อยืนยัน</p>
          <button className="button primary" disabled={saving||!!duplicate} onClick={()=>void save()}>{saving?'กำลังบันทึกและตรวจสอบ Drive…':'ยืนยันบันทึกข้อมูล'}</button>{' '}
          <button className="button" disabled={saving} onClick={()=>setConfirm(false)}>กลับไปแก้ไข</button>
        </div>:<div className={styles.dialogActions}>
          <button className="button" disabled={saving} onClick={()=>setEditing(undefined)}>ยกเลิก</button>
          <button className="button primary" disabled={saving||!!duplicate||!form.organization.trim()||!form.contact_name.trim()||!form.phone.trim()||!form.work_scope.trim()||!form.project_area.trim()}
            onClick={()=>setConfirm(true)}>ตรวจสอบก่อนบันทึก</button>
        </div>}
      </section>
    </div>}
  </AppShell>
}
