export const pct = (v: number | null | undefined) => `${Math.round((v || 0) * 100)}%`
export const dateTH = (v: string | null | undefined) => {
  if (!v) return '-'
  const d = new Date(`${v}T00:00:00`)
  return new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }).format(d)
}
export const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
export const statusLabel = (s?: string | null) => s || 'ยังไม่ระบุ'
