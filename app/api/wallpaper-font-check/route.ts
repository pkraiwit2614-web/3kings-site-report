import { Resvg } from '@resvg/resvg-js'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const runtime='nodejs'
export const dynamic='force-dynamic'

const DIR='/tmp/3kings-font-check'
const fonts=[
  ['NotoSans-Regular.ttf','https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf'],
  ['NotoSans-Bold.ttf','https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf'],
  ['NotoSansThai-Regular.ttf','https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansThai/NotoSansThai-Regular.ttf'],
  ['NotoSansThai-Bold.ttf','https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSansThai/NotoSansThai-Bold.ttf']
] as const

export async function GET(){
  await fs.mkdir(DIR,{recursive:true})
  const files:string[]=[]
  for(const [name,url] of fonts){
    const p=path.join(DIR,name); const r=await fetch(url); if(!r.ok)return new Response('font download failed',{status:503})
    await fs.writeFile(p,Buffer.from(await r.arrayBuffer())); files.push(p)
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520"><rect width="1200" height="520" fill="#071421"/><style>.en{font-family:"Noto Sans"}.th{font-family:"Noto Sans Thai"}.mix{font-family:"Noto Sans Thai","Noto Sans"}text{fill:#f8fafc}</style><text x="60" y="90" class="en" font-size="44" font-weight="700">ENGLISH 123 45% / PO-2026 / STATUS: LIVE</text><text x="60" y="170" class="th" font-size="42" font-weight="700">ภาษาไทย อ่านได้ชัดเจน 123 45%</text><text x="60" y="250" class="mix" font-size="38">Plot 6 - งานฝ้า / Ceiling work | ETA 30/09/2026</text><rect x="60" y="310" width="22" height="22" rx="4" fill="#fb7185"/><text x="100" y="329" class="en" font-size="25">CRITICAL</text><rect x="260" y="310" width="22" height="22" rx="4" fill="#fbbf24"/><text x="300" y="329" class="th" font-size="25">รอตรวจ</text><rect x="470" y="310" width="22" height="22" rx="4" fill="#34d399"/><text x="510" y="329" class="mix" font-size="25">COMPLETE / เสร็จแล้ว</text><text x="60" y="410" class="en" font-size="22">Symbols are rendered as shapes + ASCII labels: / | + - % ( ) [ ]</text></svg>`
  const renderer=new Resvg(svg,{font:{loadSystemFonts:false,fontFiles:files,defaultFontFamily:'Noto Sans',sansSerifFamily:'Noto Sans'},textRendering:2,shapeRendering:2})
  const png=renderer.render().asPng()
  return new Response(new Uint8Array(png),{headers:{'Content-Type':'image/png','Cache-Control':'no-store','X-Font-Check':'latin-thai-ok'}})
}
