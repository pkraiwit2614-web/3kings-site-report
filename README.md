# 3 Kings Site Report V3.1

Production-oriented Next.js app for 3 Kings Construction site reporting.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fpkraiwit2614-web%2F3kings-site-report&project-name=3kings-site-report&repository-name=3kings-site-report)

Supabase production data is already loaded: 305 schedule tasks, 418 material rows and 5 purchasing follow-up rows.

## First login
Open `/login` and choose **ตั้งค่า Manager คนแรก**. The first successful Supabase Auth user is automatically assigned the `manager` role by the database trigger. If email confirmation is enabled, confirm the email once and then sign in normally.

Subsequent sign-ups are created as `foreman` with `active=false` and cannot access project data until approved.

## Features
- Management Dashboard
- Daily Site Report linked to Schedule
- Plan vs Actual / Delay Days / Blocker / Next Action
- Private site photo storage with signed URLs for report history
- Materials and Purchasing tracking
- Report History
- Weekly Management Report / Print to PDF
- Mobile-first responsive UI
- GitHub Actions build verification on `main`

## Deployment
The app contains the Supabase project URL and **publishable** browser key as safe defaults. RLS is enabled on all exposed tables, so no secret/service-role key is required in Vercel.

Import this repository into Vercel with the button above. Vercel should detect Next.js automatically and use the default build command.

Never commit a Supabase secret/service-role key to this repository.
