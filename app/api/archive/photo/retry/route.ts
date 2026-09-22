import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime='nodejs'
export const maxDuration=15

const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'

export async function POST(request:Request){
  const authHeader=request.headers.get('authorization')||''
  const token=authHeader.startsWith('Bearer ')?authHeader.slice(7).trim():''
  if(!token) return NextResponse.json({ok:false,error:'Missing user token'},{status:401})

  const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:`Bearer ${token}`}},
  })
  const {data:userData,error:userError}=await supabase.auth.getUser(token)
  if(userError||!userData.user) return NextResponse.json({ok:false,error:'Invalid user token'},{status:401})

  let body:any={}
  try{body=await request.json()}catch{}
  const photoId=String(body.photo_id||'')
  if(!photoId) return NextResponse.json({ok:false,error:'photo_id is required'},{status:400})

  const {data:photo,error:photoError}=await supabase.from('report_photos')
    .select('id,daily_report_id,uploaded_by,phase,caption,archive_status,archive_staging_path,archive_retry_count')
    .eq('id',photoId).maybeSingle()
  if(photoError||!photo) return NextResponse.json({ok:false,error:'Photo not found'},{status:404})
  if(photo.uploaded_by!==userData.user.id) return NextResponse.json({ok:false,error:'Retry ทำได้โดยผู้ที่อัปโหลดรูปนี้เท่านั้น'},{status:403})
  if(photo.archive_status==='archived') return NextResponse.json({ok:true,status:'archived',message:'รูปนี้ Archive แล้ว'},{status:200})
  if(!photo.archive_staging_path) return NextResponse.json({ok:false,error:'ไม่พบ Original ใน staging กรุณาเพิ่มรูปใหม่จากรายงาน'},{status:409})

  const {data:signed,error:signedError}=await supabase.storage.from('photo-archive-staging').createSignedUrl(photo.archive_staging_path,1800)
  if(signedError||!signed?.signedUrl){
    await supabase.from('report_photos').update({
      archive_status:'failed',
      archive_error:`Retry signed URL: ${signedError?.message||'staging object unavailable'}`,
      archive_retry_count:(Number(photo.archive_retry_count)||0)+1,
      archive_last_attempt_at:new Date().toISOString(),
      archive_last_attempt_by:userData.user.id,
    }).eq('id',photoId)
    return NextResponse.json({ok:false,error:'Original ใน staging ไม่พร้อมใช้งาน กรุณาเพิ่มรูปใหม่'},{status:409})
  }

  const {data:report,error:reportError}=await supabase.from('daily_reports').select('id,project_id,report_date').eq('id',photo.daily_report_id).maybeSingle()
  if(reportError||!report) return NextResponse.json({ok:false,error:'Report not found'},{status:404})
  const {data:project,error:projectError}=await supabase.from('projects').select('id,code,name').eq('id',report.project_id).maybeSingle()
  if(projectError||!project) return NextResponse.json({ok:false,error:'Project not found'},{status:404})

  await supabase.from('report_photos').update({
    archive_retry_count:(Number(photo.archive_retry_count)||0)+1,
    archive_last_attempt_at:new Date().toISOString(),
    archive_last_attempt_by:userData.user.id,
  }).eq('id',photoId)

  const queueResponse=await fetch(new URL('/api/archive/photo',request.url),{
    method:'POST',
    headers:{'content-type':'application/json','authorization':`Bearer ${token}`},
    body:JSON.stringify({
      photo_id:photo.id,
      report_id:report.id,
      project_id:project.id,
      project_code:project.code,
      project_name:project.name,
      report_date:report.report_date,
      phase:photo.phase||'other',
      original_file_name:photo.caption||'site-photo.jpg',
      staging_path:photo.archive_staging_path,
      signed_url:signed.signedUrl,
    }),
    cache:'no-store',
  })

  let result:any={}
  try{result=await queueResponse.json()}catch{result={}}
  if(!queueResponse.ok) return NextResponse.json({ok:false,error:result?.error||'Retry queue failed'},{status:queueResponse.status})
  return NextResponse.json({ok:true,status:'processing',retry_count:(Number(photo.archive_retry_count)||0)+1},{status:202})
}
