'use client'

import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import GoogleCalendarManager from '@/components/GoogleCalendarManager'

export default function WorkCalendarPage(){
  return <AppShell>
    <PageHeader
      title="ปฏิทินงาน"
      subtitle="Google Calendar เป็น Source of Truth เดียว • เพิ่ม แก้วันที่/เวลา รายละเอียด และลบ Event จากหน้า 3Kings ได้"
    />
    <GoogleCalendarManager/>
  </AppShell>
}
