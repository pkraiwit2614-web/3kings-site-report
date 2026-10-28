# 3 Kings — Closure Evidence Receipt Gate (STAGING / READ-ONLY)

**Tracker:** [existing Issue #230](https://github.com/pkraiwit2614-web/3kings-site-report/issues/230). This component does not replace the ACTIVE Google Drive `00-SOP_INDEX` or SOPs, and cannot authorize changes.

## Objective

Provide a single deterministic quality check for P2 (task-key duplicate/writer conflict, source revision and stage evidence consistency) and an offline Markdown summary for P3. All inputs must be **independently verified externally** by approved tools/operator. This pure script **has no GitHub/GAS/Supabase/Vercel/Drive/LINE network access or credentials**, cannot sync, deploy, update Production, or automatically close an issue.

Invocation with a **locally supplied and reviewed JSON receipt**:

```bash
node scripts/ai-operations/closure-evidence-gate.cjs path/to/receipt.json
node --test tests/ai-operations-closure-evidence-gate.test.cjs
```

The script prints a Markdown table. Exit code 0 means all listed tasks are **candidates for human closure review**, not DONE; exit 1 means one or more HOLD; exit 2 means invalid input. It prints no raw contents/credentials from receipt fields.

### v1 input contract

```json
{
  "schema_version": 1,
  "tasks": [
    {
      "task_key": "DAILY:SITE_SYNC:ROWS354+",
      "scope": {
        "source_id": "verified-existing-file-id",
        "source_revision": "verified-source-revision",
        "source_modified_at": "2026-10-28T01:00:00Z",
        "head_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "migration_version": "exact-version-when-applicable"
      },
      "required_gates": ["source", "sync", "database", "ui"],
      "writes": ["original-file:verified-existing-file-id"],
      "proofs": {
        "source": {"status": "PASS", "ref": "source-readback-reference", "checked_at": "2026-10-28T03:00:00Z", "source_id": "verified-existing-file-id", "source_revision": "verified-source-revision"},
        "sync": {"status": "PASS", "ref": "import-audit-reference", "checked_at": "2026-10-28T03:01:00Z", "source_id": "verified-existing-file-id", "source_revision": "verified-source-revision", "batch_id": "verified-existing-run-id"},
        "database": {"status": "PASS", "ref": "db-readback-reference", "checked_at": "2026-10-28T03:02:00Z", "source_id": "verified-existing-file-id", "source_revision": "verified-source-revision", "verified_rows": 34},
        "ui": {"status": "PASS", "ref": "authenticated-qa-reference", "checked_at": "2026-10-28T03:03:00Z", "source_id": "verified-existing-file-id", "source_revision": "verified-source-revision", "role": "qa-viewer"}
      }
    }
  ]
}
```

**Security and data minimization:** All values above are synthetic examples; never put tokens, user passwords, service_role keys, customer details, or personal files in receipts. A citation/metadata reference is not proof of its truth. Validate source, DB query, CI exact SHA, migration history, authenticated UI and real site acceptance independently. `checked_at` must be after `source_modified_at`. Missing/FAIL/SKIPPED/UNVERIFIED proofs are HOLD. For code releases, require `ci` and `production` with exact 40-hex `head_sha`; for migrations require `migration` with matching applied version. `site_acceptance` requires an actual non-synthetic confirmation; do not infer job completion from website text.

## Integration boundary and handoff

This PR is an **isolated QA scaffold**, not production runtime enforcement. Antigravity Office can later:
1. Discover the live ACTIVE SOP and bind receipt fields to **read-only, authorized real** Source/Sync/DB/Web evidence (never secrets).
2. Reconcile existing Task Keys against Issue #230 and make every writer acquire a server-side source-scoped lock before mutation. The offline `writes` conflict check is **not** a distributed lock.
3. Add a redacted, source-backed real-time dashboard/alert workflow **after security/role checks and separate QA**. No new Cron, trigger, Cloudflare/Vercel deployment, new table, or production webhook is installed by this PR.
4. Produce explicit per-module acceptance proofs, keep unrelated Defect/Materials/Daily/Payroll/Calendar/LINE/RBAC/RLS unchanged, and avoid rerunning valid CI or completed imports.

## Important design constraints

- One task key `MODULE:OBJECT:ACTION`, no duplicates. Different rooms/sources use distinct keys.
- Use exact verified revision/commit/migration version; recheck only when inputs change.
- A passed generic CI/build test is not proof of Production database migration or authenticated UI.
- NEVER rewrite a source XLSX/Google Form or mark jobs `done` to make this gate green.
- No endpoint is invoked by this script. It is safe to review/test in isolation and needs a separate reviewed integration to provide reliable live receipts.
