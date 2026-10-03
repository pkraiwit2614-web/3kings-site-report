import {NextRequest,NextResponse} from 'next/server'

export const runtime='nodejs'
export const maxDuration=15

const DRIVE_ID=/^[A-Za-z0-9_-]{10,200}$/

function unavailablePlaceholder(){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#eef1f4"/><g fill="#6f7884" text-anchor="middle" font-family="Arial,sans-serif"><text x="600" y="380" font-size="38" font-weight="700">PHOTO UNAVAILABLE</text><text x="600" y="430" font-size="24">เปิด Picture Progress ใน Google Drive เพื่อตรวจรูปต้นฉบับ</text></g></svg>`
  return new NextResponse(svg,{status:200,headers:{'content-type':'image/svg+xml; charset=utf-8','cache-control':'public, max-age=60, s-maxage=300, stale-while-revalidate=3600','x-photo-fallback':'unavailable','x-content-type-options':'nosniff'}})
}

export async function GET(request:NextRequest){
  const fileId=request.nextUrl.searchParams.get('fileId')||''
  if(!DRIVE_ID.test(fileId))return NextResponse.json({ok:false,error:'invalid_file_id'},{status:400})

  const requestedSize=Number(request.nextUrl.searchParams.get('size')||1600)
  const size=Number.isFinite(requestedSize)?Math.max(320,Math.min(1600,Math.round(requestedSize))):1600
  const encoded=encodeURIComponent(fileId)
  const sources=[
    `https://drive.google.com/thumbnail?id=${encoded}&sz=w${size}`,
    `https://lh3.googleusercontent.com/d/${encoded}=w${size}`,
    `https://drive.usercontent.google.com/download?id=${encoded}&export=view&confirm=t`,
  ]

  const deadline=AbortSignal.timeout(11000)
  for(const source of sources){
    if(deadline.aborted)break
    try{
      const response=await fetch(source,{redirect:'follow',cache:'force-cache',headers:{'user-agent':'3KingsConstruction/1.0'},signal:AbortSignal.any([deadline,AbortSignal.timeout(3500)])})
      const contentType=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()
      if(!response.ok||!contentType.startsWith('image/'))continue
      const bytes=await response.arrayBuffer()
      if(!bytes.byteLength)continue
      return new NextResponse(bytes,{status:200,headers:{'content-type':contentType,'cache-control':'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800','content-disposition':'inline','x-content-type-options':'nosniff'}})
    }catch{
      // Continue to the next public Google Drive image endpoint.
    }
  }

  return unavailablePlaceholder()
}
