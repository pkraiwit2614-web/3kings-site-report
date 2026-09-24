import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 15

const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/

export async function GET(request: NextRequest) {
  const fileId = request.nextUrl.searchParams.get('fileId') || ''
  if (!DRIVE_ID.test(fileId)) {
    return NextResponse.json({ ok: false, error: 'invalid_file_id' }, { status: 400 })
  }

  const sources = [
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`,
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=view&confirm=t`,
  ]

  for (const source of sources) {
    try {
      const response = await fetch(source, {
        redirect: 'follow',
        cache: 'force-cache',
        headers: { 'user-agent': '3KingsConstruction/1.0' },
        signal: AbortSignal.timeout(10000),
      })
      const contentType = response.headers.get('content-type') || ''
      if (!response.ok || !contentType.toLowerCase().startsWith('image/')) continue
      const bytes = await response.arrayBuffer()
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          'content-type': contentType,
          'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          'content-disposition': 'inline',
          'x-content-type-options': 'nosniff',
        },
      })
    } catch {
      // Try the next public Google Drive image endpoint.
    }
  }

  return NextResponse.json({ ok: false, error: 'drive_image_unavailable' }, { status: 502 })
}
