'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { dateTH } from '@/lib/format'

type SiteLink={name:string;code?:string;url:string;dataUpdatedAt?:string;note?:string}
type SiteGroup={title:string;subtitle:string;sites:SiteLink[]}
type PreviewPhoto={project_id:string;drive_file_id:string;drive_folder_id:string|null;drive_folder_name:string|null;photo_date:string;file_name:string}
type ProjectRow={id:string;code:string}

const groups:SiteGroup[] = [
  {
    title:'Above Villa',
    subtitle:'รูปความคืบหน้าราย Plot',
    sites:[
      {name:'Above Villa Plot 6',code:'AV-P6',url:'https://drive.google.com/drive/folders/18WfplWKvZ7DWfjVgO7oVHA4dtlbuuzfr',dataUpdatedAt:'22/09/2569'},
      {name:'Above Villa Plot 7',code:'AV-P7',url:'https://drive.google.com/drive/folders/1ZmlxctN0yAXamSmXTNzjx0t3GJu_aLiI',dataUpdatedAt:'22/09/2569'},
      {name:'Above Villa Plot 8',code:'AV-P8',url:'https://drive.google.com/drive/folders/1T1eWjtfuNhtI8hrm-Jac5tKeZNfbJaXY',dataUpdatedAt:'22/09/2569'},
      {name:'Above Villa Plot 9',code:'AV-P9',url:'https://drive.google.com/drive/folders/1f4YCTjwd8E0dHgbyf8eF7XeC5kSj5j_6',dataUpdatedAt:'22/09/2569'}
    ]
  },
  {
    title:'Above Condo',
    subtitle:'รูป Defect Done แยกตามเลขห้องภายในโฟลเดอร์เดียวกัน',
    sites:[
      {name:'Above Condo A',code:'CONDO-A',url:'https://drive.google.com/drive/folders/1GJy5xu2eQMbv4MIKnQC5df7m_CpyocXK',dataUpdatedAt:'22/09/2569',note:'Picture - Defect Done'},
      {name:'Above Condo B',code:'CONDO-B',url:'https://drive.google.com/drive/folders/1GJy5xu2eQMbv4MIKnQC5df7m_CpyocXK',dataUpdatedAt:'22/09/2569',note:'Picture - Defect Done'}
    ]
  },
  {
    title:'หน้างานอื่น',
    subtitle:'Site Photo / Picture Progress',
    sites:[
      {name:'Camp Site',url:'https://drive.google.com/drive/folders/16vS4clUn_sDo13ND4VK1cO_JSTVwCMma',dataUpdatedAt:'29/08/2569'},
      {name:'Mirage เชิงทะเล',code:'MIRAGE',url:'https://drive.google.com/drive/folders/1uq_XoSsAZt-bxhRJPhVtpSbdHkygku3h',dataUpdatedAt:'24/09/2569'},
      {name:'Proud Karon',code:'PROUD-KARON',url:'https://drive.google.com/drive/folders/1uduc_Zk3AV6ufijjrwNs8Coq_dESC2_p',dataUpdatedAt:'15/09/2569'},
      {name:'Hennessy Residence',url:''}
    ]
  }
]

