'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import OwnerOnlyGate from '@/components/OwnerOnlyGate'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import { getSupabase } from '@/lib/supabase'
import { OWNER_USER_ID } from '@/lib/accessControl'

type Profile = {
  user_id: string
  username: string | null
  email: string | null
  full_name: string | null
  phone: string | null
  role: string
  active: boolean
  created_at: string
  updated_at?: string
}

type Credential = {
  username: string
  password: string
  role: string
  full_name: string
}

const roleLabel: Record<string,string> = {
  manager: 'Owner',
  admin: 'Admin',
  viewer: 'Viewer',
  defect_contributor: 'Defect Contributor',
  engineer: 'Legacy Engineer',
  foreman: 'Legacy Viewer',
  payroll: 'Legacy Payroll',
}

function makePassword(username = 'USER') {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  const random = Array.from(bytes, b => alphabet[b % alphabet.length]).join('')
  return `K3-${username.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8) || 'USER'}-${random}!`
}

async function adminAction(action: string, payload: Record<string,unknown> = {}) {
  const { data, error } = await getSupabase().functions.invoke('admin-users', { body: { action, ...payload } })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.error || 'ไม่สามารถดำเนินการได้')
  return data
}

function edgeCompatibleRole(role:string){
  if(role==='admin')return 'engineer'
  if(role==='defect_contributor')return 'viewer'
  return role==='viewer'?role:'viewer'
}

async function setCanonicalRole(userId:string,role:string){
  const {error}=await getSupabase().rpc('owner_set_profile_role',{p_user_id:userId,p_role:role})
  if(error)throw error
}

export default function UsersPage() {
  return <OwnerOnlyGate><AppShell><UsersContent/></AppShell></OwnerOnlyGate>
}

