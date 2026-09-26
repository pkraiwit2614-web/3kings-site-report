import type { ReactNode } from 'react'
import PrintButton from '@/components/PrintButton'

const printableTitles=new Set([
  'Above Condo — Defect Report',
  'วัสดุ เครื่องมือและผู้รับเหมา',
  'Schedule / Plan vs Actual',
  'การจัดซื้อ/จัดจ้าง'
])

export default function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const resolvedSubtitle = title === 'Schedule / Plan vs Actual'
    ? 'ภาพรวมแผนงานทั้งหมดเปรียบเทียบหน้างานจริง'
    : subtitle
  const printable=printableTitles.has(title)

  return <>
    <div className="page-header">
      <div><h1>{title}</h1>{resolvedSubtitle && <p>{resolvedSubtitle}</p>}</div>
      {printable
        ? <div className="page-header-print-actions">{action}<PrintButton reportTitle={title}/></div>
        : action}
    </div>

    {printable&&<section className="report-print-header" aria-hidden="true">
      <div className="report-print-brand">
        <div className="report-print-mark">3K</div>
        <div><b>3 Kings Construction</b><span>Management Report</span></div>
      </div>
      <div className="report-print-title-row">
        <div><span>REPORT</span><h1>{title}</h1></div>
        <div className="report-print-date"><span>วันที่พิมพ์</span><b className="report-print-generated-at">—</b></div>
      </div>
      <div className="report-print-filters"><b>เงื่อนไขที่ใช้</b><span className="report-print-filter-summary">ทั้งหมด</span></div>
    </section>}
  </>
}
