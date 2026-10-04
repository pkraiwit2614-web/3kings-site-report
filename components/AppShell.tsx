'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import BrandLogo from '@/components/BrandLogo'

type NavItem = [string,string]

const managementNav: NavItem[] = [
  ['/', 'Dashboard'],
  ['/presentation', 'Executive Presentation'],
  ['/schedule', 'แผนงานที่กำหนด'],
  ['/materials', 'วัสดุ เครื่องมือและผู้รับเหมา'],
  ['/defect-flow', 'Defect Report'],
  ['/reports', 'Site Operations'],
  ['/site-photos', 'รูปภาพหน้างาน'],
  ['/procurement', 'การจัดซื้อ/จัดจ้าง'],
  ['/weekly', 'รายงานการทำงานประจำสัปดาห์']
]

const reportUserNav: NavItem[] = [
  ['/', 'Dashboard'],
  ['/reports', 'Site Operations'],
  ['/schedule', 'แผนงานที่กำหนด'],
  ['/site-photos', 'รูปภาพหน้างาน'],
  ['/defect-flow', 'Defect Report'],
  ['/materials', 'วัสดุ เครื่องมือและผู้รับเหมา'],
  ['/procurement', 'การจัดซื้อ/จัดจ้าง'],
  ['/weekly', 'รายงานการทำงานประจำสัปดาห์'],
  ['/presentation', 'Executive Presentation']
]

const viewerNav: NavItem[] = [
  ['/', 'Dashboard'],
  ['/schedule', 'แผนงานที่กำหนด'],
  ['/site-photos', 'รูปภาพหน้างาน'],
  ['/defect-flow', 'Defect Report'],
  ['/materials', 'วัสดุ เครื่องมือและผู้รับเหมา'],
  ['/reports', 'Site Operations'],
  ['/procurement', 'การจัดซื้อ/จัดจ้าง'],
  ['/weekly', 'รายงานการทำงานประจำสัปดาห์'],
  ['/presentation', 'Executive Presentation']
]

const payrollNav: NavItem[] = [
  ['/reports/labour', 'Payroll Verification'],
  ['/reports', 'Site Operations'],
  ['/', 'Dashboard']
]

const MOBILE_PRIMARY_COUNT = 5
const mobileLabel: Record<string,string> = {
  '/': 'Dashboard',
  '/presentation': 'Executive',
  '/schedule': 'แผนงาน',
  '/materials': 'วัสดุ',
  '/defect-flow': 'Defect',
  '/site-photos': 'รูปหน้างาน',
  '/reports': 'Site Ops'
}

const DRIVE_WATCH_PATHS = new Set(['/', '/presentation', '/schedule', '/materials', '/site-photos', '/procurement', '/photo-mapping', '/data-health'])

function roleLabel(role:string,userName:string){
  if(userName.trim().toLowerCase()==='golf') return 'Site Supervisor'
  if(role==='manager') return 'Admin'
  if(role==='engineer') return 'Engineer'
  if(role==='foreman') return 'Site User · ดูข้อมูล'
  if(role==='payroll') return 'Payroll · Labour Verification'
  if(role==='viewer') return 'Viewer · ดูข้อมูล'
  return 'User'
}

