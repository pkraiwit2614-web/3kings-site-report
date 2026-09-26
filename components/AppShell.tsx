'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import BrandLogo from '@/components/BrandLogo'

const baseNav = [
  ['/', 'Dashboard'],
  ['/presentation', 'Executive Presentation'],
  ['/schedule', 'แผนงานที่กำหนด'],
  ['/materials', 'วัสดุ เครื่องมือและผู้รับเหมา'],
  ['/defects', 'Defect Report'],
  ['/reports/quick', 'รายงานการทำงานประจำวัน'],
  ['/site-photos', 'รูปภาพหน้างาน'],
  ['/reports', 'ประวัติรายงานการทำงานประจำวัน'],
  ['/procurement', 'การจัดซื้อ/จัดจ้าง'],
  ['/weekly', 'รายงานการทำงานประจำสัปดาห์']
]

const mobilePrimary = [
  ['/', 'Dashboard'],
  ['/presentation', 'Executive'],
  ['/schedule', 'แผนงาน'],
  ['/materials', 'วัสดุ/เครื่องมือ'],
  ['/reports/quick', 'รายงาน'],
  ['/site-photos', 'รูปหน้างาน']
]

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname(); const router = useRouter()
  const [userName, setUserName] = useState('')
  const [role, setRole] = useState('')
  const [ready, setReady] = useState(false)
  const [mobileMore, setMobileMore] = useState(false)
  const nav = useMemo(() => {
    const items=[...baseNav]
    if(role==='manager'||role==='engineer') items.push(['/photo-mapping','Photo Mapping'])
    items.push(['/data-health','Data Health'])
    if(role==='manager') items.push(['/users','User & Access'])
    return items
  }, [role])
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
      .dashboard-module{overflow:hidden}
      .dashboard-module .module-title{min-height:62px;padding:12px 14px;display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:11px;background:linear-gradient(135deg,#172a43,#213d5e);color:#fff}
      .dashboard-module .module-title>span{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:rgba(229,189,104,.16);border:1px solid rgba(229,189,104,.34);color:#f2cc79;font-size:12px!important;font-weight:800;line-height:1}
      .dashboard-module .module-title>div{min-width:0}
      .dashboard-module .module-title>div>b{display:block;color:#fff;font-size:13px;line-height:1.25;font-weight:800;letter-spacing:.035em}
      .dashboard-module .module-title>div>small{display:block;margin-top:4px;color:#c3d0df;font-size:10.5px;line-height:1.45;font-weight:500;letter-spacing:0}
      .dashboard-module .module-title>a{color:#f1cf84;font-size:10.5px;font-weight:700;white-space:nowrap}
      .dashboard-module .module-title>a:hover{color:#fff}
      .executive-section-title b,.dashboard-module h2{letter-spacing:-.01em}
      .executive-kpi span,.resource-kpis span{font-size:10.5px!important;font-weight:700!important;letter-spacing:.025em!important;text-transform:none!important}
      .executive-kpi b,.resource-kpis b{font-variant-numeric:tabular-nums}
      .portfolio-status-strip>button>b{font-size:13px!important;line-height:1.2;font-weight:800}
      .portfolio-status-strip>button>small{font-size:9.5px!important;line-height:1.4!important}
      .portfolio-status-strip>button>strong{font-variant-numeric:tabular-nums}
      .discipline-row b,.alert-row b,.resource-list b{font-weight:700}
      .discipline-row small,.alert-row small,.resource-list small{line-height:1.45}
      #site-performance a[href^='/projects/']{grid-template-columns:80px minmax(0,1fr)!important;gap:9px!important;overflow:hidden;min-width:0}
      #site-performance a[href^='/projects/']>svg{width:80px!important;height:80px!important;max-width:100%}
      #site-performance a[href^='/projects/']>div{min-width:0}
      #site-performance a[href^='/projects/'] .row.between{flex-direction:column;align-items:flex-start;gap:5px;min-width:0}
      #site-performance a[href^='/projects/'] .row.between>div{min-width:0;max-width:100%}
      #site-performance a[href^='/projects/'] .row.between small{white-space:normal;overflow-wrap:anywhere}
      #site-performance a[href^='/projects/'] .badge{margin-top:2px;max-width:124px}
      #site-performance a[href^='/projects/'] div[style*='grid-template-columns']{min-width:0}
      #site-performance a[href^='/projects/'] div[style*='grid-template-columns']>div{min-width:0;overflow:hidden}
      #site-performance a[href^='/projects/'] div[style*='grid-template-columns'] small{white-space:nowrap;font-size:9.5px}
      @media(max-width:760px){
        .dashboard-module .module-title{grid-template-columns:30px minmax(0,1fr);padding:11px 12px;min-height:58px}
        .dashboard-module .module-title>a{grid-column:2;margin-top:1px}
        .dashboard-module .module-title>span{width:28px;height:28px}
        #site-performance a[href^='/projects/']{grid-template-columns:72px minmax(0,1fr)!important;padding:10px!important}
        #site-performance a[href^='/projects/']>svg{width:72px!important;height:72px!important}
      }
    `}</style>
  </div>
}