function UsersContent() {
  const [rows, setRows] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('viewer')
  const [password, setPassword] = useState(makePassword())

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const data = await adminAction('list')
      setRows((data.users || []) as Profile[])
    } catch (err:any) {
      setMessage(err?.message || 'โหลดรายชื่อผู้ใช้งานไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const numberedCount = useMemo(() => rows.filter(r => /^USER\d{2}$/i.test(r.username || '')).length, [rows])

  const seed = async () => {
    if (!window.confirm('สร้าง USER01–USER20 และ AI-VIEWER ตอนนี้? บัญชีที่มีอยู่แล้วจะไม่ถูกสร้างซ้ำ')) return
    setSeeding(true)
    setMessage('')
    setCredentials([])
    try {
      throw new Error('การสร้างชุด USER01–20 ถูกปิดไว้สำหรับ RBAC ใหม่ • กรุณาสร้าง/จัดสิทธิ์เป็นรายบัญชีเพื่อไม่เปลี่ยนสิทธิ์บัญชีเดิมอัตโนมัติ')
      const data = await adminAction('seed_initial')
      setCredentials((data.credentials || []) as Credential[])
      setMessage(`สร้างบัญชีใหม่ ${data.credentials?.length || 0} บัญชี${data.skipped?.length ? ` • ข้ามบัญชีเดิม ${data.skipped.length}` : ''}`)
      await load()
    } catch (err:any) {
      setMessage(err?.message || 'สร้างบัญชีเริ่มต้นไม่สำเร็จ')
    } finally {
      setSeeding(false)
    }
  }

  const create = async () => {
    const cleanUsername = username.trim().toUpperCase()
    if (!cleanUsername || !fullName.trim() || password.length < 8) {
      setMessage('กรุณากรอก Username, ชื่อ และรหัสผ่านอย่างน้อย 8 ตัวอักษร')
      return
    }
    setCreating(true)
    setMessage('')
    try {
      const data = await adminAction('create', { username: cleanUsername, full_name: fullName.trim(), role:edgeCompatibleRole(role), password })
      await setCanonicalRole(String(data.user?.user_id||''),role)
      setCredentials([{ username: cleanUsername, password, role, full_name: fullName.trim() }])
      setMessage(`สร้าง ${cleanUsername} เรียบร้อย พร้อมนำ Username / Password ส่งให้ผู้ใช้งานได้ทันที`)
      setUsername('')
      setFullName('')
      setRole('viewer')
      setPassword(makePassword())
      setShowCreate(false)
      await load()
    } catch (err:any) {
      setMessage(err?.message || 'สร้างผู้ใช้งานไม่สำเร็จ')
    } finally {
      setCreating(false)
    }
  }

  const copyCredential = async (item: Credential) => {
    await navigator.clipboard.writeText(`3 Kings Site Report\nUsername: ${item.username}\nPassword: ${item.password}`)
    setMessage(`คัดลอกข้อมูลเข้าใช้งาน ${item.username} แล้ว`)
  }

  const copyAll = async () => {
    const text = credentials.map(x => `${x.username}\t${x.password}\t${roleLabel[x.role] || x.role}`).join('\n')
    await navigator.clipboard.writeText(text)
    setMessage('คัดลอก Username / Password ชุดนี้แล้ว')
  }

  return <>
    <PageHeader title="User & Access" subtitle="สร้างบัญชีให้ทีมงาน • กำหนดสิทธิ์ • Reset Password • ปิดบัญชี"/>

    <div className="panel" style={{marginBottom:14}}>
      <div className="row between" style={{gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
        <div>
          <b>บัญชีเริ่มต้นสำหรับหน้างาน</b>
          <div className="muted small" style={{marginTop:5,lineHeight:1.6}}>
            USER01–USER10 = Admin สำหรับบัญชีที่สร้างใหม่ • USER11–USER20 = Viewer • AI-VIEWER = Viewer • บัญชีเดิมจะไม่ถูกเปลี่ยนสิทธิ์อัตโนมัติ
          </div>
          <div className="muted small" style={{marginTop:3}}>สร้างแล้ว {numberedCount}/20 บัญชีแบบเลขลำดับ</div>
        </div>
        <div className="row" style={{gap:8,flexWrap:'wrap'}}>
          <button className="button" onClick={()=>setShowCreate(v=>!v)}>+ เพิ่มผู้ใช้งาน</button>
          <button className="button" onClick={seed} disabled title="RBAC ใหม่ไม่เปลี่ยนสิทธิ์บัญชีเดิมอัตโนมัติ">{seeding?'กำลังสร้าง…':'สร้างชุดบัญชี — ปิดไว้'}</button>
        </div>
      </div>
    </div>

    {showCreate && <div className="panel" style={{marginBottom:14}}>
      <b>เพิ่มผู้ใช้งาน</b>
      <div className="form-grid" style={{marginTop:12}}>
        <label>Username<input value={username} onChange={e=>setUsername(e.target.value.toUpperCase())} placeholder="เช่น USER21" /></label>
        <label>ชื่อแสดงผล<input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="ชื่อ / ชื่อเล่น" /></label>
        <label>สิทธิ์<select value={role} onChange={e=>setRole(e.target.value)}><option value="viewer">Viewer — ดูข้อมูล / Labour แต่ไม่เห็น Payroll</option><option value="admin">Admin — จัดการ Site Operations / Labour / Payroll</option><option value="defect_contributor">Defect Contributor — เฉพาะ Defect</option></select></label>
        <label>รหัสผ่าน<div className="row" style={{gap:8}}><input value={password} onChange={e=>setPassword(e.target.value)} /><button type="button" className="button" onClick={()=>setPassword(makePassword(username))}>สุ่มใหม่</button></div></label>
      </div>
      <div className="row" style={{gap:8,marginTop:12}}><button className="button primary" onClick={create} disabled={creating}>{creating?'กำลังสร้าง…':'สร้างบัญชี'}</button><button className="button" onClick={()=>setShowCreate(false)}>ยกเลิก</button></div>
    </div>}

    {message && <div className="notice" style={{marginBottom:14}}>{message}</div>}

    {credentials.length>0 && <div className="panel" style={{marginBottom:14,border:'1px solid #d9c385'}}>
      <div className="row between" style={{gap:12,flexWrap:'wrap'}}><div><b>ข้อมูลสำหรับส่งให้ผู้ใช้งาน</b><div className="muted small">รหัสผ่านจะแสดงจากการสร้าง/Reset ครั้งนี้เท่านั้น ควร Copy เก็บไว้ก่อนออกจากหน้านี้</div></div><button className="button" onClick={copyAll}>Copy ทั้งชุด</button></div>
      <div className="table-wrap" style={{marginTop:10}}><table><thead><tr><th>Username</th><th>Password</th><th>สิทธิ์</th><th></th></tr></thead><tbody>{credentials.map(item=><tr key={item.username}><td><b>{item.username}</b><small>{item.full_name}</small></td><td style={{fontFamily:'monospace'}}>{item.password}</td><td>{roleLabel[item.role] || item.role}</td><td><button className="button" onClick={()=>copyCredential(item)}>Copy</button></td></tr>)}</tbody></table></div>
    </div>}

    {loading ? <div className="panel">กำลังโหลดผู้ใช้งาน…</div> : <div className="panel table-wrap"><table>
      <thead><tr><th>User</th><th>ชื่อ</th><th>Role</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>{rows.map(row => <UserRow key={row.user_id} row={row} onChanged={load} onCredential={(c)=>setCredentials([c])} onMessage={setMessage}/>)}</tbody>
    </table></div>}
    <p className="muted small" style={{lineHeight:1.65}}>บัญชีที่สร้างจากหน้านี้เข้าใช้งานด้วย Username + Password ได้ทันที ไม่มีขั้นตอนยืนยันอีเมล • สิทธิ์ถูกบังคับทั้ง Route และฐานข้อมูล ไม่ใช่เพียงซ่อนเมนู</p>
  </>
}

function UserRow({ row, onChanged, onCredential, onMessage }: { row: Profile; onChanged:()=>Promise<void>; onCredential:(c:Credential)=>void; onMessage:(s:string)=>void }) {
  const owner = row.user_id === OWNER_USER_ID
  const [username,setUsername] = useState(row.username || '')
  const [name,setName] = useState(row.full_name || '')
  const [role,setRole] = useState(row.role)
  const [active,setActive] = useState(row.active)
  const [saving,setSaving] = useState(false)
  const changed = username !== (row.username || '') || name !== (row.full_name || '') || role !== row.role || active !== row.active

  const save = async () => {
    setSaving(true); onMessage('')
    try {
      await adminAction('update',{user_id:row.user_id,username:username.trim().toUpperCase()||null,full_name:name.trim(),role:edgeCompatibleRole(role),active})
      await setCanonicalRole(row.user_id,role)
      onMessage(`อัปเดต ${username || name || row.email || 'ผู้ใช้งาน'} เรียบร้อย`)
      await onChanged()
    } catch(err:any){ onMessage(err?.message || 'อัปเดตไม่สำเร็จ') }
    finally{ setSaving(false) }
  }

  const resetPassword = async () => {
    const next = makePassword(username || 'USER')
    if(!window.confirm(`Reset Password ของ ${username || name || 'บัญชีนี้'}?`)) return
    try{
      await adminAction('reset_password',{user_id:row.user_id,password:next})
      onCredential({username:username || row.email || 'USER',password:next,role,full_name:name || username})
      onMessage(`Reset Password ของ ${username || name} เรียบร้อย กรุณา Copy รหัสใหม่ส่งให้ผู้ใช้งาน`)
    }catch(err:any){onMessage(err?.message || 'Reset Password ไม่สำเร็จ')}
  }

  return <tr>
    <td><input value={username} onChange={e=>setUsername(e.target.value.toUpperCase())} disabled={owner || !row.username} placeholder={row.email || '-'} style={{minWidth:112}}/><small>{row.email || (row.username?'บัญชีภายใน':'')}</small></td>
    <td><input value={name} onChange={e=>setName(e.target.value)} disabled={owner} style={{minWidth:120}}/></td>
    <td><select value={role} onChange={e=>setRole(e.target.value)} disabled={owner}>{owner?<option value="manager">Owner</option>:<>{!['admin','viewer','defect_contributor'].includes(role)&&<option value={role}>{roleLabel[role]||role} — Legacy</option>}<option value="admin">Admin</option><option value="viewer">Viewer</option><option value="defect_contributor">Defect Contributor</option></>}</select></td>
    <td><label className="inline-toggle"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} disabled={owner}/><StatusBadge value={active?'Active':'Inactive'}/></label></td>
    <td><div className="row" style={{gap:6,flexWrap:'wrap'}}><button className="button primary" disabled={owner||!changed||saving} onClick={save}>{saving?'Saving…':'Save'}</button><button className="button" disabled={owner} onClick={resetPassword}>Reset Password</button></div></td>
  </tr>
}
