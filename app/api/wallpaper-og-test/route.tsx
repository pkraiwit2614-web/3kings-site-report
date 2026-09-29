import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(){
  return new ImageResponse(
    <div style={{display:'flex',width:'100%',height:'100%',alignItems:'center',justifyContent:'center',background:'#071421',color:'#fff',fontSize:64,fontWeight:700}}>WALLPAPER OK</div>,
    {width:1280,height:720}
  )
}
