'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

type ProfileLite = {
  user_id: string
  username: string | null
  email: string | null
  full_name: string | null
  role: string
}

type ActivityRow = {
  id: string
  user_id: string
  client_session_id: string
  event_type: string
  path: string | null
  action: string | null
  target: string | null
  metadata: Record<string, unknown> | null
  user_agent: string | null
  created_at: string
}

const PAGE_SIZE = 200

const eventLabel: Record<string, string> = {
  login: 'Login',
  logout: 'Logout',
  app_open: 'เปิด Web App',
  page_view: 'เปิดหน้า',
  click: 'คลิก',
  submit: 'Submit',
  control_change: 'เปลี่ยนตัวเลือก',
  data_change: 'แก้ไข / ยืนยันข้อมูล',
}

function formatBangkok(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function bangkokDateKey(value: string | Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function deviceLabel(userAgent: string | null) {
  const ua = userAgent || ''
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android'
  if (/Mobile/i.test(ua)) return 'Mobile'
  if (ua) return 'Desktop'
  return '-'
}

function detailText(row: ActivityRow) {
  const href = typeof row.metadata?.href === 'string' ? row.metadata.href : ''
  const parts = [row.action, href && href !== row.path ? `→ ${href}` : '', row.target]
  return parts.filter(Boolean).join(' · ') || '-'
}

export default function ActivityLogPanel({ profiles }: { profiles: ProfileLite[] }) {
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [message, setMessage] = useState('')
  const [userFilter, setUserFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [search, setSearch] = useState('')

  const profileMap = useMemo(() => new Map(profiles.map(profile => [profile.user_id, profile])), [profiles])

  const load = async (reset = true) => {
    reset ? setLoading(true) : setLoadingMore(true)
    setMessage('')
    try {
      const offset = reset ? 0 : rows.length
      const { data, error } = await getSupabase()
        .from('activity_logs')
        .select('id,user_id,client_session_id,event_type,path,action,target,metadata,user_agent,created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) throw error
      const next = (data || []) as ActivityRow[]
      setRows(current => reset ? next : [...current, ...next])
      setHasMore(next.length === PAGE_SIZE)
    } catch (error: any) {
      setMessage(error?.message || 'โหลด Activity Log ไม่สำเร็จ')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => { void load(true) }, [])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter(row => {
      if (userFilter !== 'all' && row.user_id !== userFilter) return false
      if (eventFilter !== 'all' && row.event_type !== eventFilter) return false
      if (!query) return true
      const profile = profileMap.get(row.user_id)
      const haystack = [
        profile?.full_name,
        profile?.username,
        profile?.email,
        row.event_type,
        row.path,
        row.action,
        row.target,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [eventFilter, profileMap, rows, search, userFilter])

  const todayKey = bangkokDateKey(new Date())
  const todayRows = rows.filter(row => bangkokDateKey(row.created_at) === todayKey)
  const activeUsersToday = new Set(todayRows.map(row => row.user_id)).size

  if (loading) return <div className="panel">กำลังโหลด Activity Log…</div>

  return <>
    {message && <div className="notice" style={{marginBottom:12}}>{message}</div>}

    <div className="resource-kpis" style={{marginBottom:12}}>
      <div><span>Activity วันนี้</span><b>{todayRows.length.toLocaleString()}</b></div>
      <div><span>User วันนี้</span><b>{activeUsersToday}</b></div>
      <div><span>รายการที่โหลด</span><b>{rows.length.toLocaleString()}</b></div>
      <div><span>ล่าสุด</span><b style={{fontSize:12}}>{rows[0] ? formatBangkok(rows[0].created_at) : '-'}</b></div>
    </div>

    <div className="panel" style={{marginBottom:12}}>
      <div className="form-grid" style={{alignItems:'end'}}>
        <label>User
          <select value={userFilter} onChange={event=>setUserFilter(event.target.value)}>
            <option value="all">ทั้งหมด</option>
            {profiles.map(profile => <option key={profile.user_id} value={profile.user_id}>{profile.full_name || profile.username || profile.email || profile.user_id}</option>)}
          </select>
        </label>
        <label>Activity
          <select value={eventFilter} onChange={event=>setEventFilter(event.target.value)}>
            <option value="all">ทั้งหมด</option>
            {Object.entries(eventLabel).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>ค้นหา
          <input value={search} onChange={event=>setSearch(event.target.value)} placeholder="ชื่อ User / หน้า / ปุ่ม" />
        </label>
        <button type="button" className="button" onClick={()=>void load(true)}>Refresh</button>
      </div>
    </div>

    <div className="panel table-wrap">
      <table>
        <thead><tr><th>เวลา</th><th>User</th><th>Activity</th><th>หน้า</th><th>รายละเอียด</th><th>อุปกรณ์</th></tr></thead>
        <tbody>
          {filtered.map(row => {
            const profile = profileMap.get(row.user_id)
            return <tr key={row.id}>
              <td style={{whiteSpace:'nowrap'}}>{formatBangkok(row.created_at)}</td>
              <td><b>{profile?.full_name || profile?.username || profile?.email || 'Unknown'}</b><small>{profile?.username || profile?.email || row.user_id}</small></td>
              <td><span className="badge">{eventLabel[row.event_type] || row.event_type}</span></td>
              <td style={{fontFamily:'monospace',fontSize:11}}>{row.path || '-'}</td>
              <td style={{minWidth:220,maxWidth:420,overflowWrap:'anywhere'}}>{detailText(row)}</td>
              <td>{deviceLabel(row.user_agent)}</td>
            </tr>
          })}
          {filtered.length === 0 && <tr><td colSpan={6} className="muted">ไม่พบ Activity ตามตัวกรอง</td></tr>}
        </tbody>
      </table>
    </div>

    <div className="row between" style={{gap:10,marginTop:10,flexWrap:'wrap'}}>
      <span className="muted small">บันทึกเฉพาะพฤติกรรมการใช้งาน ไม่เก็บค่าที่พิมพ์ในช่องกรอกหรือรหัสผ่าน</span>
      {hasMore && <button type="button" className="button" disabled={loadingMore} onClick={()=>void load(false)}>{loadingMore ? 'กำลังโหลด…' : 'โหลดเพิ่ม'}</button>}
    </div>
  </>
}
