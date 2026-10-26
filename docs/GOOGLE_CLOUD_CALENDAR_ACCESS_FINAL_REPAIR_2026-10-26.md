# 3 KINGS — GOOGLE CLOUD & CALENDAR ACCESS FINAL REPAIR REPORT
**Execution Date**: 2026-10-26 (26 ตุลาคม 2569)  
**Target Account**: `p.kraiwit2614@gmail.com` (Verified Owner)  
**Cloud Project**: `kings-site-report` (Project Number: `270646152080`, Name: `3Kings Site Report`, Status: `ACTIVE`)  
**Service Account**: `id-kings-calendar@kings-site-report.iam.gserviceaccount.com` (UniqueId: `103554423593931711758`)  
**Security Classification**: CONFIDENTIAL — SYSTEM AUDIT & VERIFIED READBACK EVIDENCE  
**Safety Protocol**: Fail-Closed, Least-Privilege Scoped IAM, Zero-Touch Production Data, Dual Readback Verification  

---

## 1. Executive Summary

| ลำดับการตรวจสอบ | สถานะเดิมก่อนซ่อม | การปฏิบัติการที่ดำเนินการจริง | ผลการตรวจสอบอ่านกลับ (Readback Evidence) | สถานะสรุป |
| :--- | :--- | :--- | :--- | :---: |
| **1. Cloud IAM & Project Boundary** | Owner มี `roles/owner` ระดับโครงการ | ตรวจสอบ policy bindings ระดับโครงการ คง Least Privilege สูงสุด ไม่ให้สิทธิ์ Owner/Editor แก่ SA | `etag: BwZdKBxF/00=` คงสมาชิกเพียง `user:p.kraiwit2614@gmail.com` | **VERIFIED_PASS** |
| **2. Service Account Token Creator** | บัญชี Owner ได้รับสิทธิ์ Token Creator บนตัว SA | ตรวจสอบ IAM binding บน resource Service Account โดยตรง | `etag: BwZet2vClCg=` ยืนยันสิทธิ์ `roles/iam.serviceAccountTokenCreator` | **VERIFIED_PASS** |
| **3. Keyless Token Generation** | ใช้งานได้ | ทดสอบ `iamcredentials.generateAccessToken` สำหรับ scopes `calendar` และ `drive` | ออก Token สำเร็จ อายุ 3600 วินาที ผ่าน UniqueId `103554423593931711758` | **VERIFIED_PASS** |
| **4. Calendar ACL (7 Production Calendars)** | **SA ไม่ได้อยู่ใน ACL เลย** (API ตอบ `404 Not Found`) | ดำเนินการเพิ่มแบบ Scoped ACL `role: writer` ให้แก่ Service Account ทั้ง 7 ปฏิทิน | ตรวจสอบผ่าน Owner ACL API และ SA Direct API พบสิทธิ์ `writer` ครบทั้ง 7/7 | **DONE_VERIFIED** |
| **5. Drive Scoped Folder Permissions** | SA ไม่ได้อยู่ใน permissions ของโฟลเดอร์งานจริง | ให้สิทธิ์ `role: writer` (Editor) เฉพาะ 4 โฟลเดอร์เป้าหมาย ไม่เปิดทั้ง Drive | Owner Readback `role: writer` และ SA Readback `canEdit: true` ครบ 4/4 | **DONE_VERIFIED** |
| **6. Apps Script Project 1 & Triggers** | Trigger 11 รายการเดิมสมบูรณ์ | ตรวจสอบ handler ทั้ง 11 รายการ ไม่มีการสร้าง Trigger ซ้ำ หรือแตะต้อง Deployments | Handler 11 รายการตรงกับ HEAD files 100% | **VERIFIED_PASS** |
| **7. Production Sync Guard** | PR #222 สถานะ OPEN | คงการตั้งค่า `CALENDAR_SYNC_ENABLED=false` ไม่เปิด calendar writer พร้อมกันสองชุด | ป้องกัน Event ชน และ zero production mutation | **VERIFIED_PASS** |

---

## 2. ผลการตรวจสอบและซ่อมแซมสิทธิ์ 7 Production Calendars

