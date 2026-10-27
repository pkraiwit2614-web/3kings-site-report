# 3 Kings Construction — HOME TO OFFICE FINAL HANDOFF (27 Oct 2026)

> **Document Status: HOME FINAL HANDOFF VERIFIED / NOT PRODUCTION-UNGOVERNED**
> **Session Origin:** HOME Machine (Windows User: 501915 / Antigravity Agent)
> **Target Machine:** OFFICE Machine (Acer / Antigravity IDE)
> **Repository:** `pkraiwit2614-web/3kings-site-report`
> **Timestamp:** 2026-10-27T23:45:00+07:00 (Asia/Bangkok)
> **Active SOP Authority:** Google Drive `00-SOP_INDEX - 3Kings Construction` (`1ZUO3eGCFd88l_R2aCH2EnIMJ-rlbyIoMxD3sY-9j1Pg`, Rev 22/10/2026) — 21 Entries (17 Core + EX, SUP-PR, SUP-VO, SUP-PUBLISH).

---

## 1. Executive Summary

เครื่องบ้าน (Home Machine) ได้ทำการปิดรอบการทำงานประจำวัน (Final Closeout) โดยประเมินผลจากหลักฐานจริงข้ามทุกระบบ (GitHub, Git Worktrees, CI, Vercel Production, Supabase, Google Drive, Google Apps Script) ตามลำดับ:

1. **ไม่มี Background Process หรือ Agent ค้างในเครื่องบ้าน**: ตรวจสอบ `manage_task` (0 running), `manage_subagents` (0 active), node processes มีเพียง MCP server (`3kings-drive-gas-readonly` PID 21300) ที่ทำงานแบบ lazy-read เท่านั้น
2. **PR #167 (Express PO -> Master Delta Reconciliation & Isolated Registry Read Model) ถูก MERGED เข้า `main` สำเร็จ**:
   - Merge Commit: `940a5aa8c7d5ce049e76276ca14cf03dff5d898b`
   - CI Check บน `main`: SUCCESS (Run `40540579879`, duration 1m11s)
   - Vercel Production Deployment: `dpl_88D3igKT3ESHRvBY1wDrggc6st2y` (Ready, URL: `https://3kings-site-report-m4whggpmh-kraiwit-p-golfiiz-sqr.vercel.app`, Alias: `https://3kings-site-report.vercel.app`)
   - **Production Notice**: โค้ด Web App และ API routes ถูก Release บน Production แล้ว แต่ตารางฐานข้อมูล `express_register_runs` และ `express_register_rows` บน Supabase Production ยังไม่ได้ migrate และฟังก์ชัน Google Apps Script Bridge ยังรอการ Trigger ของ Owner ตามเงื่อนไขความปลอดภัย
3. **PR #224 (LINE Late QA Catchup 18:00 Bangkok) MERGED**: Commit `a89f5b2` ปิดข้อจำกัดเวลาส่ง Daily Owner DM
4. **PR #225 (SSO Boundary Diagnostics) MERGED**: Commit `8bdee77`
5. **PR #229 (B515 Defect Reconcile) OPEN**: Push Commit ล่าสุด `e242e55` ขึ้น `origin/sync_room_b515_defect` แล้ว อยู่ระหว่าง CI checks บน GitHub Actions
6. **PR #228 (GPT-first Materials Queue GAS Adapter) DRAFT**: Commit `8e9c426` บน `feat/gpt-first-materials-queue-20261027`, CI PASS ครบ 12 isolated safety tests, มีไฟล์สำรอง GAS อยู่ใน `Backup/gas_production_backup_20261027_pre_gpt_queue.json`
7. **Local Git Worktrees ปลอดภัย**: ตรวจสอบทั้ง 34 worktrees ทุกชิ้นงานไม่มี Unpushed work หรือ Dirty file ที่เป็นความลับ

---

## 2. Completed Tasks พร้อมหลักฐานปลายทาง

