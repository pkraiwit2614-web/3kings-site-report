'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

const baseNav = [
  ['/', 'Dashboard'], ['/reports/new', 'Daily Report'], ['/schedule', 'Schedule'], ['/materials', 'Materials'],
  ['/procurement', 'Purchasing'], ['/reports', 'History'], ['/weekly', 'Weekly Report']
]

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname(); const router = useRouter()
  const [userName, setUserName] = useState('')
  const [role, setRole] = useState('')
  const [ready, setReady] = useState(false)
  const nav = useMemo(() => role === 'manager' ? [...baseNav, ['/users', 'Users & Access']] : baseNav, [role])

  useEffect(() => {
    const supabase = getSupabase()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('full_name,role,active').eq('user_id', data.user.id).maybeSingle()
      if (!profile?.active) { await supabase.auth.signOut(); router.replace('/login'); return }
      setUserName(profile.full_name || data.user.email || 'User'); setRole(profile.role || 'user'); setReady(true)
    })
  }, [router])

  const signOut = async () => { await getSupabase().auth.signOut(); router.replace('/login') }
  if (!ready) return <div className="loading-screen">กำลังโหลดระบบ…</div>

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">3K</div><div><b>3 Kings</b><small>Site Report V3.1</small></div></div>
      <nav>{nav.map(([href,label]) => <Link key={href} className={path===href?'active':''} href={href}>{label}</Link>)}</nav>
      <div className="userbox"><b>{userName}</b><span>{role}</span><button onClick={signOut}>ออกจากระบบ</button></div>
    </aside>
    <main className="main">{children}</main>
    <nav className="mobile-nav">{baseNav.slice(0,5).map(([href,label]) => <Link key={href} className={path===href?'active':''} href={href}>{label.split(' ')[0]}</Link>)}</nav>
  </div>
}
