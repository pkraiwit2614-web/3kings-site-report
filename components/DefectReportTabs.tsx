'use client'

import Link from 'next/link'

type DefectReportTabsProps = { active: 'condo' | 'common' }

/** Presentation-only navigation. Keeps existing Condo Report state, queries and tables intact. */
export default function DefectReportTabs({ active }: DefectReportTabsProps) {
  return <>
    <nav className="defect-report-subtabs" aria-label="เลือกประเภท Defect Report">
      <Link href="/defects" aria-current={active === 'condo' ? 'page' : undefined} className={active === 'condo' ? 'is-active' : ''}>Condo</Link>
      <Link href="/defects/common" aria-current={active === 'common' ? 'page' : undefined} className={active === 'common' ? 'is-active' : ''}>Common</Link>
    </nav>
    <style jsx>{`
      .defect-report-subtabs{display:flex;align-items:center;gap:4px;margin:0 0 12px;padding:4px;background:var(--surface);border:1px solid var(--line);border-radius:12px;width:max-content;max-width:100%}
      .defect-report-subtabs :global(a){text-decoration:none;font-size:12px;font-weight:800;min-width:116px;text-align:center;border-radius:8px;padding:9px 15px;color:var(--muted)}
      .defect-report-subtabs :global(a:hover){background:#eff5fb;color:var(--navy)}
      .defect-report-subtabs :global(a.is-active){background:var(--navy);color:#fff}
      .defect-report-subtabs :global(a:focus-visible){outline:2px solid var(--blue);outline-offset:2px}
      @media print{.defect-report-subtabs{display:none!important}}
    `}</style>
  </>
}