### 2.1. ตารางแสดงผลสิทธิ์ Calendar ACL รายใบ (Before & After)

| # | ชื่อปฏิทิน (Calendar Label) | Calendar ID | สิทธิ์ Owner | สิทธิ์ SA ก่อนซ่อม | สิทธิ์ SA หลังซ่อม | ผลการอ่านกลับโดยตรง (SA API Readback) |
|---|---|---|:---:|:---:|:---:|:---:|
| 1 | **3 Kings – Construction Plan** | `family17900518303332507254@group.calendar.google.com` | `owner` | `NOT_FOUND` (404) | `writer` | **VERIFIED_PASS** (HTTP 200, Role: writer) |
| 2 | **3 Kings – Site / Actual** | `9fad4dc9a66ea28e8e98f833119dbd8a4978b66574a329f2d9d1bb8d71b7f498@group.calendar.google.com` | `owner` | `NOT_FOUND` (404) | `writer` | **VERIFIED_PASS** (HTTP 200, Role: writer) |
| 3 | **กำหนดส่ง-ของเข้าหน้างาน** | `6cf6a83e431fa95467563ac0e82400d126601d3e6d3c76936ee26de0813e3614@group.calendar.google.com` | `owner` | `NOT_FOUND` (404) | `writer` | **VERIFIED_PASS** (HTTP 200, Role: writer) |
| 4 | **3K - Above Villa 6** | `9b7068d0a450c0f2acbc58783d9eabf80c2957b329d99bdbb1078586994ac210@group.calendar.google.com` | `owner` | `NOT_FOUND` (404) | `writer` | **VERIFIED_PASS** (HTTP 200, Role: writer) |
| 5 | **3K - Above Villa 7** | `7ca8d4a9ade6e05b36ec81c9e0dc025d12c567541414a9ceaee1958e344d187c@group.calendar.google.com` | `owner` | `NOT_FOUND` (404) | `writer` | **VERIFIED_PASS** (HTTP 200, Role: writer) |
| 6 | **3K - Above Villa 8** | `d31b1dafb3231456407795ea8400bdc0daf490553d441449312e01725a7fd379@group.calendar.google.com` | `owner` | `NOT_FOUND` (404) | `writer` | **VERIFIED_PASS** (HTTP 200, Role: writer) |
| 7 | **3K - Above Villa 9** | `958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com` | `owner` | `NOT_FOUND` (404) | `writer` | **VERIFIED_PASS** (HTTP 200, Role: writer) |

### 2.2. หลักฐานเชิงประจักษ์การอ่านกลับ (Dual Verification)
1. **ฝั่ง Owner API (`GET /calendars/{id}/acl`)**:
   - พบ Entry: `user:id-kings-calendar@kings-site-report.iam.gserviceaccount.com` มีบทบาท `role: writer` อยู่ในทุกปฏิทินอย่างเป็นทางการ
2. **ฝั่ง Service Account Keyless API (`GET /users/me/calendarList`)**:
   - บัญชี Service Account ดึงรายการปฏิทินของตนเอง พบครบทั้ง 7 ปฏิทินเป้าหมาย และระบุ `accessRole: writer`
   - ทดสอบส่งคำสั่ง Read Events Query (`GET /calendars/{id}/events?maxResults=5`) ตอบกลับ HTTP 200 OK ครบ 7/7

---

## 3. ผลการตรวจสอบและซ่อมแซมสิทธิ์ Drive Scoped Folders

เพื่อให้การทำงานร่วมกับระบบ Automation (Daily Report, Photo Index, Defect Inputs) ราบรื่นโดยไม่ละเมิดหลัก Least Privilege ได้ดำเนินการกำหนดสิทธิ์เฉพาะโฟลเดอร์เป้าหมายจริง 4 รายการ:

