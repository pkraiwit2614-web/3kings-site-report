# 3 Kings LINE AutoPilot — Consolidated staging source

This directory contains a source-only refactor of the currently deployed 3kings-line-autopilot Cloudflare Worker. Its actual Daily Sender lives in ../dailySiteSendTick.mjs and is imported once. The generic webhook and sync-failure collector remain in worker.mjs.

This is NOT a replacement Worker deployment, and no new LINE sender, public Next.js webhook, Cloudflare Cron or secrets have been configured. The existing Worker still runs separately and is untouched.

No wrangler production configuration is committed intentionally. Do NOT run wrangler deploy directly from this directory or substitute this draft over the live Worker. Consult docs/LINE_AUTOPILOT_CONSOLIDATED_P0P1_2026-10-20.md and complete the later release gate.

All CI tests use synthetic groups and mock requests; they must not push LINE messages or mutate Supabase.
