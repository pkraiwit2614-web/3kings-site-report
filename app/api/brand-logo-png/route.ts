import sharp from 'sharp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ORIGINAL_LOGO_SOURCE = 'https://raw.githubusercontent.com/pkraiwit2614-web/3kings-site-report/2ac4e1e93248fef20e23b0a9897bcca880f3f497/components/BrandLogo.tsx'

let cachedPng: Buffer | null = null

async function getLogoPng(){
  if(cachedPng) return cachedPng
  const response = await fetch(ORIGINAL_LOGO_SOURCE, { cache:'force-cache' })
  if(!response.ok) throw new Error(`Official logo source unavailable: ${response.status}`)
  const source = await response.text()
  const dataUri = source.match(/const logoSrc = '([^']+)'/)?.[1] || ''
  const encoded = dataUri.split(',')[1]
  if(!dataUri.startsWith('data:image/webp;base64,') || !encoded){
    throw new Error('Official WebP logo was not found in the frozen source')
  }
  cachedPng = await sharp(Buffer.from(encoded,'base64')).png().toBuffer()
  return cachedPng
}

export async function GET(){
  try{
    const png = await getLogoPng()
    return new Response(new Uint8Array(png), {
      status:200,
      headers:{
        'Content-Type':'image/png',
        'Cache-Control':'public, max-age=31536000, immutable'
      }
    })
  }catch(error){
    console.error('brand-logo-png failed',error)
    return new Response('Logo unavailable',{status:500})
  }
}
