'use client'

import { Fragment, useState } from 'react'
import './ReadableDetail.css'

type ReadableDetailProps = {
  parts: Array<string | null | undefined>
}

// Read-only presentation: never alters source notes or procurement status.
export default function ReadableDetail({ parts }: ReadableDetailProps) {
  const [expanded, setExpanded] = useState(false)
  const seen = new Set<string>()
  const lines: string[] = []

  for (const part of parts) {
    if (!part) continue
    for (const item of String(part).split(/\s*•\s*|\r?\n+|[;；]\s*(?=\S)/g)) {
      const line = item.trim()
      if (line && !seen.has(line)) {
        lines.push(line)
        seen.add(line)
      }
    }
  }

  if (!lines.length) return <span className="muted">-</span>

  // Show the first source fact and the three most recently appended details.
  const hiddenCount = Math.max(0, lines.length - 4)

  return (
    <div className={`readable-detail${expanded ? ' is-expanded' : ''}`}>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index === 1 && hiddenCount > 0 && (
            <div className="readable-detail-gap" aria-hidden="true">
              ซ่อนอีก {hiddenCount} ประเด็น — เปิดดูรายละเอียดทั้งหมดได้
            </div>
          )}
          <div className={`readable-detail-line${hiddenCount > 0 && index > 0 && index < lines.length - 3 ? ' readable-detail-hidden' : ''}`}>
            {line}
          </div>
        </Fragment>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          className="readable-detail-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
        >
          {expanded ? 'ย่อรายละเอียด' : `ดูรายละเอียดทั้งหมด (${lines.length} ประเด็น)`}
        </button>
      )}
    </div>
  )
}
