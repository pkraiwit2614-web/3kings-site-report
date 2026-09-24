import type { ReactNode } from 'react'

export default function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const resolvedSubtitle = title === 'Schedule / Plan vs Actual'
    ? 'ภาพรวมแผนงานทั้งหมดเปรียบเทียบหน้างานจริง'
    : subtitle

  return <div className="page-header"><div><h1>{title}</h1>{resolvedSubtitle && <p>{resolvedSubtitle}</p>}</div>{action}</div>
}
