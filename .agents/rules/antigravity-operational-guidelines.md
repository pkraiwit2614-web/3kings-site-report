# Antigravity Operational Guidelines — 3 Kings Construction

These rules govern the autonomous execution and development behavior of Google Antigravity AI agents operating on the 3 Kings Construction codebase (`3kings-site-report`).

## Operational Objective
Enable the AI agent to develop, edit code, investigate defects/errors, and complete tasks autonomously to closure without being artificially constrained to read-only mode, while strictly enforcing project safety boundaries and data isolation.

---

## 10 Core Execution Rules

### 1. Immediate Scoped Code Access (ตรวจสอบและแก้ไขโค้ดได้ทันที)
When given a feature, improvement, refactoring, or bugfix request, inspect and modify source code within the explicitly authorized task scope immediately without asking for secondary permission.

### 2. Autonomous End-to-End Execution (ทำงานต่อเนื่องจบกระบวนการ)
A single user command that scopes a task authorizes the complete development workflow:
- Checking out or creating an isolated development branch
- Performing surgical file edits
- Running local builds (`npm run build` or Next.js build validation)
- Executing unit and regression test suites (`node --test tests/...`)
- Creating git commits and Pull Requests (PR)
Do not interrupt the user with repetitive micro-approvals for standard intermediate substeps.

### 3. Self-Healing Scoped Debug Loop (แก้ไขปัญหาในขอบเขตจนผ่าน)
If build errors, runtime issues, or test failures arise within the scope of the assigned task:
- Apply systematic debugging to identify the root cause
- Implement the minimal surgical fix
- Re-run builds and regression tests until all tests pass (`PASS`)
- Do NOT alter unrelated modules, files, or configurations outside the assigned scope to make tests pass.

### 4. GitHub Actions / Local QA First (QA ภายในเป็นหลัก)
- Primary QA Channel: Use local tests, local builds, and GitHub Actions (`Supabase Local Viewer E2E (no hosted DB)` with synthetic data).
- Hosted Vercel Preview: Generate a hosted preview ONLY when local/CI cannot prove required integration behavior (e.g. hosted OAuth cookies, live third-party edge behaviors) per SOP 15.

### 5. Governed Production Deployment — SOP 16 (Deploy ต่อเมื่อสั่งและผ่านเกณฑ์จริง)
- Only an explicit, authorized user command to deploy permits initiating the SOP 16 workflow.
- Mandatory gates: All required checks must be `PASS` (never accept `SKIPPED`), effective permissions/IAM credentials must be verified, and live Production Readback (SHA match, live health check, and feature verification) must be completed before reporting done.

### 6. Scoped External Data Writes (เขียนข้อมูลภายนอกตามสิทธิ์และ SOP ACTIVE)
- Mutations to external data sources (Google Drive, Excel Master, Supabase database rows, or Google Calendar) are allowed ONLY when explicitly authorized in the task scope.
- Must read and resolve the latest **ACTIVE SOP document** from the connected Google Drive SOP Index (`00-SOP_INDEX - 3Kings Construction`) before executing any write.

### 7. Strict Hard Stops & Zero-Touch Zones (เขตห้ามแตะต้องนอกขอบเขต)
Strictly FORBIDDEN from modifying or making unauthorized inferences in:
- **Payroll / Labour Data**: Any folder starting with `Data` (e.g. Labour data), payroll records, or direct payroll totals.
- **RBAC / RLS**: Access control matrices, security policies, and Supabase RLS rules (unless the explicit task is a security/matrix update).
- **Other Core Systems**: Defect Flow, Materials/PR/PO, Daily Reports, Calendar, or any table/file outside the user's explicit scope.

### 8. Resilient Isolation & No False Stalls (ทำต่อในส่วนที่ปลอดภัย)
- Proceed through all authorized steps end-to-end without pausing to ask repetitive questions.
- If a specific component or step encounters an access, permission, or safety blocker, **isolate/quarantine that blocked item** (marking it `BLOCKED`), report the exact blocker, and proceed with completing all other unblocked, safe steps.

### 9. Rigorous Blast Radius Verification (ตรวจผลกระทบรอบด้าน)
Conduct an impact analysis across all six dimensions before and after modifying code:
`UI → API → DB → Print Layout → i18n (TH/EN/RU) → Roles/RBAC → Sync`

### 10. Evidence-Based Truthful Reporting (รายงานตามหลักฐานจริง)
- Output explicit status codes: `PASS`, `FAIL`, or `BLOCKED`.
- Ground all status reports on concrete, verifiable evidence (e.g. test runner output, commit SHA, actual readback verification).
- Never claim that sync, deployment, or writeback succeeded without positive destination readback proof.

---

## Authority & Hierarchy
1. **Google Drive ACTIVE SOP Index & Current Full SOP**: Authoritative over local summaries.
2. **`AGENTS.md` and this Rule file**: Guide agent behavior, execution boundaries, and safety.
3. **Application Backend / Runtime**: Enforces actual RBAC/RLS and database constraints.

*Note: This rule set defines agent operational guidelines and autonomy within an authorized scope. It does NOT grant autonomous production deployment or permission to alter data outside the assigned scope.*
