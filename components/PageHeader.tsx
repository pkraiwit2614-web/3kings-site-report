import type { ReactNode } from 'react'
import PrintButton from '@/components/PrintButton'

export default function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const resolvedSubtitle = title === 'Schedule / Plan vs Actual'
    ? 'ภาพรวมแผนงานทั้งหมดเปรียบเทียบหน้างานจริง'
    : subtitle
  const showDefectPrint = title === 'Above Condo — Defect Report'

  return <div className="page-header">
    <div><h1>{title}</h1>{resolvedSubtitle && <p>{resolvedSubtitle}</p>}</div>
    {showDefectPrint
      ? <div className="page-header-print-actions">{action}<PrintButton /></div>
      : action}
  </div>
}