| # | ชื่อโฟลเดอร์เป้าหมาย | Folder ID | สิทธิ์ Owner | สิทธิ์ SA ก่อนซ่อม | สิทธิ์ SA หลังซ่อม | ผลการอ่านกลับโดยตรง (SA canEdit) |
|---|---|---|:---:|:---:|:---:|:---:|
| 1 | **0-Daily Report** (PDF Export) | `1pLZ33h2J2CHZEOLV5KJLddP1pE7CynFW` | `owner` | `NOT_FOUND` | `writer` | **VERIFIED_PASS** (`canEdit: true`) |
| 2 | **24102026** (Daily Report PNG Assets) | `1luF9x2ZB-EC4TPUz_kvp8Y7CbF9NaFAJ` | `owner` | `NOT_FOUND` | `writer` | **VERIFIED_PASS** (`canEdit: true`) |
| 3 | **23102026** (Daily Report PNG Assets) | `193NpO6mi66ghDsIJWwMkBwAoYwImnOVe` | `owner` | `NOT_FOUND` | `writer` | **VERIFIED_PASS** (`canEdit: true`) |
| 4 | **Defect List Hotel** (Defect Inputs) | `14lNNqG34BZgFiH6ZJW4sRaIH2rjE6WcM` | `owner` | `NOT_FOUND` | `writer` | **VERIFIED_PASS** (`canEdit: true`) |

*(ไม่มีการให้สิทธิ์ SA ระดับ Root Drive หรือแชร์โฟลเดอร์อื่นนอกเหนือจาก 4 รายการนี้)*

---

## 4. ตัวตนและ Execution Path ในการเขียน Calendar จริง

### 4.1. การวิเคราะห์ตัวตน (Identity & Credential Architecture)
1. **Google Apps Script Project 1 (`1sKddwvs-...`)**:
   - Creator/Deployer: `p.kraiwit2614@gmail.com`
   - Runtime Context: ทริกเกอร์รันด้วยสิทธิ์ของ Owner (`executeAs: USER_DEPLOYING`) ซึ่งเป็น Owner ของปฏิทินอยู่แล้ว
   - **รากสาเหตุที่เคยติดขัด**: ที่ผ่านมาเมื่อพยายามทดสอบผ่านฟังก์ชัน `diagnoseCalendarAccess20261024` หรือ `dryRunGoogleCalendarSync` ภายใน Apps Script ระบบจะติดหน้าต่างขอสิทธิ์ OAuth Interactive Consent ของตัว Apps Script เอง ทำให้เกิดการวนลูปขอให้ Owner รันซ้ำๆ
2. **Automated Backend Runner (Keyless Service Account)**:
   - Account: `id-kings-calendar@kings-site-report.iam.gserviceaccount.com`
   - Credential Mechanism: Keyless OAuth 2.0 Access Token ผ่าน Workload Identity Federation (GitHub Actions / Vercel) หรือ `iamcredentials.generateAccessToken` (ผ่าน Owner Token Creator)
   - **ข้อได้เปรียบ**: ไม่ต้องผ่าน Interactive Web Consent ใดๆ และตอนนี้ SA ได้รับสิทธิ์ `writer` ตรงบนทั้ง 7 ปฏิทินแล้ว จึงเป็นเส้นทางที่พร้อมใช้งานและมีความเสถียรสูงสุด

### 4.2. การป้องกันข้อมูลชนและการเขียนซ้ำซ้อน (Concurrency & Dedup Guard)
- **Lock Guard**: ใช้งาน `LockService.getScriptLock()` ป้องกัน trigger ซ้อนกัน
- **Event Identity**: ยึด 3-Tier Reconciliation ตาม SOP 12:
  1. Tier 1: Stored Calendar ID + Event ID
  2. Tier 2: Stable Source Key Tag (`[3Kings-Key: ...]`)
  3. Tier 3: Semantic Match (Date + Location + WorkGroup + Canonical Rooms)
  - กรณีพบเหตุการณ์กำกวม (>1 รายการ) ให้ตัดเข้าสถานะ `REVIEW` ทันที และ **ห้ามสร้าง Event ใหม่ซ้ำซ้อน**
- **Single-Writer Constraint**: ปัจจุบันคง `CALENDAR_SYNC_ENABLED=false` ไว้ เพื่อป้องกันไม่ให้มีสองระบบเขียนลงปฏิทินพร้อมกัน

---

## 5. การตรวจสอบผลกระทบต่อระบบอื่น (Blast Radius Verification)

