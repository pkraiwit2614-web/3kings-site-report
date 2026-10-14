# Shared Viewer password immutability — Auth-layer rollout gate

**Status: NOT ACTIVATED.** Do not merge/deploy #105 as full enforcement while native Auth protections remain absent.

## Scope and identities

- Shared-account roles: `viewer` and `defect_contributor` (UI label: **Defect Viewer**).
- Permitted self-service roles: Owner, Admin, `viewer_editor` (Viewer & Editor), Purchase and `defect_editor` (Defect Contributor).
- Existing Owner-only `admin-users` / `reset_password` must keep working; `profiles` and all role grants remain unchanged.
- Internal aliases `foreman` → Viewer; `engineer`, `payroll` and legacy `manager` resolve through existing `resolveAccessRole` code.
- No forced password rotation on login.

## Why route guards and RLS are insufficient

Supabase Auth supports direct `/auth/v1/user` password updates for an authenticated user's JWT. That route is not governed by application route permissions or `profiles` RLS. Denying `/account` and `/reset-password` in the Web App is necessary but not sufficient.

## Supported Auth-level mechanism and its effects

GoTrue's user-update handler rejects a password change when the user has a **verified MFA factor** and the session is not **AAL2**; ordinary password login yields AAL1. Verified MFA factor removal also requires AAL2. The **adminUserUpdate** endpoint used by existing Owner Reset updates passwords through a separate privileged pathway without requiring the target's AAL2 session. Relevant primary sources:

- https://github.com/supabase/auth/blob/master/internal/api/user.go
- https://github.com/supabase/auth/blob/master/internal/api/admin.go
- https://github.com/supabase/auth/blob/master/internal/api/mfa.go
- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/reference/javascript/auth-admin-mfa-deletefactor

**Important side effect:** Verifying a new MFA factor invalidates that user's other AAL1 sessions. Affected Viewer users must sign in again, although their existing username/password and subsequent AAL1 sign-in behavior remain the same if the app does not enforce AAL2 for normal access. That one-time interruption conflicts with a literal "no impact on existing login sessions" requirement.

A shared identity must not receive the factor's TOTP secret or a means to enroll/remove a verified factor at AAL1; the enrollment and recovery process must be controlled by Owner. Do not enroll factors blindly on production users or retain TOTP secrets in application logs.

## Alternative considered and rejected

A `BEFORE UPDATE` trigger on `auth.users.encrypted_password` would also intercept Owner's existing `auth.admin.updateUserById` reset, because GoTrue updates the password first and `app_metadata` in a separate SQL statement within the admin transaction. A time-limited allow-list leaves a reset window in which a Viewer could race a direct password update, and can cause an Owner reset outage. Avoid changing `auth.users` directly or deploying a trigger before a full compatibility review and isolated integration tests.

## Required acceptance tests BEFORE production change

1. **Temporary isolated identity:** Create a new TEST Viewer in a staging Supabase project with the same relevant Auth config. Do not reuse a real Viewer account.
2. **Before protection:** Password login (AAL1) succeeds; direct `auth.updateUser({password})` is demonstrably possible.
3. **Owner-managed factor enrollment:** Securely enroll/verify MFA while keeping its secret out of shared user's reach. Check the factor is verified via admin API. Capture a recovery/unenroll path limited to Owner.
4. **After protection:** Ordinary USER login remains AAL1 and the app's existing read permissions still work. Direct password update is rejected with insufficient AAL. Repeated attempts, token refreshes, and direct REST calls must also be rejected.
5. **Owner Reset:** Existing `admin-users` action resets a TEST Viewer password, old password stops working and the new password logs in. Factor remains present; direct self-update remains denied.
6. **Existing sessions:** Explicitly document and accept the one-time AAL1 session invalidation at enrollment. Test multiple simultaneous sessions.
7. **Authorized roles:** Self-change remains possible for Admin, Viewer & Editor, Purchase, Defect Contributor and Owner without MFA changes.
8. **Recovery:** Owner can remove a verified TEST factor with `auth.admin.mfa.deleteFactor` if the lock is rolled back, and direct change works again.
9. **Regression:** Run full CI: Payroll / Role Matrix / Defect / Materials Print and verify Vercel preview, then verify production commit after deployment.

## Production rollout — blocked pending integration evidence

- Record current Viewer identities and their verified-factor state (no secrets).
- Apply only to current Viewer/Defect Viewer, one account at a time; Owner explicitly acknowledges one-time sign-out.
- Do not alter user IDs, passwords, roles, RLS, existing Edge Function `admin-users`, or application data.
- Monitor Owner Reset, subsequent logins and Viewer read access.
- On any failure, remove only the newly introduced owner-managed factor via admin API and retest, without changing passwords or role mapping.
- No automatic promotion while Vercel preview is unavailable / build rate limited.

**2026-10-14 preflight:** Production Supabase has 3 `viewer` and 1 `defect_contributor` profile, and zero verified MFA factors for those roles. Therefore provider-level enforcement is **not active** yet. This document is operational research, not evidence of live enforcement.