export default function SitePhotosGallery(){
  const [latestByCode,setLatestByCode]=useState<Record<string,PreviewPhoto>>({})
  const [loaded,setLoaded]=useState(false)

  useEffect(()=>{
    let cancelled=false
    const load=async()=>{
      const s=getSupabase()
      const [p,d]=await Promise.all([
        s.from('projects').select('id,code').eq('active',true),
        s.from('drive_photo_index')
          .select('project_id,drive_file_id,drive_folder_id,drive_folder_name,photo_date,file_name')
          .eq('is_active',true)
          .order('photo_date',{ascending:false})
          .order('indexed_at',{ascending:false})
          .limit(180)
      ])
      if(cancelled) return
      const codeByProject=new Map(((p.data||[]) as ProjectRow[]).map(x=>[x.id,x.code]))
      const next:Record<string,PreviewPhoto>={}
      for(const photo of (d.data||[]) as PreviewPhoto[]){
        const code=codeByProject.get(photo.project_id)
        if(code&&!next[code]) next[code]=photo
      }
      setLatestByCode(next)
      setLoaded(true)
    }
    load().catch(()=>setLoaded(true))
    return()=>{cancelled=true}
  },[])

  const indexedCount=useMemo(()=>Object.keys(latestByCode).length,[latestByCode])

  return <>
    <div className="site-photo-summary">
      <span>Preview ล่าสุดจาก Photo Index: <b>{indexedCount}</b> หน้างาน</span>
      <span>รูปตัวอย่างโหลดแบบ Lazy เพื่อไม่ให้หน้าเว็บหนัก</span>
    </div>
    <div className="site-photo-groups">
      {groups.map(group=><section key={group.title} className="panel site-photo-group">
        <div className="panel-head site-photo-group-head">
          <div><h2>{group.title}</h2><span className="muted small">{group.subtitle}</span></div>
        </div>
        <div className="site-photo-grid">
          {group.sites.map(site=>{
            const preview=site.code?latestByCode[site.code]:undefined
            const latestFolder=preview?.drive_folder_id?`https://drive.google.com/drive/folders/${preview.drive_folder_id}`:site.url
            const latestDate=preview?.photo_date?dateTH(preview.photo_date):site.dataUpdatedAt||'-'
            if(!site.url) return <article key={site.name} className="site-photo-card disabled">
              <div className="site-photo-preview empty"><span>📷</span><small>ยังไม่ได้เชื่อมโฟลเดอร์รูป</small></div>
              <div className="site-photo-body"><b>{site.name}</b><span className="site-photo-status muted-status">ยังไม่มีแหล่งรูป</span></div>
            </article>
            return <article key={site.name} className="site-photo-card">
              {preview?<a className="site-photo-preview clickable" href={latestFolder} target="_blank" rel="noreferrer" title={`เปิดโฟลเดอร์รูปวันที่ ${latestDate}`}>
                <img
                  src={`/api/drive-photo?fileId=${encodeURIComponent(preview.drive_file_id)}&size=640`}
                  alt={`${site.name} — รูปล่าสุด ${latestDate}`}
                  loading="lazy"
                  decoding="async"
                />
                <span className="site-photo-date">ล่าสุด {latestDate}</span>
                <span className="site-photo-open">เปิดรูปชุดล่าสุด ↗</span>
              </a>:<div className="site-photo-preview empty">
                <span>📷</span>
                <small>{loaded?'ยังไม่มี Preview ใน Photo Index':'กำลังโหลด Preview…'}</small>
              </div>}
              <div className="site-photo-body">
                <div className="site-photo-title-row"><div><b>{site.name}</b>{site.note&&<small>{site.note}</small>}</div><span>↗</span></div>
                <div className="site-photo-meta"><span className="site-photo-status">มีโฟลเดอร์รูปแล้ว</span><span>อัปเดตล่าสุด: <b>{latestDate}</b></span></div>
                <a className="site-photo-folder-button" href={site.url} target="_blank" rel="noreferrer">เปิดโฟลเดอร์รูปทั้งหมด</a>
              </div>
            </article>
          })}
        </div>
      </section>)}
    </div>
    <p className="muted small site-photo-footnote">วันที่ “อัปเดตล่าสุด” ของการ์ดที่มี Preview มาจาก Photo Index; หน้างานที่ยังไม่มี Photo Index จะแสดงวันที่อ้างอิงเดิมและยังเปิดโฟลเดอร์ Drive ได้ตามปกติ</p>
    <style jsx global>{`
      .site-photo-summary{display:flex;flex-wrap:wrap;gap:7px 16px;margin:-2px 0 14px;color:var(--muted);font-size:11px}.site-photo-summary b{color:var(--navy-2)}
      .site-photo-groups{display:grid;gap:18px}.site-photo-group-head{align-items:flex-start}.site-photo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
      .site-photo-card{min-width:0;border:1px solid var(--line);border-radius:15px;overflow:hidden;background:var(--surface);box-shadow:0 5px 16px rgba(20,31,48,.055);transition:transform .18s ease,box-shadow .18s ease}.site-photo-card:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(20,31,48,.10)}.site-photo-card.disabled{opacity:.72;box-shadow:none}.site-photo-card.disabled:hover{transform:none}
      .site-photo-preview{height:142px;position:relative;display:block;overflow:hidden;background:linear-gradient(135deg,#ece8df,#ded8cd)}.site-photo-preview img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .22s ease,filter .22s ease}.site-photo-preview.clickable:hover img{transform:scale(1.025);filter:brightness(.88)}.site-photo-preview.empty{display:grid;place-content:center;text-align:center;gap:5px;color:var(--muted)}.site-photo-preview.empty>span{font-size:27px}.site-photo-preview.empty small{font-size:11px}
      .site-photo-date{position:absolute;left:9px;top:9px;padding:5px 8px;border-radius:999px;background:rgba(15,31,50,.78);color:#fff;font-size:9px;font-weight:800;backdrop-filter:blur(5px)}.site-photo-open{position:absolute;left:50%;top:50%;transform:translate(-50%,-42%);opacity:0;padding:7px 10px;border-radius:9px;background:rgba(255,255,255,.92);color:#193552;font-size:10px;font-weight:900;white-space:nowrap;transition:.18s ease}.site-photo-preview.clickable:hover .site-photo-open{opacity:1;transform:translate(-50%,-50%)}
      .site-photo-body{padding:12px}.site-photo-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.site-photo-title-row b{display:block;color:var(--navy-2);font-size:14px}.site-photo-title-row small{display:block;margin-top:3px;color:var(--muted);font-size:9px}.site-photo-title-row>span{font-size:17px;color:var(--blue);flex:0 0 auto}.site-photo-meta{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:5px 8px;margin-top:8px;color:var(--muted);font-size:9px}.site-photo-status{color:var(--green);font-weight:900}.site-photo-status.muted-status{color:var(--muted)}.site-photo-folder-button{display:flex;align-items:center;justify-content:center;min-height:34px;margin-top:10px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--blue);font-size:10px;font-weight:900}.site-photo-folder-button:hover{border-color:#b7c8dd;background:#edf4fb}.site-photo-footnote{margin-top:10px}
      @media(max-width:620px){.site-photo-grid{grid-template-columns:1fr 1fr;gap:9px}.site-photo-preview{height:112px}.site-photo-body{padding:10px}.site-photo-title-row b{font-size:12px}.site-photo-meta{display:grid;justify-content:stretch}.site-photo-folder-button{font-size:9px}.site-photo-open{display:none}}
      @media(max-width:410px){.site-photo-grid{grid-template-columns:1fr}.site-photo-preview{height:150px}}
    `}</style>
  </>
}
