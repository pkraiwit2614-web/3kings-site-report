import { ImageResponse } from 'next/og'
import sharp from 'sharp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const regularPromise=fetch('https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansThai/NotoSansThai-Regular.ttf').then(r=>r.arrayBuffer())
const boldPromise=fetch('https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansThai/NotoSansThai-Bold.ttf').then(r=>r.arrayBuffer())
const logoPngPromise=fetch('https://raw.githubusercontent.com/pkraiwit2614-web/3kings-site-report/main/components/BrandLogo.tsx').then(async r=>{
  if(!r.ok)return null
  const text=await r.text()
  const src=text.match(/const logoSrc = '([^']+)'/)?.[1]||null
  if(!src)return null
  const encoded=src.split(',')[1]
  if(!encoded)return null
  const png=await sharp(Buffer.from(encoded,'base64')).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}).catch(()=>null)

export async function GET(){
  const [regular,bold,logo]=await Promise.all([regularPromise,boldPromise,logoPngPromise])
  return new ImageResponse(
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',alignItems:'center',justifyContent:'center',background:'#071421',color:'#fff',fontFamily:'Noto Sans Thai'}}>
      {logo?<img src={logo} width="180" height="180" alt="3 Kings Construction" style={{objectFit:'contain'}}/>:<div style={{display:'flex',fontSize:60,fontWeight:700}}>3K</div>}
      <div style={{display:'flex',fontSize:48,fontWeight:700,marginTop:22}}>3 Kings Construction</div>
      <div style={{display:'flex',fontSize:36,fontWeight:700,marginTop:8}}>ทดสอบโลโก้ PNG และภาษาไทย</div>
    </div>,
    {width:1280,height:720,fonts:[{name:'Noto Sans Thai',data:regular,weight:400,style:'normal'},{name:'Noto Sans Thai',data:bold,weight:700,style:'normal'}]}
  )
}
