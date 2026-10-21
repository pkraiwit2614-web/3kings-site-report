# Contact Book — simplified existing-Supabase release (21 Oct 2026)

## Decision: NO extra Google setup, API key or file writer
PR #111 originally proposed a dedicated Google service account, JSON key, and live Google Drive CSV updates. The approved 3 Kings SOP 15 and SOP 16 **do not require** these. The successor PR #211 replaces the design with existing Supabase Auth / PostgREST / Role Matrix and a dedicated small Contact Book directory stored in Supabase. No new cloud provider, worker, Google Drive API or Vercel secret is required.

## Intended behavior
- One left sidebar tab `/contact-book`, sticky searchable directory, filtered/printed table, add/edit with confirmation.
- Existing live permissions: Owner and Purchase manage; Admin/Viewer/Viewer & Editor view; Defect roles none unless Owner changes the module's matrix.
- Users may edit only through the dedicated server-validated, database-atomic RPC `contact_book_save`. Authenticated roles cannot directly INSERT/UPDATE/DELETE the contact table. Supabase RLS checks the same existing permission matrix. Database controls version conflict, phone duplication and audit.
- An older Drive CSV contains 41 initial rows; **one-time seed only** (after schema isolated QA) through a privileged private database operation, not through code or the public repo.
- The dated original CSV and XLSX stay unchanged as historical input. The 20 Oct `Collection_ByAffiliation` file remains **STAGING**, with no automatic import of unverified names.
- Future edits on the web update Supabase only. There is deliberately **no automatic bidirectional Drive ↔ Web/Excel sync**, which avoids file version races and Google service credentials. A separate explicitly authorized export could be built later if necessary.

## Actual verified / not verified
- Current Supabase: 7 `contact_book` matrix cells + audit/lease tables exist, historical migration version `20261015023849` already installed. Do not reapply the old migration.
- Replacement code is on GitHub PR #211. Check the actual head SHA and current CI results after every revision.
- New directory migration `supabase/migrations/20261021235000_contact_book_directory.sql` is scoped to Contact Book only. It is **not yet applied** simply by committing.
- Source data contains phone numbers. Never commit contacts, private CSV bytes, identity tokens or credentials to this public repository.
- Production is HOLD until: isolated SQL/RLS and client behavior QA; scoped required checks; one-time import of exactly the verified 41 baseline rows and DB readback; release approval/merge; Vercel Production actual SHA and authenticated UI test.

## Rollback / impact
- Rollback UI by reverting the Contact Book PR. Do not delete contact database rows as part of rollback.
- Source files and existing Defect, Materials, Daily, Payroll, Work Plan, Calendar, other Role Matrix cells and related syncs must remain unchanged.
- SOP 15/16 require scope-specific QA, not Google Service Accounts. No global SOP policy edits are needed.
