'use client'

import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import {GoogleCalendarManager} from '@/components/GoogleCalendarManager'

export default function WorkCalendarPage(){
  return <AppShell>
    <PageHeader
      title="ปฏิทินงาน"
      subtitle="Google Calendar ส่วนกลาง + ปฏิทิน Web App • เพิ่มและแก้ไขได้ตามสิทธิ์ โดยไม่ต้องเชื่อมบัญชี Google ส่วนตัว"
    />
    <GoogleCalendarManager/>
  </AppShell>
}