function navIsActive(path:string,href:string){
  if(href==='/defect-flow') return path==='/defect-flow'||path==='/defects'
  if(href==='/reports/labour') return path==='/reports/labour'
  if(href==='/reports') return path==='/reports'||(path.startsWith('/reports/')&&path!=='/reports/labour')
  return path===href
}

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname(); const router = useRouter()
  const [userName, setUserName] = useState('')
  const [role, setRole] = useState('')
  const [ready, setReady] = useState(false)
  const [accessError, setAccessError] = useState(false)
  const [accessAttempt, setAccessAttempt] = useState(0)
  const [mobileMore, setMobileMore] = useState(false)
  const nav = useMemo<NavItem[]>(() => {
    if(role==='viewer') return viewerNav
    if(role==='foreman') return reportUserNav
    if(role==='payroll') return payrollNav
    const items=[...managementNav]
    if(role==='manager') items.push(['/photo-mapping','Photo Mapping'],['/data-health','Data Health'],['/users','User & Access'])
    return items
  }, [role])
  const mobilePrimary = useMemo<NavItem[]>(() => nav.slice(0, MOBILE_PRIMARY_COUNT).map(([href,label]) => [href, mobileLabel[href] || label]), [nav])
  const extraNav = useMemo<NavItem[]>(() => nav.slice(MOBILE_PRIMARY_COUNT), [nav])

  useEffect(() => {
    const supabase = getSupabase()
    const controller = new AbortController()
    let alive = true
    setAccessError(false)
    const timer = window.setTimeout(() => {
      controller.abort()
      if (alive) setAccessError(true)
    }, 15000)
    const checkAccess = async () => {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (!alive || controller.signal.aborted) return
        if (error && error.status !== 401 && error.status !== 403 && error.name !== 'AuthSessionMissingError') throw error
        if (!data.user) { router.replace('/login'); return }
        const { data: profile, error: profileError } = await supabase.from('profiles').select('full_name,role,active').eq('user_id', data.user.id).abortSignal(controller.signal).maybeSingle()
        if (!alive || controller.signal.aborted) return
        if (profileError) throw profileError
        if (!profile?.active) { await supabase.auth.signOut(); if (alive && !controller.signal.aborted) router.replace('/login'); return }
        setUserName(profile.full_name || data.user.email || 'User'); setRole(profile.role || 'viewer'); setReady(true)
      } catch {
        if (alive) setAccessError(true)
      } finally {
        window.clearTimeout(timer)
      }
    }
    void checkAccess()
    return () => { alive = false; controller.abort(); window.clearTimeout(timer) }
  }, [router, accessAttempt])

  useEffect(() => { setMobileMore(false) }, [path])

  useEffect(() => {
    const isDefect = path === '/defects' || path === '/defect-flow'
    const isDriveBacked = DRIVE_WATCH_PATHS.has(path) || path.startsWith('/projects/')
    if (!isDefect && !isDriveBacked) return

    let cancelled = false
    const storageKey = isDefect ? '3kings:defect-latest-sync' : '3kings:drive-latest-write'
    const intervalMs = isDefect ? 5 * 60 * 1000 : 10 * 60 * 1000

    const checkForDataUpdate = async () => {
      if (cancelled || document.visibilityState !== 'visible') return
      const supabase = getSupabase()
      let latest: string | null = null

      if (isDefect) {
        const { data, error } = await supabase
          .from('condo_room_status')
          .select('synced_at')
          .order('synced_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (cancelled || error || !data?.synced_at) return
        latest = String(data.synced_at)
      } else {
        const { data, error } = await supabase
          .from('drive_sync_runs')
          .select('created_at')
          .eq('status', 'success')
          .gt('rows_written', 0)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (cancelled || error || !data?.created_at) return
        latest = String(data.created_at)
      }

      const previous = window.sessionStorage.getItem(storageKey)
      if (!previous) {
        window.sessionStorage.setItem(storageKey, latest)
        return
      }
      if (previous !== latest) {
        window.sessionStorage.setItem(storageKey, latest)
        window.location.reload()
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void checkForDataUpdate()
    }
    const onFocus = () => { void checkForDataUpdate() }

    void checkForDataUpdate()
    const timer = window.setInterval(() => { void checkForDataUpdate() }, intervalMs)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [path])

  const signOut = async () => {
    setMobileMore(false)
    await getSupabase().auth.signOut()
    router.replace('/login')
  }

  const displayRole = roleLabel(role,userName)

  if (!ready) return <div className="loading-screen">{accessError ? <div role="alert"><p>ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่</p><button type="button" onClick={() => setAccessAttempt(v => v + 1)}>ลองใหม่</button></div> : 'กำลังโหลดระบบ…'}</div>

  const extraActive = extraNav.some(([href]) => navIsActive(path,href))
  const isDefectSection = path==='/defect-flow'||path==='/defects'
  const isSiteOperationsSection = path==='/reports'||path==='/reports/labour'

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><BrandLogo className="brand-logo"/><div><b>3 Kings Construction</b><small>Site Report V3.4</small></div></div>
      <nav>{nav.map(([href,label]) => <Link key={href} className={navIsActive(path,href)?'active':''} href={href}>{label}</Link>)}</nav>
      <div className="userbox"><b>{userName}</b><span>{displayRole}</span><button onClick={signOut}>ออกจากระบบ</button></div>
    </aside>

    <main className="main">
      {isDefectSection&&<nav className="defect-section-tabs" aria-label="Defect navigation">
        <Link href="/defect-flow" className={path==='/defect-flow'?'active':''}>Live Handover / Defect Flow</Link>
        <Link href="/defects" className={path==='/defects'?'active':''}>Defect Report</Link>
      </nav>}
      {isSiteOperationsSection&&<nav className="defect-section-tabs" aria-label="Site Operations navigation">
        <Link href="/reports" className={path==='/reports'?'active':''}>Site Operations</Link>
        <Link href="/reports/labour" className={path==='/reports/labour'?'active':''}>Payroll Verification Record</Link>
      </nav>}
      {children}
    </main>

    {mobileMore && <>
      <button className="mobile-more-backdrop" aria-label="ปิดเมนูเพิ่มเติม" onClick={()=>setMobileMore(false)} />
      <section className="mobile-more-sheet" aria-label="เมนูเพิ่มเติม">
        <div className="mobile-more-handle" />
        <div className="mobile-more-user">
          <div><b>{userName}</b><span>{displayRole}</span></div>
          <button type="button" onClick={()=>setMobileMore(false)}>ปิด</button>
        </div>
        <div className="mobile-more-links">
          {extraNav.map(([href,label]) => <Link key={href} className={navIsActive(path,href)?'active':''} href={href}>{label}<span>›</span></Link>)}
        </div>
        <button className="mobile-logout" type="button" onClick={signOut}>ออกจากระบบ</button>
      </section>
    </>}

    <nav className="mobile-nav" aria-label="เมนูหลักบนมือถือ">
      {mobilePrimary.map(([href,label]) => <Link key={href} className={navIsActive(path,href)?'active':''} href={href}>{label}</Link>)}
      <button type="button" className={(mobileMore||extraActive)?'active':''} onClick={()=>setMobileMore(v=>!v)}>เพิ่มเติม</button>
    </nav>

    <style jsx global>{`
      .defect-section-tabs{display:inline-flex;align-items:center;gap:4px;padding:4px;margin:0 0 12px;border:1px solid #d9e0e7;border-radius:12px;background:#f4f7fa;box-shadow:0 3px 10px rgba(23,42,67,.05)}
      .defect-section-tabs a{display:flex;align-items:center;justify-content:center;min-height:34px;padding:7px 12px;border-radius:9px;color:#617083;font-size:11px;font-weight:800;text-decoration:none;white-space:nowrap;transition:background .15s ease,color .15s ease,box-shadow .15s ease}
      .defect-section-tabs a:hover{background:#e9eef4;color:#213d5e}
      .defect-section-tabs a.active{background:#172a43;color:#fff;box-shadow:0 3px 8px rgba(23,42,67,.18)}
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
        .defect-section-tabs{display:flex;width:100%;overflow-x:auto;justify-content:flex-start}
        .defect-section-tabs a{flex:0 0 auto}
        .dashboard-module .module-title{grid-template-columns:30px minmax(0,1fr);padding:11px 12px;min-height:58px}
        .dashboard-module .module-title>a{grid-column:2;margin-top:1px}
        .dashboard-module .module-title>span{width:28px;height:28px}
        #site-performance a[href^='/projects/']{grid-template-columns:72px minmax(0,1fr)!important;padding:10px!important}
        #site-performance a[href^='/projects/']>svg{width:72px!important;height:72px!important}
      }
      @media print{.defect-section-tabs{display:none!important}}
    `}</style>
  </div>
}
