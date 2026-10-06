'use client'

import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import {GoogleCalendarManager} from '@/components/GoogleCalendarManager'

export default function WorkCalendarPage(){
  return <AppShell>
    <PageHeader
      title="ปฏิทินงาน"
      subtitle="Google Calendar เป็น Source of Truth เดียว • ผู้ใช้ทำงานผ่านหน้า 3Kings ตามสิทธิ์ที่ได้รับ"
    />
    <GoogleCalendarManager/>
  </AppShell>
}
