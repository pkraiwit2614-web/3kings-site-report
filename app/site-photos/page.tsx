import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import SitePhotosGallery from '@/components/SitePhotosGallery'

export default function SitePhotosPage(){
  return <AppShell>
    <PageHeader title="รูปภาพหน้างาน" subtitle="ดูรูปตัวอย่างล่าสุดของแต่ละ Site / Plot และเปิดโฟลเดอร์รูปใน Google Drive ได้โดยตรง" />
    <SitePhotosGallery />
  </AppShell>
}
