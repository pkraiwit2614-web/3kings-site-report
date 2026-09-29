import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const regularPromise=fetch('https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansThai/NotoSansThai-Regular.ttf').then(r=>r.arrayBuffer())
const boldPromise=fetch('https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansThai/NotoSansThai-Bold.ttf').then(r=>r.arrayBuffer())

export async function GET(){
  const [regular,bold]=await Promise.all([regularPromise,boldPromise])
  return new ImageResponse(
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',alignItems:'center',justifyContent:'center',background:'#071421',color:'#fff',fontFamily:'Noto Sans Thai'}}>
      <div style={{display:'flex',fontSize:58,fontWeight:700}}>WALLPAPER FONT OK</div>
      <div style={{display:'flex',fontSize:44,fontWeight:700,marginTop:20}}>ทดสอบภาษาไทย งานก่อสร้าง หน้างาน</div>
      <div style={{display:'flex',fontSize:30,fontWeight:400,marginTop:12}}>Critical · Procurement · Defect · Handover</div>
    </div>,
    {width:1280,height:720,fonts:[{name:'Noto Sans Thai',data:regular,weight:400,style:'normal'},{name:'Noto Sans Thai',data:bold,weight:700,style:'normal'}]}
  )
}