| Workstream | รายละเอียดงาน | หลักฐานยืนยัน (Evidence) | สถานะ |
|---|---|---|---|
| **Procurement / Express PO** | Merge PR #167 delta reconciliation & isolated registry read model | Git Commit `940a5aa`, PR #167 MERGED, CI Run `40540579879` PASS | `DONE_VERIFIED` (Code/Web) / `PENDING` (DB Migration/GAS Sync) |
| **Web Production** | Vercel Production build & deployment จาก commit `940a5aa` | Vercel Deployment ID `dpl_88D3igKT3ESHRvBY1wDrggc6st2y` Status: Ready, Alias `https://3kings-site-report.vercel.app` Active | `DONE_VERIFIED` |
| **LINE Gateway** | ปรับเวลา Owner DM delivery จาก 13:00 เป็นรองรับ QA เสร็จจนถึง 18:00 Bangkok (PR #224) | Commit `a89f5b2`, PR #224 MERGED, CI PASS | `DONE_VERIFIED` |
| **Authentication / SSO** | ติดตั้ง secret-free SSO boundary diagnostics (PR #225) | Commit `8bdee77`, PR #225 MERGED, CI PASS | `DONE_VERIFIED` |
| **Calendar Sync Adapter** | SOP 12 Google Calendar auto sync adapter & operational guidelines (PR #221) | Commit `b9526ed`, PR #221 MERGED, CI PASS | `DONE_VERIFIED` |
| **Defect Work Order UI** | ซ่อนข้อความตรวจข้อขัดแย้งเฉพาะการแสดงผล UI (PR #215) | Commit `a4b033f`, PR #215 MERGED, CI PASS | `DONE_VERIFIED` |
| **SOP Governance** | ปรับปรุง Agent Routing ตาม Canonical v3.0 (SOP 01/02/04, 06/07, 08/11, EX/PUBLISH) | PR #218, #219, #220 MERGED, Drive INDEX verified 21 rows | `DONE_VERIFIED` |
| **GAS Production Backup** | สำรองโค้ด GAS Production 26 ไฟล์ก่อนเตรียม GPT Queue | `Backup/gas_production_backup_20261027_pre_gpt_queue.json` | `DONE_LOCAL` |

---

## 3. Pending / Blocked / HOLD Tasks

| ID | Task / Workstream | สาเหตุ / ข้อจำกัด (Blocker/Gate) | เงื่อนไขการปลดล็อค | สถานะ |
|---|---|---|---|---|
| **P0-1** | Daily 24 Oct (นายช่างต่อ) | ยอดคนงานรวม 12 คน แต่ Form gender split ระบุ ชาย 7 + หญิง 4 = 11 คน (ขาดระบุเพศ 1 คน) | ห้ามเดาเพศคนงานเอง; รอ Owner ยืนยันข้อมูลปฐมภูมิของคนงานคนที่ 12 | `BLOCKED` |
| **P0-2** | A421 Customer Defect | Work IDs `DF-A421-01` ถึง `DF-A421-09` รอการตรวจหน้างานจริง และรอวันที่รับมอบงานที่พิสูจน์ได้ | ตรวจ onsite inspection + verified receipt date ก่อนปล่อย Work Order | `BLOCKED` |
| **PR #229** | B515 Defect Reconciliation | Commit `e242e55` push ขึ้น GitHub แล้ว; CI job กำลังรันบน GitHub Actions | รอ CI PASS บน GitHub; ไม่ต้องเขียน Master ซ้ำ | `READY_TO_RESUME` |
| **PR #228** | GPT-first Materials Queue (GAS) | Draft PR มีโค้ดพร้อมและ CI PASS แต่ห้าม Deploy อัตโนมัติ | ต้องให้ Owner เข้า Apps Script รันเทียบ 26 ไฟล์ และกดอนุญาต OAuth ครั้งเดียว | `HOLD` (Owner Action) |
| **PR #226** | Viewer Test Account & Activation Gates | รอยืนยัน Auth User และ Password Setup ใน Supabase แยก | รอ Admin สร้าง Isolated Auth Account ใน staging | `READY_TO_RESUME` |
| **PR #222** | Calendar 188 Baseline Scheduled Sync | Draft PR; Flag `CALENDAR_SYNC_ENABLED=false` ถูกปิดไว้ | รอ Owner ให้ความยินยอม Calendar OAuth Scope ใน Apps Script | `HOLD` (Owner Action) |
| **PR #213** | Migration Version 20261013220000 Drift | รอยืนยันแผน Replay บนฐานทดสอบแยก ไม่ให้กระทบ Production | ทำ Isolated local replay เพื่อสร้าง Unique version chain | `PENDING` |
| **PR #209** | Photo WIF Fast-Track (#206) | รอยืนยัน Google Cloud Workload Identity Federation (WIF) provider ใน GitHub environment | ตรวจสอบ GCP IAM WIF mapping ก่อนทดสอบจริง | `HOLD` |
| **PR #197** | Scoped XLSX Original Writeback (Materials) | สลับไปใช้สถาปัตยกรรม PR #167 (Master-first Delta Reconciliation) แล้ว | ตรวจสอบเพื่อปิดหรือ Archive หลัง PR #167 ใช้งานจริงสมบูรณ์ | `HOLD` |

---

## 4. Master Task Register

| หมวดงาน | Task Name | สถานะ | Branch / Ref | ผล Test / CI | Next Action | Priority | เครื่องรับผิดชอบ |
|---|---|---|---|---|---|:---:|:---:|
| 1. Daily Site Report | Daily Report Gateway & Command Routing | `DONE_VERIFIED` | `main` (`0944bb3`) | CI PASS | ติดตามการทำงานตามรอบปกติ | P2 | Acer Office |
| 1. Daily Site Report | Daily 24 Oct ช่างต่อ (คนงานคนที่ 12) | `BLOCKED` | - | Form mismatch | ขอข้อมูลเพศคนงานคนที่ 12 จาก Owner | P0 | Acer Office |
| 2. LINE Owner Delivery | Owner Delivery 18:00 Catchup | `DONE_VERIFIED` | `main` (`a89f5b2`) | CI PASS (12 tests) | ใช้งานตามกำหนดเวลา | P2 | Acer Office |
| 3. Google Apps Script | GAS Production 26-File Snapshot | `DONE_LOCAL` | `gpt_materials_sync_prod` | Local backup | เก็บหลักฐานปลอดภัย | P3 | Home (Archived) |
| 3. Google Apps Script | GPT-first Materials Sync Queue | `HOLD` | `feat/gpt-first-materials-queue-20261027` (PR #228) | CI PASS (12 tests) | Owner approve OAuth ใน Apps Script | P1 | Acer Office |
| 4. Calendar / Drive | SOP 12 Google Calendar Auto Sync | `DONE_VERIFIED` | `main` (`b9526ed`) | CI PASS | ใช้งานตาม SOP 12 | P2 | Acer Office |
| 4. Calendar / Drive | Calendar Scheduled Dry-Run Sync | `HOLD` | `feat/calendar-dry-run-and-sync-adapter` (PR #222) | CI PASS | Owner Grant OAuth Scope | P1 | Acer Office |
| 5. Supabase / Auth | SSO Boundary Diagnostics | `DONE_VERIFIED` | `main` (`8bdee77`) | CI PASS | สแตนด์บายเพื่อตรวจสอบ SSO | P3 | Acer Office |
| 5. Supabase / Auth | QA Viewer Identity Activation | `READY_TO_RESUME` | `docs/qa-viewer-identity-20261026` (PR #226) | CI PASS | Review & Merge เมื่อสร้าง test user | P2 | Acer Office |
| 5. Supabase / Auth | Migration 20261013220000 Collision | `PENDING` | `fix/duplicate-migration-20261013220000` (PR #213) | Replay in progress | ทดสอบ unique timestamp chain บน local | P2 | Acer Office |
| 6. Defect / Work Order | B515 Customer Defect Reconciliation | `READY_TO_RESUME` | `sync_room_b515_defect` (PR #229) | CI running (`40542068944`) | ตรวจผล CI บน GitHub -> Review & Merge | P0 | Acer Office |
| 6. Defect / Work Order | A421 Customer Defect (9 Work IDs) | `BLOCKED` | - | Awaiting onsite | รอผลตรวจ onsite และใบมอบงาน | P0 | Acer Office |
| 7. Materials / PO | PR #167 Delta Reconciliation & Registry | `MERGED_UNVERIFIED` | `main` (`940a5aa`) | CI PASS, Prod Deployed | รัน migration ตาราง registry และ sync ใน Prod | P1 | Acer Office |
| 7. Materials / PO | Safe Scoped XLSX Writeback | `HOLD` | `feat/scoped-xlsx-original-writeback-20261021` (PR #197) | Staging only | พิจารณา Archive หลัง PR #167 นิ่ง | P3 | Acer Office |
| 8. Excel/Drive Sync | Drive Sync Route & Override Protection | `DONE_VERIFIED` | `main` (`940a5aa`) | CI PASS | ทำงานตามรอบ Sync ปกติ | P2 | Acer Office |
| 9. GitHub/Vercel/Prod | Vercel Production Deployment | `DONE_VERIFIED` | `main` (`940a5aa`) | Vercel Ready (`dpl_88D3...`) | ตรวจสอบ E2E readback บน Production | P1 | Acer Office |
| 10. QA Viewer / Security | Photo WIF Safe Executor (#206) | `HOLD` | `fix/206-photo-fasttrack-safe-executor-20261021` (PR #209) | CI PASS | รอการตั้งค่า WIF บน GitHub Env | P2 | Acer Office |

---

## 5. Git Branch / Commit / PR Status

- **GitHub Remote:** `origin` -> `https://github.com/pkraiwit2614-web/3kings-site-report.git`
- **Main Branch HEAD:** `940a5aa8c7d5ce049e76276ca14cf03dff5d898b` (Merge PR #167)
- **Home Closeout Branch:** `home_final_closeout_handoff` (Fast-forwarded to `940a5aa`, updated with handoff documents)
- **Active Open Pull Requests:**
  - PR #229 (`sync_room_b515_defect`): OPEN, Commit `e242e55`
  - PR #228 (`feat/gpt-first-materials-queue-20261027`): DRAFT, Commit `8e9c426`
  - PR #226 (`docs/qa-viewer-identity-20261026`): OPEN, Commit `d6b976c`
  - PR #222 (`feat/calendar-dry-run-and-sync-adapter`): DRAFT, Commit `e5e406f`
  - PR #213 (`fix/duplicate-migration-20261013220000`): DRAFT
  - PR #210 (`docs/work-order-single-writer-consolidation-20261021`): DRAFT
  - PR #209 (`fix/206-photo-fasttrack-safe-executor-20261021`): DRAFT
  - PR #197 (`feat/scoped-xlsx-original-writeback-20261021`): DRAFT

---

## 6. CI / Build / Deployment Verification

1. **GitHub Actions CI on `main`**:
   - Run ID: `40540579879`
   - Event: `push` (`940a5aa`)
   - Outcome: **COMPLETED SUCCESS** (1m11s)
2. **Vercel Production Deployment**:
   - Deployment ID: `dpl_88D3igKT3ESHRvBY1wDrggc6st2y`
   - URL: `https://3kings-site-report-m4whggpmh-kraiwit-p-golfiiz-sqr.vercel.app`
   - Primary Alias: `https://3kings-site-report.vercel.app`
   - Status: **● Ready**
   - Created: 2026-10-27 23:24:21 GMT+0700
   - Commit: `940a5aa` (Merge PR #167)
3. **CI Checks on PR #229 (`sync_room_b515_defect`)**:
   - Run ID: `40542068944`
   - Jobs: `QA / Preview contracts` (PASS), `build` (PASS), `QA / Real Viewer Login + API + local RLS` (Pending in GitHub runner)

---

## 7. Uncommitted / Unpushed Work Audit (Home Machine)

การตรวจสอบ Worktree ทั้ง 34 ตัวบนเครื่องบ้าน:
- `home_final_closeout_handoff` (Current Worktree): กำลังเพิ่มไฟล์ Handoff `docs/handoffs/HOME_TO_OFFICE_HANDOFF_2026-10-27.md` และประวัติ `OFFICE_HANDOFF_2026-10-26.md` เพื่อ Push ขึ้น remote branch `home_final_closeout_handoff`
- `fix_express_po_auto_sync`: มี modified files ที่ตรงกับ PR #167 ซึ่งถูก Merge เข้า `main` เรียบร้อยแล้ว (ไม่มีงานค้างที่หายไป)
- `gas_audit_and_sync`: มี `docs/handoffs/2026-10-24_home_to_office.md` (ประวัติเก่า 24 ต.ค.)
- `gpt_materials_sync_prod`: มี `Backup/gas_production_backup_20261027_pre_gpt_queue.json` (ไฟล์ snapshot JSON โค้ด GAS 26 ไฟล์)
- `close_pr_167_zero_data_loss` & `close_pr_express_web`: มีเฉพาะ ephemeral folder `supabase/.temp/` จากการรัน local supabase test
- `home_computer_environment_setup` & `home_computer_work_readiness`: มี modified file `next-env.d.ts` (สร้างอัตโนมัติโดย Next.js dev server)
- **สรุป**: ไม่มีโค้ดหรือฟีเจอร์สำคัญที่ทำแล้วค้างอยู่โดยไม่ส่งขึ้น GitHub ทุกสิ่งที่พร้อมใช้งานถูก Push ขึ้น remote หมดแล้ว

---

## 8. Source of Truth และ Dependencies

1. **SOP Authority:** Google Drive `00-SOP_INDEX - 3Kings Construction` (`1ZUO3eGCFd88l_R2aCH2EnIMJ-rlbyIoMxD3sY-9j1Pg`), อัปเดตล่าสุด 22/10/2026
2. **Defect Master:** Canonical Google Drive Excel ID `1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj`
3. **Materials Master:** Google Drive Excel ID ที่ยืนยันแล้ว
4. **Google Apps Script Live Project:** Script ID สำหรับ Daily Line Autopilot และ Express Bridge (26 files snapshot)
5. **Database:** Supabase Production Project (PostgreSQL with RLS & Triggers)

---

## 9. Office Action Queue (จัดลำดับ P0 → P4)

### Priority P0 (Immediate Action / Critical Path)
1. **[P0 - Defect] ตรวจสอบผล CI ของ PR #229 (`sync_room_b515_defect`)**:
   - เมื่อ CI บน GitHub Actions รันเสร็จ (`gh pr checks 229`)
   - ตรวจความเรียบร้อยของ trigger `defect_web_override_protect()` และการรักษาสถานะ B515
   - ดำเนินการ Review และ Merge เข้า `main` ตามขั้นตอน SOP 15/16
2. **[P0 - Blocker Checklist] ติดตามข้อมูลภายนอก 2 รายการ**:
   - **P0-1**: ยืนยันเพศของคนงานคนที่ 12 ใน Daily 24 Oct (นายช่างต่อ) จาก Owner
   - **P0-2**: ยืนยันผลการตรวจ Onsite และวันรับมอบงานของห้อง A421 (9 Work IDs)

### Priority P1 (High Impact / Planned Integration)
3. **[P1 - Materials] ดำเนินการต่อสำหรับ PR #167 บน Production Supabase**:
   - โค้ด Web ขึ้น Production แล้ว (`940a5aa`)
   - นัดหมาย Owner ดำเนินการตาม runbook: รัน `expressBridgeMasterPrepareQA20261027()` ใน Apps Script เพื่อสร้าง QA candidate
   - ตรวจสอบความถูกต้องของ Master hash receipt
   - หากผ่านการอนุมัติ จึงรัน migration `20261022220800_express_registry_read_model.sql` บน Supabase Production และเปิด flag `EXPRESS_REGISTER_DISPLAY_ENABLED`
4. **[P1 - GAS / GPT Queue] PR #228 Staging Review**:
   - ตรวจสอบ runbook ใน PR #228 กับ Owner เพื่อเตรียม Authorize GAS script

### Priority P2 (Standard Enhancements / Reviews)
5. **[P2 - QA Viewer] PR #226 Review**: ตรวจสอบ runbook สำหรับ Isolated Viewer Test Account
6. **[P2 - Calendar] PR #222 Review**: รอ Owner OAuth consent เพื่อทดสอบ Dry-run sync
7. **[P2 - DB Migration] PR #213 Migration Drift**: รัน isolated test replay เพื่อแก้ duplicate timestamp collision

### Priority P3 - P4 (Low Risk / Maintenance)
8. **[P3 - Cleanup] Archive PR #197**: พิจารณาปิด PR #197 เมื่อ PR #167 ใช้งานได้สมบูรณ์
9. **[P4 - Photo] PR #209 WIF**: ตั้งค่า WIF environment เมื่อพร้อม

---

## 10. งานที่ห้ามทำซ้ำ (Do NOT Repeat)

1. **ห้ามเริ่มทำ PR #167 ซ้ำ**: PR #167 ถูก Merge เข้า `main` และ Deploy ขึ้น Vercel Production สำเร็จแล้ว
2. **ห้ามเขียนทับ B515 ใน Excel Master โดยไม่มีการ Sync**: การแก้ไข trigger ใน PR #229 ครอบคลุมการ sync แบบ non-destructive แล้ว
3. **ห้ามเดาหรือเปลี่ยนเพศคนงาน Daily 24 Oct เอง**: ต้องรอหลักฐานปฐมภูมิจาก Owner เท่านั้น
4. **ห้ามรัน Migration บน Supabase Production โดยไม่ผ่าน Isolated QA Local**: ให้ทดสอบบน local supabase CLI ก่อนเสมอ
5. **ห้าม Force Push หรือ Reset Main Branch**: รักษาประวัติ Git ตาม SOP

---

## 11. ความเสี่ยงที่ต้องระวัง (Risk Awareness)

- **Production Database Drift:** โค้ดบน Vercel Production มี API route สำหรับ express-register แล้ว แต่หากผู้ใช้เข้าใช้งานขณะที่ DB ยังไม่มีตาราง จะได้ response `status: no_import` ซึ่งปลอดภัยตาม fail-safe design แต่ห้ามเปิด flag แสดงผลบน UI จนกว่า DB migration จะรันเสร็จ
- **Multi-Worktree Concurrency:** เครื่องออฟฟิศ Acer อาจมี worktrees เดิมอยู่ ให้รัน `git worktree list` และตรวจสอบสถานะก่อน checkout หรือ pull
- **Secret Protection:** ห้าม commit credentials, `.env*` secrets, หรือ access tokens ลงใน repository เป็นอันขาด

---

## 12. OFFICE RESUME PROMPT (คัดลอกไปวางบน Antigravity IDE เครื่อง Acer)

```markdown
# 3 KINGS — OFFICE RESUME SESSION PROMPT (ACER / ANTIGRAVITY IDE)

รับช่วงงานต่อจาก Home Machine (Windows User: 501915) ประจำวันที่ 27/10/2026

## 1. Quick Environment Verification (PowerShell)
รันคำสั่งต่อไปนี้เพื่อตรวจสอบสถานะของเครื่อง Acer ก่อนเริ่มงาน:
```powershell
git rev-parse --show-toplevel
git status --short --branch
git worktree list
git fetch origin --prune
git log -n 5 --oneline origin/main
```

## 2. โหลด Handoff ล่าสุด
อ่านไฟล์ Handoff ล่าสุดจาก `origin/home_final_closeout_handoff` หรือ `main`:
```powershell
Get-Content docs/handoffs/HOME_TO_OFFICE_HANDOFF_2026-10-27.md
```

## 3. สรุปสถานะที่เครื่องบ้านทำจบแล้ว (ห้ามทำซ้ำ)
- PR #167 (Express PO Delta Reconciliation): MERGED เข้า `origin/main` (`940a5aa`) และ Deploy ขึ้น Vercel Production (`dpl_88D3igKT3ESHRvBY1wDrggc6st2y`) เรียบร้อยแล้ว
- PR #224 (LINE Catchup 18:00) และ PR #225 (SSO Diagnostics): MERGED แล้ว

## 4. รายการงานที่ต้องทำต่อทันที (Action Queue P0 -> P1)
1. **[P0] ตรวจสอบ PR #229 (`sync_room_b515_defect`)**:
   - รัน `gh pr checks 229` ตรวจสอบผล CI
   - หาก CI PASS ทั้งหมด ให้ดำเนินการ Code Review ตาม SOP 15 และเตรียม Merge เข้า `main`
2. **[P0] ติดตามข้อจำกัด 2 จุด**:
   - P0-1: ยืนยันเพศคนงานคนที่ 12 ของ Daily 24 Oct (นายช่างต่อ) จาก Owner
   - P0-2: ผล Onsite ตรวจห้อง A421 (9 Work IDs)
3. **[P1] ประสานงาน Owner ดำเนินการต่อสำหรับ PR #167**:
   - รัน Apps Script QA candidate: `expressBridgeMasterPrepareQA20261027()`
   - ตรวจ Master receipt ก่อน apply migration `20261022220800_express_registry_read_model.sql` บน Supabase Production

## 5. กฎความปลอดภัย
- ยึดถือ Google Drive SOP INDEX (`1ZUO3eGCFd88l_R2aCH2EnIMJ-rlbyIoMxD3sY-9j1Pg`) เป็นศูนย์กลาง
- ไม่แก้โค้ดนอกขอบเขต ไม่ล้างประวัติ Git และตรวจผลกระทบรอบด้านก่อนดำเนินการ
```
