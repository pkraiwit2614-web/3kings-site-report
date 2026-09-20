'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import BrandLogo from '@/components/BrandLogo'

const baseNav = [
  ['/', 'Dashboard'],
  ['/reports/new', 'รายงานการทำงานประจำวัน'],
  ['/schedule', 'กำหนดแผนงาน'],
  ['/reports', 'ประวัติรายงานการทำงานประจำวัน'],
  ['/materials', 'วัสดุอุปกรณ์และผู้รับเหมา'],
  ['/procurement', 'การจัดซื้อจัดจ้าง'],
  ['/weekly', 'รายงานการทำงานประจำสัปดาห์']
]

const mobilePrimary = [
  ['/', 'Dashboard'],
  ['/reports/new', 'รายงาน'],
  ['/schedule', 'แผนงาน'],
  ['/materials', 'วัสดุ']
]

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname(); const router = useRouter()
  const [userName, setUserName] = useState('')
  const [role, setRole] = useState('')
  const [ready, setReady] = useState(false)
  const [mobileMore, setMobileMore] = useState(false)
  const nav = useMemo(() => role === 'manager' ? [...baseNav, ['/users', 'Users & Access']] : baseNav, [role])
  const extraNav = useMemo(() => nav.filter(([href]) => !mobilePrimary.some(([mobileHref]) => mobileHref === href)), [nav])

  useEffect(() => {
    const supabase = getSupabase()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('full_name,role,active').eq('user_id', data.user.id).maybeSingle()
      if (!profile?.active) { await supabase.auth.signOut(); router.replace('/login'); return }
      setUserName(profile.full_name || data.user.email || 'User'); setRole(profile.role || 'user'); setReady(true)
    })
  }, [router])

  useEffect(() => { setMobileMore(false) }, [path])

  const signOut = async () => {
    setMobileMore(false)
    await getSupabase().auth.signOut()
    router.replace('/login')
  }

  if (!ready) return <div className="loading-screen">กำลังโหลดระบบ…</div>

  const extraActive = extraNav.some(([href]) => path === href)

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><BrandLogo className="brand-logo"/><div><b>3 Kings Construction</b><small>Site Report V3.3</small></div></div>
      <nav>{nav.map(([href,label]) => <Link key={href} className={path===href?'active':''} href={href}>{label}</Link>)}</nav>
      <div className="userbox"><b>{userName}</b><span>{role}</span><button onClick={signOut}>ออกจากระบบ</button></div>
    </aside>

    <main className="main">{children}</main>

    {mobileMore && <>
      <button className="mobile-more-backdrop" aria-label="ปิดเมนูเพิ่มเติม" onClick={()=>setMobileMore(false)} />
      <section className="mobile-more-sheet" aria-label="เมนูเพิ่มเติม">
        <div className="mobile-more-handle" />
        <div className="mobile-more-user">
          <div><b>{userName}</b><span>{role}</span></div>
          <button type="button" onClick={()=>setMobileMore(false)}>ปิด</button>
        </div>
        <div className="mobile-more-links">
          {extraNav.map(([href,label]) => <Link key={href} className={path===href?'active':''} href={href}>{label}<span>›</span></Link>)}
        </div>
        <button className="mobile-logout" type="button" onClick={signOut}>ออกจากระบบ</button>
      </section>
    </>}

    <nav className="mobile-nav" aria-label="เมนูหลักบนมือถือ">
      {mobilePrimary.map(([href,label]) => <Link key={href} className={path===href?'active':''} href={href}>{label}</Link>)}
      <button type="button" className={(mobileMore||extraActive)?'active':''} onClick={()=>setMobileMore(v=>!v)}>เพิ่มเติม</button>
    </nav>
  </div>
}
