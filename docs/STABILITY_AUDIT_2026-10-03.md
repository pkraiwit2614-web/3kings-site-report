# Stability audit and targeted fixes — 3 October 2026

Baseline: `294e078c152e11ca1a7d1422e826801beb8c2285` (the deployed Combine marker repair).
Scope: confirmed failures in data refresh, Materials replacement validation, and photo archive request ownership. No layout redesign, dependency upgrades, changes to search predicates, Combine code, business status mapping, or Drive workbooks.

## Problems and repairs

| Area | Confirmed code behavior | Targeted repair | Isolation |
|---|---|---|---|
| Logic / performance | Focus and Realtime events can overlap reads; an older response can commit after a newer one. | `lib/liveLoader.ts` serializes request batches, coalesces pending events into one trailing refresh, aborts on unmount, and limits each batch to 15 seconds. | Instantiated separately in Dashboard, Materials, Procurement and Defects; no global client/cache/auth change. |
| Error handling | Supabase resolves `{error}`; `Promise.all` alone does not reject. Materials/Procurement used `data || []` even on errors. Dashboard checked only two of six reads. | Validate the entire batch before updating state. Keep last successful data and timestamps; show an error/retry banner. | Existing queries, columns, filters, status calculations, routes, headers, and normal page layout remain intact. |
| Database integrity | Materials replacement RPC deletes then inserts without checking for empty arrays; a missing purchasing header silently becomes an empty import. | Validate headers/empty datasets in the API and arrays/row names in the existing RPC before its first DELETE. | Same RPC signature, secret check, grants, mappings and transaction. A valid workbook produces identical output. Deliberately clearing a complete dataset now requires a separate reviewed action. |
| Database query performance | Two read policies evaluate `auth.uid()` per row. | Use `(SELECT auth.uid())` in those two policies. | Same roles and boolean access condition. Query plan confirms an InitPlan and retained existing primary-key index scan. No blanket permission changes. |
| Security / API | Photo UPDATE can match zero rows under RLS without an error, yet still dispatch the archive webhook. Host-prefix validation does not bind the signed object to the user's staging path. | Validate JSON/UUIDs and exact decoded staging URL; scope UPDATE by photo ID, uploader and report; require a returned row before dispatch; return controlled JSON on exceptions. | Original authorized 202 response and worker payload retained. Uses the caller's token and existing RLS; no service-role key or permission expansion. |

## Verification completed

- Baseline and patched Next.js production builds passed (Next 15.5.24; TypeScript checks included).
- `node tests/stability.test.cjs`: 11 tests passed — overlapping refreshes, failed batch retention, timeout/retry, unmount cancellation, valid/empty/header-invalid Materials imports, malformed archive payloads, zero-row authorization denial, API exception fallback, and authorized 202 response.
- `tests/browser-stability.cjs`: local production build with isolated API fixtures. Dashboard, Materials, Procurement and Defects load, retain data during simulated DB outage, and recover on retry. Repeated comma search/filter changes preserve Combine markers. HTML-looking defect text remains text (no injected image/event execution). No page runtime errors or production writes during these browser tests.
- Current Drive Materials workbook (file ID `1Yr9iNVo54g4PrB2ntFb6E_ouI_ohHqSn`, modified 2026-10-03 04:46:39 UTC) parsed before/after: identical values for 355 material rows, 32 procurement rows and 33 tool rows. This was a read-only parse comparison, not a re-import. Database procurement count is 35; this audit did not overwrite or reconcile the source and database.
- SQL validation cases checked on the current database before migration.
- After migration: live RPC rejection tests used a transaction-local test sync credential, then ROLLBACK. Null payload, empty payload, malformed row and invalid key tests passed; checksum of Materials/Procurement/Tools remained identical. No test credential persisted.
- Supabase performance advisors: the 2 `auth_rls_initplan` findings are resolved. Existing unrelated findings were left intact.
- Vercel baseline runtime error query returned no grouped errors for the preceding 24 hours; absence of logged errors is not proof of complete end-to-end correctness.
- Local login page rendered and unauthenticated archive requests returned 401. Production authenticated user journeys and the complete external n8n archive lifecycle are not covered by fixture tests.

## Dependency / regression boundary

`getSupabase()` remains unchanged. Read cancellation is attached only to the four page-level batches. Other components continue using their existing client, policies and queries. The existing Combine enhancer and all search functions are byte-for-byte unchanged. The Materials parser's valid-input field mappings and the RPC's original body after the new guard are unchanged. Error banners appear only on failure.

React review: loader state is effect-local; disposal aborts active requests; existing channel/listener cleanup remains; no new dependencies or conditional hooks; retry is a native button; errors use an accessible alert.

## Remaining findings and recommendations

- Five FK columns lack covering indexes: `daily_report_revisions.edited_by`, `daily_reports.last_edited_by`, `drive_photo_index.verified_by`, `report_photos.archive_last_attempt_by`, `schedule_task_daily_snapshots.project_id`. These are candidates, not measured bottlenecks. The tested snapshot-date query already uses its primary-key index; no speculative indexes were added.
- Twenty unused-index notices and three multiple-permissive-policy notices remain. Do not drop/merge automatically: some indexes support rare flows and policies can encode different permissions.
- Public SECURITY DEFINER RPC warnings require per-function review. The inspected Materials and photo-reconciliation RPCs validate their sync key and use a fixed search path; revoking all `anon` execute access would break existing sync callers. This audit did not certify every RPC as safe.
- Leaked-password protection remains disabled in Supabase Auth. Review account/plan capability before enabling it.
- Several legacy DOM enhancers and other pages still have independent data loaders. No claim is made that the entire application is regression-free.
- No SQL string concatenation with user input was added. Existing PostgREST filters/RPC parameters and React/textContent output are retained. The XSS test covers the Defect display path, not every UI sink.

Supabase references:
- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Reproduce

```sh
node tests/stability.test.cjs
npm run build
npm run start -- --hostname 127.0.0.1 --port 3010
# In another terminal, provide a local Playwright install and Chrome executable:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROME_PATH=/absolute/path/to/chrome node tests/browser-stability.cjs
```

CI runs the 11 dependency-free regression cases (using the existing TypeScript dev dependency) after the build. The browser script intentionally refuses non-localhost origins.

## Rollback

Application: revert the targeted change commit, retaining any subsequent user changes. The previous application is compatible with the new DB guard and equivalent RLS predicates.
Database: the guard migration contains the complete unchanged pre-existing RPC body plus a clearly delimited validation block. Prefer retaining this protective guard when rolling back the UI. If database rollback is necessary, restore the prior audited function body and set the two policies back to `USING (auth.uid() IS NOT NULL)` in a new migration. Do not restore/import business tables. Migration precondition rejects a changed RPC definition instead of overwriting concurrent work.
