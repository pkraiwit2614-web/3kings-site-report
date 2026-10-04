'use strict'

const A4_LANDSCAPE_MM = Object.freeze({width: 297, height: 210})
const PAGE = Object.freeze({margin: 10, header: 18, meta: 12, workerRow: 8, footer: 8, gap: 3})
const FINANCIAL_AUTHORITY_STATUSES = new Set(['verified', 'external_verified'])

function thaiGraphemeCount(value) {
  const text = String(value || '').normalize('NFC')
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter('th', {granularity: 'grapheme'}).segment(text)].length
  }
  return [...text].length
}

function estimatedLines(text, widthMm, fontPt = 9) {
  const graphemes = thaiGraphemeCount(text)
  const avgCharMm = fontPt * 0.352778 * 0.52
  const capacity = Math.max(1, Math.floor(widthMm / avgCharMm))
  return Math.max(1, Math.ceil(graphemes / capacity))
}

function canonicalizeLabourRows(rows) {
  const pages = new Map()
  for (const row of rows || []) {
    if (!row || row.entity_type !== 'worker' || !row.work_date || !row.worker_key) continue
    let page = pages.get(row.work_date)
    if (!page) {
      page = {work_date: row.work_date, supervisors: new Set(), projects: new Set(), workers: new Map(), details: new Set(), source_statuses: new Set()}
      pages.set(row.work_date, page)
    }
    if (row.supervisor_key) page.supervisors.add(row.supervisor_key)
    if (row.project) page.projects.add(row.project)
    if (row.work_detail) page.details.add(String(row.work_detail).trim())
    if (row.verification_status) page.source_statuses.add(row.verification_status)
    if (!page.workers.has(row.worker_key)) page.workers.set(row.worker_key, {worker_key: row.worker_key})
  }
  return [...pages.values()].sort((a,b) => a.work_date.localeCompare(b.work_date)).map(page => ({
    work_date: page.work_date,
    supervisors: [...page.supervisors].sort(),
    projects: [...page.projects].sort(),
    workers: [...page.workers.values()].sort((a,b) => a.worker_key.localeCompare(b.worker_key)),
    detail: [...page.details].filter(Boolean).join(' • '),
    source_statuses: [...page.source_statuses].sort()
  }))
}

function planLabourPage(page) {
  const width = A4_LANDSCAPE_MM.width
  const height = A4_LANDSCAPE_MM.height
  const contentWidth = width - PAGE.margin * 2
  let y = PAGE.margin
  const boxes = []
  const push = (name, h, extra = {}) => {
    const box = {name, x: PAGE.margin, y, width: contentWidth, height: Number(h.toFixed(2)), ...extra}
    boxes.push(box)
    y = Number((y + h + PAGE.gap).toFixed(2))
    return box
  }

  push('header', PAGE.header)
  push('meta', PAGE.meta, {work_date: page.work_date, projects: page.projects})

  let fontPt = 9
  let detailLines = estimatedLines(page.detail, contentWidth - 8, fontPt)
  let detailHeight = 8 + detailLines * 4.2
  const fixedAfterDetail = page.workers.length * (PAGE.workerRow + PAGE.gap) + PAGE.footer + PAGE.gap
  const remaining = height - PAGE.margin - y - fixedAfterDetail
  if (detailHeight > remaining) {
    fontPt = 8
    detailLines = estimatedLines(page.detail, contentWidth - 8, fontPt)
    detailHeight = 8 + detailLines * 3.8
  }
  push('detail', detailHeight, {font_pt: fontPt, lines: detailLines, text: page.detail})

  page.workers.forEach((worker, index) => push(`worker-${index+1}`, PAGE.workerRow, {worker_key: worker.worker_key}))
  push('footer', PAGE.footer)

  const maxBottom = Math.max(...boxes.map(b => b.y + b.height))
  const overlap = boxes.some((box, i) => i > 0 && box.y < boxes[i-1].y + boxes[i-1].height)
  return {
    page_size_mm: A4_LANDSCAPE_MM,
    orientation: 'landscape',
    work_date: page.work_date,
    worker_count: page.workers.length,
    projects: page.projects,
    source_statuses: page.source_statuses,
    boxes,
    overlap,
    fits: maxBottom <= height - PAGE.margin
  }
}

function normalizedGolden(pagePlans) {
  return {
    page_count: pagePlans.length,
    pages: pagePlans.map(plan => ({
      work_date: plan.work_date,
      page_size_mm: plan.page_size_mm,
      orientation: plan.orientation,
      worker_count: plan.worker_count,
      projects: plan.projects,
      source_statuses: plan.source_statuses,
      overlap: plan.overlap,
      fits: plan.fits,
      detail: (() => {
        const b = plan.boxes.find(x => x.name === 'detail')
        return {font_pt: b.font_pt, lines: b.lines, height: b.height}
      })()
    }))
  }
}

function financialReconciliationGate(fixture) {
  const records = Array.isArray(fixture?.records) ? fixture.records : []
  const authorityRecords = records.filter(r => FINANCIAL_AUTHORITY_STATUSES.has(r.status))
  if (!fixture?.authoritative_verified_export) {
    return {
      status: 'BLOCKED',
      reason: 'NO_AUTHORITATIVE_VERIFIED_PAYROLL_FIXTURE',
      authority_record_count: authorityRecords.length,
      exported_rows: []
    }
  }

  const invalid = authorityRecords.filter(record => {
    if (record.status === 'external_verified') return !record.external_reference
    return (record.items || []).some(item => item.calculation_status !== 'excluded' &&
      (!['calculated','manual'].includes(item.calculation_status) || typeof item.total_pay !== 'number'))
  })
  if (invalid.length) return {status:'FAIL', reason:'VERIFIED_RECORD_MISSING_AUTHORIZED_TOTALS', authority_record_count:authorityRecords.length, exported_rows:[]}

  return {status:'PASS', reason:null, authority_record_count:authorityRecords.length, exported_rows:fixture.authoritative_verified_export}
}

module.exports = {
  A4_LANDSCAPE_MM,
  canonicalizeLabourRows,
  planLabourPage,
  normalizedGolden,
  financialReconciliationGate,
  FINANCIAL_AUTHORITY_STATUSES
}
