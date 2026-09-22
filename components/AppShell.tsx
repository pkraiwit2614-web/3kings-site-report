'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import BrandLogo from '@/components/BrandLogo'

const baseNav = [
  ['/', 'Dashboard'],
  ['/reports/new', 'รายงานการทำงานประจำวัน'],
  ['/schedule', 'แผนงานที่กำหนด'],
  ['/materials', 'วัสดุอุปกรณ์และผู้รับเหมา'],
  ['/site-photos', 'รูปภาพหน้างาน'],
  ['/reports', 'ประวัติรายงานการทำงานประจำวัน'],
  ['/procurement', 'การจัดซื้อ/จัดจ้าง'],
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
  const nav = useMemo(() => role === 'manager' ? [...baseNav, ['/users', 'User & Access']] : baseNav, [role])
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
      <div className="brand"><BrandLogo className="brand-logo"/><div><b>3 Kings Construction</b><small>Site Report V3.4</small></div></div>
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

    <style jsx global>{`
      .portfolio-status-strip>button:nth-child(1)>b,
      .portfolio-status-strip>button:nth-child(2)>b,
      .portfolio-status-strip>button:nth-child(3)>b,
      .portfolio-status-strip>button:nth-child(1)>small,
      .portfolio-status-strip>button:nth-child(2)>small,
      .portfolio-status-strip>button:nth-child(3)>small{font-size:0}
      .portfolio-status-strip>button:nth-child(1)>b::after{content:'ตามแผน';font-size:14px}
      .portfolio-status-strip>button:nth-child(2)>b::after{content:'เสี่ยงล่าช้า';font-size:14px}
      .portfolio-status-strip>button:nth-child(3)>b::after{content:'ล่าช้า';font-size:14px}
      .portfolio-status-strip>button:nth-child(1)>small::after{content:'Δ ≥ -3% • คลิกดูรายละเอียด';font-size:10px}
      .portfolio-status-strip>button:nth-child(2)>small::after{content:'Δ -10% ถึง < -3% • คลิกดูรายละเอียด';font-size:10px}
      .portfolio-status-strip>button:nth-child(3)>small::after{content:'Δ < -10% • คลิกดูรายละเอียด';font-size:10px}
      #site-performance a[href^='/projects/']{grid-template-columns:80px minmax(0,1fr)!important;gap:8px!important;overflow:hidden;min-width:0}
      #site-performance a[href^='/projects/']>svg{width:80px!important;height:80px!important;max-width:100%}
      #site-performance a[href^='/projects/']>div{min-width:0}
      #site-performance a[href^='/projects/'] .row.between{flex-direction:column;align-items:flex-start;gap:5px;min-width:0}
      #site-performance a[href^='/projects/'] .row.between>div{min-width:0;max-width:100%}
      #site-performance a[href^='/projects/'] .row.between small{white-space:normal;overflow-wrap:anywhere}
      #site-performance a[href^='/projects/'] .badge{margin-top:2px;max-width:124px}
      #site-performance a[href^='/projects/'] div[style*='grid-template-columns']{min-width:0}
      #site-performance a[href^='/projects/'] div[style*='grid-template-columns']>div{min-width:0;overflow:hidden}
      #site-performance a[href^='/projects/'] div[style*='grid-template-columns'] small{white-space:nowrap;font-size:9px}
      @media(max-width:760px){
        #site-performance a[href^='/projects/']{grid-template-columns:72px minmax(0,1fr)!important;padding:10px!important}
        #site-performance a[href^='/projects/']>svg{width:72px!important;height:72px!important}
      }
    `}</style>
  </div>
}
