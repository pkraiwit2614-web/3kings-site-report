import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'

const groups = [
  {
    title:'Above Villa',
    subtitle:'รูปความคืบหน้าราย Plot',
    sites:[
      {name:'Above Villa Plot 6',url:'https://drive.google.com/drive/folders/18WfplWKvZ7DWfjVgO7oVHA4dtlbuuzfr'},
      {name:'Above Villa Plot 7',url:'https://drive.google.com/drive/folders/1ZmlxctN0yAXamSmXTNzjx0t3GJu_aLiI'},
      {name:'Above Villa Plot 8',url:'https://drive.google.com/drive/folders/1T1eWjtfuNhtI8hrm-Jac5tKeZNfbJaXY'},
      {name:'Above Villa Plot 9',url:'https://drive.google.com/drive/folders/1f4YCTjwd8E0dHgbyf8eF7XeC5kSj5j_6'}
    ]
  },
  {
    title:'Above Condo',
    subtitle:'โฟลเดอร์รูปของแต่ละอาคาร',
    sites:[
      {name:'Above Condo A',url:''},
      {name:'Above Condo B',url:''}
    ]
  },
  {
    title:'หน้างานอื่น',
    subtitle:'Site Photo / Picture Progress',
    sites:[
      {name:'Camp Site',url:'https://drive.google.com/drive/folders/16vS4clUn_sDo13ND4VK1cO_JSTVwCMma'},
      {name:'Mirage เชิงทะเล',url:'https://drive.google.com/drive/folders/1uq_XoSsAZt-bxhRJPhVtpSbdHkygku3h'},
      {name:'Proud Karon',url:'https://drive.google.com/drive/folders/1uduc_Zk3AV6ufijjrwNs8Coq_dESC2_p'},
      {name:'Hennessy Residence',url:''}
    ]
  }
]

export default function SitePhotosPage(){
  return <AppShell>
    <PageHeader title="รูปภาพหน้างาน" subtitle="รวมลิงก์ไปยังโฟลเดอร์รูปความคืบหน้าใน Google Drive แยกตาม Site / Plot" />
    <div style={{display:'grid',gap:18}}>
      {groups.map(group=><section key={group.title} className="panel">
        <div className="panel-head" style={{alignItems:'flex-start'}}>
          <div><h2>{group.title}</h2><span className="muted small">{group.subtitle}</span></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:10}}>
          {group.sites.map(site=>site.url?
            <a key={site.name} href={site.url} target="_blank" rel="noreferrer" style={{border:'1px solid var(--line)',borderRadius:13,padding:14,background:'var(--surface-2)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,minHeight:72}}>
              <div><b style={{display:'block',color:'var(--navy-2)'}}>{site.name}</b><small style={{display:'block',marginTop:5,color:'var(--green)',fontWeight:800}}>มีโฟลเดอร์รูปแล้ว</small></div>
              <span style={{fontSize:20,color:'var(--blue)'}}>↗</span>
            </a>
          :<div key={site.name} style={{border:'1px dashed var(--line)',borderRadius:13,padding:14,background:'var(--surface)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,minHeight:72,opacity:.72}}>
              <div><b style={{display:'block'}}>{site.name}</b><small style={{display:'block',marginTop:5,color:'var(--muted)'}}>ยังไม่ได้เชื่อมโฟลเดอร์รูป</small></div>
              <span style={{fontSize:18,color:'var(--muted)'}}>—</span>
            </div>)}
        </div>
      </section>)}
    </div>
  </AppShell>
}
