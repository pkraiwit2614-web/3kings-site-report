# Rebase checkpoint — 21 Oct 2026
- Replacement feature branch based on latest `main`, resolving historical PR #111 merge conflict by only carrying its scoped Contact Book changes.
- Actual Supabase `contact_book` permission cells for seven roles and both write-lease RPCs were read-verified; **do not reapply this already-installed migration** to Production.
- Production Contact Book CSV remains the 41-entry baseline; 20 Oct project-team collection stays STAGING pending contact and affiliation checks, not automatically imported.
- Newly available category `ภายใน` is for confirmed internal contacts only. RSE, MLP and Architect 9 Degree remain classified as external where verified.
- Drive service-account credential and Preview/Production external integration have NOT been verified. Preview must use an isolated CSV copy, with server-only secrets, and must not write Production.
- Externally edited CSV content cannot be protected atomically by the current web write lock; coordinate manual CSV editors before enabling real writes.
- This code branch is not proof of CI, hosted QA or Production deployment.

# Contact Book — safe Preview rollout checklist (15 Oct 2026)

## Verified current state (15 October 2026)
- Database migration **applied and verified** on Supabase 3 Kings project `wtqubwdduzedmcvyhbgs`: seven new Contact Book permission cells, original 14 modules unchanged, role permission revision 2.
- Existing production CSV: `1pea9ALaYxhVNvBzuGb615s7_M8rYesic`, verified 41 rows, 16 columns.
- Isolated Preview CSV copy: `1oIP0KtEuoR1YJC27FOhYNGaY0GXRYeKw`, created inside the existing Contact Book Drive folder with 41 rows.
- Vercel Preview branch-specific env `CONTACT_BOOK_PREVIEW_FILE_ID` points to the isolated copy. The server rejects use of the production file in Preview, and pins the production file ID in Production.
- **BLOCKER:** Vercel has no `GOOGLE_CONTACT_BOOK_SERVICE_ACCOUNT_JSON` credential. No end-to-end server-side Google Drive read or write has been verified. Do not claim sync is active or deploy Production yet.

## Remaining external authorization (owner action)
1. In Google Cloud Console, create a service account dedicated to the 3 Kings Contact Book, enable Google Drive API, and create a JSON key. **Do not post the key in GitHub or chat.**
2. Share ONLY the **Preview CSV copy** above with the service account email as Editor. Leave the original production CSV private and unchanged for now.
3. In Vercel Project > Settings > Environment Variables, store the JSON as **sensitive** `GOOGLE_CONTACT_BOOK_SERVICE_ACCOUNT_JSON` scoped to **Preview** (for the test branch). Redeploy Preview to load the new secret.
4. On Preview, verify GET, add, edit, duplicate denial, stale Drive version denial and readback. Check the CSV still has at least 41 unique contacts, and the original production file checksum and version have not changed.
5. Only after verified Preview, share the **original production CSV** with the same service account as Editor and configure the secret in Vercel **Production**. Redeploy after release approval, then test production using a reversible authorized contact edit with readback.
6. Ensure external Google Drive manual editors do not modify the CSV concurrently with web edits. DB lease serializes web edits, and Drive versions are rechecked just before write, but a completely external Drive writer can still race a PATCH during the final milliseconds.

## Scope
- Dedicated sidebar route: `/contact-book` (Table Directory).
- Sticky table heading, search by company/contact/phone/work/project, category/group/project filters.
- Existing `PageHeader` + `PrintButton` with print-only contact table. Edit controls and edit form are excluded from print.
- Add/edit with before-save confirmation, normalization of primary + secondary phone across all records, and a two-minute database lease to avoid concurrent web writers.
- Source of truth for LIVE Web edits: **existing Drive CSV**, ID `1pea9ALaYxhVNvBzuGb615s7_M8rYesic`. The dated `3Kings_Contact_Book_2026-10-15.xlsx` remains unchanged as an archival snapshot. Do not misrepresent it as updated.
- No payroll, defects, procurement, materials, or existing Google Calendar changes.

## Historical setup checklist (read the verified current state above)
1. Apply `supabase/migrations/20261015120000_contact_book_access_and_lease.sql` to the **3 Kings** Supabase project `wtqubwdduzedmcvyhbgs` only, after review. This appends 7 cells for the NEW Contact Book module; it never updates existing module permissions.
2. Create a Google Cloud service account for Contact Book only, enable Google Drive API, and give that service-account email **Editor** access to the single CSV file. Do NOT make the file public and do not share the whole Drive.
3. Configure `GOOGLE_CONTACT_BOOK_SERVICE_ACCOUNT_JSON` as a protected server-only Vercel environment variable containing the service-account JSON, in the environment being tested; never prefix with NEXT_PUBLIC. Minimize the service account's Drive shares. Rotate and revoke if compromised.
4. Verify the account can GET metadata/content and PATCH the above exact file ID. Test on an isolated copy first; only after QA authorize editing the original.
5. Confirm Preview environment does not unknowingly point to Production Supabase/Drive (Vercel environment variables): a Preview write would otherwise reach the real source file.
6. Check the 41 baseline source rows are returned by GET and retained after edit/add. Verify contact ID, formatting, Google Drive version, file readback, and no duplicates.

## Existing role matrix — new module defaults only
| Role | Contact Book |
|---|---|
| Owner | Manage, locked |
| Admin | View |
| Viewer | View |
| Viewer & Editor | View |
| Purchase | Manage |
| Defect Viewer | No access |
| Defect Contributor | No access |

Owner may change the new module's non-locked levels using the existing Role Permission Matrix. Existing module cells and all other permissions remain untouched. Both API and database lease verify the latest matrix; hiding an edit button is never considered authorization.

## Integrity / preflight / rollback
- Existing file schema is fixed to 16 known columns; reject changed headers, IDs, a source with fewer than 41 rows, or duplicate primary/secondary phone across different Contact IDs.
- Each POST requires the precise Google file version returned by GET, takes a Postgres-backed exclusive lease, validates every record, PATCHes the CSV, then GETs/validates the updated file. If readback cannot confirm, the response is an error requiring reload; no false success.
- The new SQL migration is not applied simply by pushing this code. Do not merge until the credentials and migration are ready. Do not use a Production URL/DB to test.
- To rollback the UI: revert the branch/PR only. The CSV and existing XLSX are never replaced merely by opening the page. A separate manual review is required before reversing new module matrix cells and lease tables.
- Limitations: native Excel XLSX writeback is **not** implemented; the existing CSV is the synchronized live source. If another person edits that CSV outside the Web App during the narrow PATCH window, they could race the Web edit, so coordinate external CSV editors before production. This requires an additional native Drive version precondition or an exclusively managed CSV policy for production.

## Tests
- `node --test tests/contact-book.test.cjs`
- Existing CI suite, especially RBAC, permission matrix, Materials Print and Payroll.
- Manual tests: owner/purchase edit, viewer view-only, defect roles denied, forced unauthorized POST, phone duplication with different punctuation, stale Drive version, 2 simultaneous saves, Drive unavailable, print preview with modal open, printing 2+ pages, TH/EN/RU.