ผ่านการตรวจสอบความถูกต้องและรันชุดทดสอบ Regression ในเครื่องออฟฟิศครบทุกโมดูล:

- **Defect Flow / Work Orders / Hotel OOO**: ไม่ได้รับผลกระทบ ข้อมูลและสเตตัสคงเดิม 100%
- **Materials / Procurement**: ไม่ได้รับผลกระทบ สิทธิ์ PR/PO/PL และเลย์เอาต์การพิมพ์ทำงานสมบูรณ์ (Tests PASS)
- **Daily Site Report**: ไฟล์ Master Spreadsheet และแท็บวันที่ 26/10 ไม่มีการแก้ไขหรือลบ
- **Payroll / RBAC / RLS**: ปลอดภัย 100% ไม่มีการแตะต้องโฟลเดอร์ `Data*` หรือแก้ไขโครงสร้างความปลอดภัย (RBAC test PASS)
- **GAS Project 1 Triggers**: ทริกเกอร์เดิมทั้ง 11 รายการคงอยู่ครบถ้วน ไม่มีการลบหรือแก้ไข
- **Unit Test Suite**:
  - `tests/google-calendar-auto-sync.test.cjs`: 11/11 PASS (100%)
  - `tests/google-calendar-live-edit.test.cjs`: PASS
  - `tests/defect-work-plan-calendar.test.cjs`: 5/5 PASS (100%)
  - `tests/calendar-procurement-integration.test.cjs`: 4/4 PASS (100%)
  - `tests/line-owner-delivery.test.cjs`: 11/11 PASS (100%)
  - `tests/materials-print-layout.test.cjs`: PASS
  - `tests/procurement-evidence-links.test.cjs`: PASS
  - `tests/procurement-follow-up.test.cjs`: 4/4 PASS (100%)
  - `tests/rbac.test.cjs`: PASS
  - `tests/stability.test.cjs`: 21/21 PASS (100%)
  - `tests/daily-line-merge-gate.test.cjs`: 3/3 PASS (100%)

---

## 6. สถานะ PR #222 และแนวทางดำเนินงานถัดไป

1. **สถานะปัจจุบันของ PR #222**:
   - Pull Request: `#222` (`pkraiwit2614-web/3kings-site-report/pull/222`)
   - Title: `feat(calendar): SOP 12 dry-run entrypoint and scheduled sync job`
   - Branch: `feat/calendar-dry-run-and-sync-adapter` -> `main`
   - สถานะบน GitHub: `OPEN` (Mergeable: `true`, Merged: `false`)
2. **การคงค่าความปลอดภัย**:
   - ระบบยังคงล็อคค่า `CALENDAR_SYNC_ENABLED=false` ในสภาพแวดล้อม Production
   - จะไม่มีการ merge PR #222 หรือสั่ง Deploy เข้า Production โดยพลการ จนกว่าจะได้รับคำสั่งปล่อยงานอย่างเป็นทางการและผ่านเกณฑ์ SOP 16
3. **สิ่งที่ Owner ต้องทำเอง**:
   - **ไม่ต้องทำอะไรเพิ่มเติมในส่วนของ Calendar และ Drive สิทธิ์ครบถ้วนแล้ว!**
   - **ห้าม** กลับไปรัน `dryRunGoogleCalendarSync` หรือ `diagnoseCalendarAccess20261024` ใน Apps Script ซ้ำ

---

## 7. ข้อมูลสำหรับการส่งต่องาน (Cross-Machine Handoff)

- **เครื่องปฏิบัติการ**: Office Acer (Windows 11)
- **Authoritative Service Account**: `id-kings-calendar@kings-site-report.iam.gserviceaccount.com`
- **ปฏิทินที่พร้อมใช้งาน**: ครบทั้ง 7 ใบ พร้อมสิทธิ์ `writer` ของ Service Account
- **การทดสอบซ้ำ**: หากเครื่องบ้านต้องการตรวจสอบสิทธิ์ ให้รันคำสั่งตรวจสอบแบบ Read-only ผ่าน Service Account Keyless Token (ดูสคริปต์ `scratch/verify_sa_details.js`) โดยไม่ต้องไปขอ grant ซ้ำ
