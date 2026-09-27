'use client'

import { useEffect } from 'react'

type StatusTone = 'good' | 'warn' | 'bad' | 'neutral'

type SitePerformanceData = {
  code: string
  name: string
  statusLabel: string
  statusTone: StatusTone
  total: number
  delayed: number
  blockers: number
}

function textOf(node: Element | null | undefined) {
  return (node?.textContent || '').trim()
}

function countOf(text: string) {
  const match = text.match(/\d+/)
  return match ? Number(match[0]) : 0
}

function statusOf(raw: string, className = ''): { label: string; tone: StatusTone } {
  const value = raw.trim().toLowerCase()
  const classes = className.toLowerCase()

  if (value.includes('on track') || value.includes('ตามแผน') || classes.includes('good')) {
    return { label: 'ตามแผน', tone: 'good' }
  }
  if (value.includes('at risk') || value.includes('เสี่ยง') || classes.includes('warn')) {
    return { label: 'เสี่ยงล่าช้า', tone: 'warn' }
  }
  if (value.includes('delay') || value.includes('ล่าช้า') || classes.includes('bad')) {
    return { label: 'ล่าช้า', tone: 'bad' }
  }

  return { label: raw.trim() || 'ยังไม่ระบุ', tone: 'neutral' }
}

function metricCount(link: HTMLAnchorElement, label: 'Delayed' | 'Blocker') {
  const labelNode = Array.from(link.querySelectorAll('small')).find(
    (node) => textOf(node) === label,
  )
  const box = labelNode?.parentElement
  return countOf(textOf(box?.querySelector('b')))
}

function readCard(link: HTMLAnchorElement): SitePerformanceData | null {
  const originalContent = Array.from(link.children).find(
    (node) => node instanceof HTMLElement && !node.classList.contains('spc-card-view'),
  )
  const headerRow = originalContent?.querySelector('.row.between') || link.querySelector('.row.between')
  const siteBlock = headerRow?.querySelector('div')
  const code = textOf(siteBlock?.querySelector('b'))
  const name = textOf(siteBlock?.querySelector('small'))
  const badge = headerRow?.querySelector('.badge') as HTMLElement | null
  const status = statusOf(textOf(badge), badge?.className || '')

  const ring = link.querySelector(':scope > svg')
  const aria = ring?.getAttribute('aria-label') || ''
  const totalFromAria = aria.match(/จาก\s*(\d+)\s*งาน/)
  const totalText = Array.from(ring?.querySelectorAll('text') || []).find((node) => /^\d+$/.test(textOf(node)))
  const total = totalFromAria ? Number(totalFromAria[1]) : countOf(textOf(totalText))
  const delayed = metricCount(link, 'Delayed')
  const blockers = metricCount(link, 'Blocker')

  if (!code || !total) return null

  return {
    code,
    name,
    statusLabel: status.label,
    statusTone: status.tone,
    total,
    delayed,
    blockers,
  }
}

function make(tag: string, className?: string, text?: string) {
  const el = document.createElement(tag)
  if (className) el.className = className
  if (text !== undefined) el.textContent = text
  return el
}

function makeMetric(label: string, count: number, total: number, tone: 'delayed' | 'blocker') {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const box = make('div', `spc-metric ${tone}`)
  const top = make('div', 'spc-metric-top')
  top.append(make('span', 'spc-metric-label', label), make('em', undefined, `${pct}%`))
  box.append(top)
  box.append(make('strong', undefined, `${count} งาน`))

  const meter = make('span', 'spc-meter')
  const fill = make('i') as HTMLElement
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`
  meter.append(fill)
  box.append(meter)
  return box
}

function renderCompactCard(link: HTMLAnchorElement, data: SitePerformanceData) {
  const signature = [
    data.code,
    data.name,
    data.statusLabel,
    data.statusTone,
    data.total,
    data.delayed,
    data.blockers,
  ].join('|')

  link.classList.add('spc-enhanced')
  if (link.dataset.spcSignature === signature && link.querySelector(':scope > .spc-card-view')) return

  link.dataset.spcSignature = signature
  link.querySelector(':scope > .spc-card-view')?.remove()

  const view = make('div', 'spc-card-view')
  view.setAttribute('aria-hidden', 'true')

  const head = make('div', 'spc-head')
  const site = make('div', 'spc-site')
  site.append(make('b', undefined, data.code), make('small', undefined, data.name))
  head.append(site, make('span', `spc-status ${data.statusTone}`, data.statusLabel))

  const comparison = make('div', 'spc-comparison')
  const total = make('div', 'spc-total')
  total.append(make('span', undefined, 'งานทั้งหมด'), make('b', undefined, String(data.total)), make('em', undefined, 'Task'))
  comparison.append(
    total,
    makeMetric('Delayed', data.delayed, data.total, 'delayed'),
    makeMetric('Blocker', data.blockers, data.total, 'blocker'),
  )

  const open = make('div', 'spc-open')
  open.append(document.createTextNode('ดูรายละเอียด'), make('span', undefined, '→'))

  view.append(head, comparison, open)
  link.append(view)
}

function enhanceSitePerformance() {
  const section = document.getElementById('site-performance')
  if (!section) return

  const subtitle = section.querySelector('.module-title small')
  const compactSubtitle = 'เปรียบเทียบงานทั้งหมด • Delayed • Blocker ราย Site / Plot'
  if (subtitle && textOf(subtitle) !== compactSubtitle) subtitle.textContent = compactSubtitle

  const links = Array.from(section.querySelectorAll('a[href^="/projects/"]')) as HTMLAnchorElement[]
  const grid = links[0]?.parentElement
  grid?.classList.add('spc-grid')

  links.forEach((link) => {
    const data = readCard(link)
    if (data) renderCompactCard(link, data)
  })
}

export default function SitePerformanceSyncLineGuard20260927() {
  useEffect(() => {
    let frame = 0
    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(enhanceSitePerformance)
    }

    enhanceSitePerformance()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  return null
}
