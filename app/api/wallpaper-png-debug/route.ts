import { NextRequest } from 'next/server'
import { GET as renderWallpaper } from '../wallpaper-png/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const target = new URL('../wallpaper-png', req.url)
  target.searchParams.set('w', req.nextUrl.searchParams.get('w') || '1280')
  target.searchParams.set('h', req.nextUrl.searchParams.get('h') || '720')
  target.searchParams.set('v', 'debug')
  const headers = new Headers(req.headers)
  headers.set('x-wallpaper-token', 'tmp-render-test-A7kQ9mN2xP4vR8sT6uW3yZ5cB1dF0hJ')
  return renderWallpaper(new NextRequest(target, { headers }))
}
