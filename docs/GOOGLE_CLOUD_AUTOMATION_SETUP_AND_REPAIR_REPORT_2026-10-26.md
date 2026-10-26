# 3 KINGS — GOOGLE CLOUD AUTOMATION ACCESS SETUP & REPAIR REPORT
**Execution Date**: 2026-10-26 (26 ตุลาคม 2569)  
**Target Account**: `p.kraiwit2614@gmail.com` (Verified Owner)  
**Cloud Project**: `kings-site-report` (Project Number: `270646152080`, Name: `3Kings Site Report`, Status: `ACTIVE`)  
**Security Classification**: CONFIDENTIAL — SYSTEM AUDIT & VERIFIED READBACK EVIDENCE  
**Safety Protocol**: Fail-Closed, Least-Privilege Scoped IAM, Zero-Touch Production Data, Isolated Container Testing  

---

## 1. Executive Summary

| Scope Component | Status Before Repair | Action Taken | Verified Readback Status |
| :--- | :--- | :--- | :--- |
| **Google Cloud Authentication** | Token active for `p.kraiwit2614@gmail.com` | Verified token scopes (`cloud-platform`, `logging.read`, `script.*`, `drive.*`) | **VERIFIED_PASS** |
| **Cloud IAM (Project Level)** | Only `user:p.kraiwit2614@gmail.com` has `roles/owner` | Strictly **NO** project-level Owner/Editor granted to any SA or automation | **VERIFIED_PASS** (Boundary Maintained) |
| **Service Account (`id-kings-calendar`)** | `id-kings-calendar@kings-site-report.iam.gserviceaccount.com` (UniqueId: `103554423593931711758`) | 1 System-managed key, 0 user keys (Keyless). Lacked TokenCreator permission | **VERIFIED_PASS** |
| **Workload Identity Federation (WIF)** | 2 Pools (`kings-photo-qa`, `3kings-vercel-sop`) | Audited 3 active providers (GitHub PR #209, Vercel Preview, Vercel Production) | **VERIFIED_PASS** (Intact) |
| **Scoped IAM Grant (SA-Level Only)** | Token impersonation was blocked (`403 IAM_PERMISSION_DENIED`) | Granted `roles/iam.serviceAccountTokenCreator` to `p.kraiwit2614@gmail.com` **specifically on SA resource** (Post-user confirmation) | **VERIFIED_PASS** (`etag: BwZet2vClCg=`) |
| **Keyless Token Generation** | Blocked | Generated short-lived OAuth token for SA via `iamcredentials.generateAccessToken` | **VERIFIED_PASS** (Expires in 3600s) |
| **Calendar Isolated Container Test** | N/A | Created secondary test calendar, inserted test event, readback, deleted, verified 404 | **VERIFIED_PASS** (100% Isolated, 0 Prod Mutation) |
| **Drive Scoped Container Test** | N/A | Created test folder, shared with SA, verified metadata rename, readback, deleted 404 | **VERIFIED_PASS** (0 Prod Mutation) |
| **GAS Triggers & Execution** | 5 GAS Projects, Project 1 has 11 triggers | Verified all 11 original clock triggers intact via Web App Live API (`AKfycbxcdwx...`) | **VERIFIED_PASS** (0 Duplicates) |

---

## 2. Detailed Read-Only Audit Findings

### 2.1. Cloud IAM & Service Account Inspection
- **Project**: `kings-site-report` (`270646152080`)
- **Project IAM Policy**:
  ```json
  {
    "version": 1,
    "etag": "BwZdKBxF/00=",
    "bindings": [
      {
        "role": "roles/owner",
        "members": ["user:p.kraiwit2614@gmail.com"]
      }
    ]
  }
  ```
- **Service Account**: `id-kings-calendar@kings-site-report.iam.gserviceaccount.com`
  - Display Name: `3kings-calendar`
  - Unique ID: `103554423593931711758`
  - Keys: Only 1 `SYSTEM_MANAGED` key (`629c608a06f42e24dbe3f6f26cde68e10d31b97b`). No private key JSON file exists or was leaked.
- **WIF Pools & Providers**:
  - `kings-photo-qa`: Provider `github-pr209` (`assertion.repository == 'pkraiwit2614-web/3kings-site-report'`, `environment == 'photo-inventory-qa'`)
  - `3kings-vercel-sop`: Providers `vercel-preview` and `vercel-production`
- **Enabled APIs (34 Services)**:
  `calendar-json.googleapis.com`, `drive.googleapis.com`, `script.googleapis.com`, `sheets.googleapis.com`, `iam.googleapis.com`, `iamcredentials.googleapis.com`, `logging.googleapis.com`, `sts.googleapis.com`, etc.

### 2.2. Google Apps Script (GAS) Inventory
- **Project 1 (`1sKddwvs-DOav0ltdrcxyqPXYinXE3uCgFKmDzGu_XEb4VvMvYVwDUDeT`)**:
  - Title: `3Kings Drive → Supabase Sync`
  - Creator/Owner: `p.kraiwit2614@gmail.com`
  - Deployments: Web App v9 (`AKfycbxcdwxVFirtycW9RtG4uZmpgDCezHJK8KBJt1inxn2bEuk1PqVzroxmRVx0hzo9-xETVQ`)
  - Installed Triggers: Exactly 11 Clock triggers (`dailySiteSyncHourly20261019`, `syncShiftHourly20261013`, `hotelWorkPlanSyncNow`, `syncShiftPhoto0800`, `syncShiftPhoto1700`, `syncShiftPhoto1200`, `smartSyncDefectsV13_15m`, `defectWritebackScheduledV2`, `syncWorkOrderHourly20261015`, `dailyLineGatewayScheduled0730`, `hotelOOOExecuteWriteback`).
- **Project 5 (`19ZzdTIhmLoMBIxL0RVNIUDmMxvWvGe7ScDFhhzkuxqtkDbEyzVLq5qpT`)**:
  - Title: `3Kings Daily Report Automation`
  - Creator/Owner: `p.kraiwit2614@gmail.com`
- **Projects 2, 3, 4**: Staging/Backup projects with 0 active triggers.

### 2.3. Calendar & Drive Production Resources (Zero Mutations Verified)
- **7 Production Calendars**:
  1. `family17900518303332507254@group.calendar.google.com` (3 Kings – Construction Plan)
  2. `9fad4dc9a66ea28e8e98f833119dbd8a4978b66574a329f2d9d1bb8d71b7f498@group.calendar.google.com` (3 Kings – Site / Actual)
  3. `6cf6a83e431fa95467563ac0e82400d126601d3e6d3c76936ee26de0813e3614@group.calendar.google.com` (กำหนดส่ง-ของเข้าหน้างาน)
  4. `9b7068d0a450c0f2acbc58783d9eabf80c2957b329d99bdbb1078586994ac210@group.calendar.google.com` (3K - Above Villa 6)
  5. `7ca8d4a9ade6e05b36ec81c9e0dc025d12c567541414a9ceaee1958e344d187c@group.calendar.google.com` (3K - Above Villa 7)
  6. `d31b1dafb3231456407795ea8400bdc0daf490553d441449312e01725a7fd379@group.calendar.google.com` (3K - Above Villa 8)
  7. `958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com` (3K - Above Villa 9)
  - **Audit Result**: Zero production events modified, zero duplicate calendars.
- **Production Drive Folders & Master Files**:
  - `Daily Report - Oct 26` (`1z57u9sJEDtEAsSORONGRaeNDmUvhS6dw2YkVCv2ovhQ`): Owned by `p.kraiwit2614@gmail.com`. Untouched.
  - `Handover_Defect_Summary_Updated_28-09-2026.xlsx` (`1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj`): Owned by `p.kraiwit2614@gmail.com`. Untouched.

---

## 3. Scoped Repair & Verification Execution

### 3.1. Scoped IAM Grant
Following user confirmation, granted `roles/iam.serviceAccountTokenCreator` to `user:p.kraiwit2614@gmail.com` on resource:
`projects/kings-site-report/serviceAccounts/id-kings-calendar@kings-site-report.iam.gserviceaccount.com`

**Verified Policy Readback**:
```json
{
  "version": 1,
  "etag": "BwZet2vClCg=",
  "bindings": [
    {
      "role": "roles/iam.serviceAccountTokenCreator",
      "members": ["user:p.kraiwit2614@gmail.com"]
    },
    {
      "role": "roles/iam.workloadIdentityUser",
      "members": [
        "principal://iam.googleapis.com/projects/270646152080/locations/global/workloadIdentityPools/3kings-vercel-sop/subject/owner:kraiwit-p-golfiiz-sqr:project:3kings-site-report:environment:preview",
        "principal://iam.googleapis.com/projects/270646152080/locations/global/workloadIdentityPools/3kings-vercel-sop/subject/owner:kraiwit-p-golfiiz-sqr:project:3kings-site-report:environment:production",
        "principalSet://iam.googleapis.com/projects/270646152080/locations/global/workloadIdentityPools/kings-photo-qa/attribute.repository_id/1378114930"
      ]
    }
  ]
}
```

### 3.2. Calendar Isolated Write & Readback Test
- **Action**: Service Account generated token with scope `https://www.googleapis.com/auth/calendar`.
- **Created Isolated Calendar**: `70ca1a59ef3c0e0a166f97162b1c97141d3fa12e06bbb0057c3c2c4a571bdbf0@group.calendar.google.com`
- **Created Test Event**: `d9liiqdhn2b9dtpbs87plrtjs8` (`ทดสอบระบบอัตโนมัติ 3Kings • ปกติ [Isolated Container] [HealthCheck]`)
- **Readback Match**: `VERIFIED_PASS` (Status: `confirmed`, Summary exact match).
- **Cleanup**: Deleted event (HTTP 204), Deleted calendar (HTTP 204).
- **Readback Deletion Verification**: Service account calendarList verified completely empty (`[]`).

### 3.3. Drive Scoped Metadata & Readback Test
- **Action**: Tested scoped file rename in isolated temporary folder `3Kings_Rename_Test_Area` shared with SA.
- **Created File**: `10SX7LDX83-MtVvUxqNEbDZ8BewjGESc5` (`Plot9_20261026_ORIGINAL.jpg`)
- **SA Renamed File**: `Plot9_20261026_RENAMED_CANONICAL.jpg`
- **Readback Match**: `VERIFIED_PASS` (Name exact match).
- **Cleanup**: Deleted file (HTTP 204), Deleted folder (HTTP 204).
- **Readback Deletion Verification**: Folder query returned HTTP `404 Not Found`.

### 3.4. Trigger & Execution Health Verification
- **Web App Endpoint**: `https://script.google.com/macros/s/AKfycbxcdwxVFirtycW9RtG4uZmpgDCezHJK8KBJt1inxn2bEuk1PqVzroxmRVx0hzo9-xETVQ/exec`
- **Status**: `ACTIVE`
- **Triggers**: 11 handlers intact (`dailySiteSyncHourly20261019`, `syncShiftHourly20261013`, `hotelWorkPlanSyncNow`, etc.).
- **Zero Duplicate Triggers**: Confirmed.
- **Local Unit Suite (`tests/google-calendar-auto-sync.test.cjs`)**: 11/11 tests PASS (100% GREEN).

---

## 4. Rollback Procedure

To revert the Service Account token creator grant at any time:

### Method A: REST API / Script (Immediate)
```javascript
const saUrl = 'https://iam.googleapis.com/v1/projects/kings-site-report/serviceAccounts/id-kings-calendar@kings-site-report.iam.gserviceaccount.com';
const currentPolicy = await (await fetch(saUrl + ':getIamPolicy', { method: 'POST', headers, body: '{}' })).json();
const rollbackPolicy = {
  policy: {
    version: currentPolicy.version || 1,
    etag: currentPolicy.etag,
    bindings: currentPolicy.bindings.filter(b => b.role !== 'roles/iam.serviceAccountTokenCreator')
  }
};
await fetch(saUrl + ':setIamPolicy', { method: 'POST', headers, body: JSON.stringify(rollbackPolicy) });
```

### Method B: Google Cloud CLI
```bash
gcloud iam service-accounts remove-iam-policy-binding id-kings-calendar@kings-site-report.iam.gserviceaccount.com \
    --project=kings-site-report \
    --role="roles/iam.serviceAccountTokenCreator" \
    --member="user:p.kraiwit2614@gmail.com"
```
*(Rolling back this binding restores the Service Account to its exact original state before this session, leaving WIF for Vercel/GitHub unchanged).*
