import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const target = new URL('/api/wallpaper-png', req.url)
  target.searchParams.set('w', req.nextUrl.searchParams.get('w') || '1280')
  target.searchParams.set('h', req.nextUrl.searchParams.get('h') || '720')
  target.searchParams.set('v', 'debug')

  const response = await fetch(target, {
    headers: {
      'X-Wallpaper-Token': 'tmp-render-test-A7kQ9mN2xP4vR8sT6uW3yZ5cB1dF0hJ',
      'Cache-Control': 'no-cache'
    },
    cache: 'no-store'
  })

  return new Response(response.body, {
    status: response.status,
    headers: response.headers
  })
}
