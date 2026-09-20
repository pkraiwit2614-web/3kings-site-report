# 3 Kings Site Report V3.1

Production-oriented Next.js app for 3 Kings Construction site reporting.

Supabase production data is already loaded: 305 schedule tasks, 418 material rows and 5 purchasing follow-up rows.

## First login
Open `/login` and choose **ตั้งค่า Manager คนแรก**. The first successful Supabase Auth user is automatically assigned the `manager` role by the database trigger. If email confirmation is enabled, confirm the email once and then sign in normally.

## Features
- Management Dashboard
- Daily Site Report linked to Schedule
- Plan vs Actual / Delay Days / Blocker / Next Action
- Private site photo storage
- Materials and Purchasing tracking
- Report History
- Weekly Management Report / Print to PDF
- Mobile-first responsive UI

Never commit a Supabase secret/service-role key to this repository.