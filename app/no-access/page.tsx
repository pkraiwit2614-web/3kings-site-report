'use client'
import {getSupabase} from '@/lib/supabase'
export default function NoAccess(){return <main style={{padding:24}}><div className="panel"><h1>ยังไม่มีสิทธิ์เข้าหน้างาน</h1><p>กรุณาติดต่อ Owner เพื่อกำหนดสิทธิ์สำหรับบัญชีนี้</p><button className="button" onClick={()=>window.location.reload()}>ตรวจสิทธิ์อีกครั้ง</button>{' '}<button className="button" onClick={async()=>{await getSupabase().auth.signOut();window.location.href='/login'}}>ออกจากระบบ</button></div></main>}
