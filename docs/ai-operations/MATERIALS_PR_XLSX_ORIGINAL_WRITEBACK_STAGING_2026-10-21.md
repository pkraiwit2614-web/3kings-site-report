# Scoped original-ID XLSX writer — staged, not deployed (21 Oct 2026)

## Purpose and existing-system impact
- Bypass the ChatGPT Google Drive connector's file-reference shape mismatch by using the **existing authorized Apps Script OAuth token** and the documented Drive `files.update` media PATCH.
- Operate on the same **approved Drive File ID**, preserving the filename, Drive permissions, folder, and the existing inbound Materials/PR Sync mappings.
- This is a new **isolated staging utility**. Do not install it into the current 7-file Live Apps Script project, deploy a Web App endpoint, modify OAuth settings, or enable triggers based solely on this GitHub source.
- Do not touch Defect, Work Order, Daily Reports, Payroll, Calendar, RBAC/RLS, Express import, or unrelated tables/rows. No Production deployment or automatic writes are included.

## Safety contract
1. Resolve SOP 06 and SOP 13 from the current ACTIVE Google Drive SOP INDEX; verify owner/editor identity, permitted file names, IDs, and current file revisions.
2. A *separate owner-authorized* Apps Script execution environment needs OAuth scopes `drive` and `script.external_request`. Add a JSON list of approved file IDs to the **private Script Property** `MATERIAL_PR_XLSX_ALLOWLIST`. Never put this list in the public GitHub repository.
3. Request example (place real IDs and evidence only in the private execution environment):
   `{fileId:"<approved ID>",expectedName:"<existing.xlsx>",sheetName:"<existing sheet>",changes:[{cell:"D12",expected:"old value",value:"new value"}]}`
4. First call `xlsxScopedPreview(request)`. It checks identity, allowlist, existing row and exact current cell value, rejects formula edits and returns a SHA-256 fingerprint plus exact `expectedModifiedMs` — **no write**.
5. Only after comparing the dry-run result to the approved PR evidence, call `xlsxScopedApply({...request,expectedSha256:"<from preview>",expectedModifiedMs:<from preview>})`. It checks the same source fingerprint again, applies only the specified cells to the existing XLSX worksheet XML, uploads to **the original Drive ID**, then re-downloads and checks edited cells and unrelated ZIP members.
6. Up to 20 changed cells per request; strings and finite numbers only. Existing worksheet rows only. **Append/new rows, new sheets, formula edits, format shifts and workbook table-range changes are intentionally blocked** until a separately tested extension covers them. Do not force the earlier 21 October PR files through this first version.
7. Batches of up to 6 edits do not create an extra standalone backup. Larger batches create **one** file-level baseline copy if not already recorded. Drive version history is not guaranteed to retain all revisions indefinitely.
8. No auto-trigger and no unsolicited writes. If concurrent edit, stale checksum, unexpected sheet, missing allowlist, formula, or any readback discrepancy: FAIL CLOSED. The tool's `DRIVE_READBACK_PASS` means only that Drive XLSX bytes were validated; run the existing (unchanged) Materials Sync and verify target records at Source → Sync log → Supabase → Web before claiming `SYNC_PASS`.
9. Current byte-fingerprint + modified-time guards narrow the race, but Google Drive's upload API does not provide a general atomic cell-level transaction across another concurrently editing client. For high-collaboration files, schedule a short controlled write window.

## QA / activation status
- Static unit tests: `node --test tests/materials-pr-scoped-xlsx-writeback.test.cjs`
- Commit/PR code review must validate helper isolation, worksheet mapping, expected-value guards, formula preservation, no credential exposure and no change to any existing pipeline.
- Next external prerequisite: independently prove the file edit through owner-authorized Apps Script execution on a **disposable XLSX file**, with dry-run → apply → same-ID readback → rollback / version-history check. Do not do the first live test on the Materials, PR or Procurement Masters.
- After that proof and an append-row-safe implementation (if needed), apply the 21 October Plot 9 / Mirage PR update through the authorized scope and run the established Sync/readback. Until then, those Master files remain unchanged.
