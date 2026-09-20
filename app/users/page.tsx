'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import { getSupabase } from '@/lib/supabase'

type Profile = {
  user_id: string
  email: string | null
  full_name: string | null
  phone: string | null
  role: string
  active: boolean
  created_at: string
}

export default function UsersPage() {
  const [rows, setRows] = useState<Profile[]>([])
  const [me, setMe] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const load = async () => {
    const s = getSupabase()
    const { data: userData } = await s.auth.getUser()
    setMe(userData.user?.id || '')
    const { data, error } = await s.from('profiles').select('user_id,email,full_name,phone,role,active,created_at').order('created_at')
    if (error) setMessage(error.message)
    setRows((data || []) as Profile[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const save = async (row: Profile, role: string, active: boolean) => {
    setMessage('')
    const s = getSupabase()
    const { error } = await s.rpc('admin_set_profile_access', {
      target_user: row.user_id,
      new_role: role,
      new_active: active
    })
    if (error) { setMessage(error.message); return }
    setMessage(`อัปเดต ${row.full_name || row.email || row.user_id} เรียบร้อย`)
    await load()
  }

  return <AppShell>
    <PageHeader title="Users & Access" subtitle="Manager อนุมัติบัญชีใหม่และกำหนดสิทธิ์การใช้งาน"/>
    {message && <div className="notice">{message}</div>}
    {loading ? <div className="panel">กำลังโหลดผู้ใช้งาน…</div> : <div className="panel table-wrap"><table>
      <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>{rows.map(row => <UserRow key={row.user_id} row={row} isMe={row.user_id===me} onSave={save}/>)}</tbody>
    </table></div>}
    <p className="muted small">บัญชีใหม่หลัง Manager คนแรกจะเริ่มต้นเป็น Foreman / Inactive และยังอ่านข้อมูลโครงการไม่ได้จนกว่าจะได้รับการอนุมัติ</p>
  </AppShell>
}

function UserRow({ row, isMe, onSave }: { row: Profile; isMe: boolean; onSave: (row: Profile, role: string, active: boolean) => Promise<void> }) {
  const [role,setRole] = useState(row.role)
  const [active,setActive] = useState(row.active)
  const [saving,setSaving] = useState(false)
  const changed = role !== row.role || active !== row.active

  const submit = async () => {
    setSaving(true)
    await onSave(row, role, active)
    setSaving(false)
  }

  return <tr>
    <td><b>{row.full_name || '-'}</b><small>{row.email || row.user_id}</small>{isMe && <small>บัญชีของคุณ</small>}</td>
    <td><select value={role} onChange={e=>setRole(e.target.value)} disabled={isMe}><option value="manager">Manager</option><option value="engineer">Engineer</option><option value="foreman">Foreman</option><option value="viewer">Viewer</option></select></td>
    <td><label className="inline-toggle"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} disabled={isMe}/><StatusBadge value={active?'Active':'Inactive'}/></label></td>
    <td><button className="button primary" disabled={isMe||!changed||saving} onClick={submit}>{saving?'Saving…':'Save'}</button></td>
  </tr>
}
