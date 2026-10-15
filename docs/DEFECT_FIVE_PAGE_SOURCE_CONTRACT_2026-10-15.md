# Defect five-page source contract — 15 Oct 2026

## Verified canonical roles (no new Excel or Apps Script write paths)
| Surface | Reads | Updates |
| --- | --- | --- |
| Defect Flow | `condo_room_status` | None on Flow |
| Defect Report | `condo_room_status`; supplemental `hotel_work_plan_days/rooms` and `hotel_room_availability` | Existing room-level Defect workflow only |
| Work Order | `defect_work_order_snapshot` eligible rows checked against `condo_room_status` | Read-only: NO per-work-item web writes |
| Hotel Work Plan | `hotel_work_plan_days/rooms` as 267-row source schedule; **render-filter only** by current `condo_room_status` and confirmed `hotel_room_availability=OOO` | Only planned date fields via existing revision-checked RPC; keep all source rows & existing note/status/actual date untouched |
| Hotel OOO/OOS | `hotel_room_availability` (hotel status) plus `condo_room_status`; permitted 3 Kings users may read Work Order snapshot for links | Existing hotel availability workflow, never Defect closure |

## Core source files and authority
- Defect room-level master: `Handover_Defect_Summary_Updated_28-09-2026.xlsx`, Drive `1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj`, pinned and validated by Defect sync; status overview Excel remains a human-facing output, not a second authority.
- Work Order work-level dispatch: `Defect_Work_Order_Updated_2026-10-15.xlsx` (separately pinned); `defect_work_order_snapshot` is an import snapshot, NOT editable web authority. The 52 unclosed source work IDs are further filtered by current room-level status; do not mark source jobs complete automatically.
- Hotel source for OOO/OOS classification is separate from room-level Defect. Current working report `Contractor_Schedule_Above_Element_OOO_OOS_Updated_2026-10-13.xlsx` preserves Day 1–9 and hotel status context; obtain and verify future original shared hotel workbook before changing any source ID.
- Plan editor working copy: `Above_Element_Hotel_vs_Defect_2026-10-13.xlsx`, pinned ID `1KZ-VMDssYeMmTE-TNLYU0d8fwQkSUtuS`, sheet `Hotel_Work_Plan`. Its 267 rows and 9 Day identifiers remain intact for Excel↔Web revision/writeback. Static comparison totals in its other tabs are NOT live Defect authority.

## Eligibility, presentation and reconciliation
1. Work Order link uses `?room=<canonical-room-id>`; the existing Work Order filtering still shows only unfinished records where all Combine members are `Hotel - Incomplete`. Good01–05 normalize to B101–105 and Combine searches locate any member.
2. Plan includes one canonical Combine group only when **every member** is either `Hotel - Incomplete` or `Hotel - Awaiting Check` and has explicit `OOO`. `OOS`, `UNKNOWN` and missing status are not OOO authorization. Display OOS separately as pending permission. Never convert missing Hotel state to AVAILABLE.
3. Day/individual planned dates must fit the hotel OOO period; the page rejects out-of-range edits but the original RP C still needs a separate server-validation review before it can be treated as a server-enforced guarantee.
4. Distinguish Defect **room** status from unfinished Work Order **item** status. If they disagree, do not force a closure/opening, modify the hotel file or infer actual completion. Flag reconciliation.
5. Same-page live status refresh uses Supabase subscriptions where available plus focus refresh. Existing Excel synchronization has its own verification; a web database save is not proof that XLSX has been written.
6. Existing role matrix, RLS and file/Drive permissions remain unchanged. Work Order links are shown only to roles permitted to open that page.
7. No files are deleted, consolidated, renamed, or overwritten by this branch. Reducing manual Excel edits is accomplished at the presentation/read-model layer first; any actual retirement of a file or new bidirectional write authority needs an independent migration and readback test.

## 15 October read-only baseline
- 263 canonical Defect rooms.
- 16 `Hotel - Incomplete`; 37 `Hotel - Awaiting Check`.
- Of those 53 rooms: 40 explicit OOO, 1 OOS, 12 with no OOO/OOS row.
- 267 Hotel Plan source entries representing 263 distinct Room IDs.
- 52 Work Order active snapshot rows; 41 currently eligible under the preexisting Work Order display rule, 11 excluded because room-level state now indicates checked/awaiting check (A212, A523, B610/B611, B711). Reconcile without mutating either source.

## Regression and release gate
Run `npm run build` and the existing CI suite including `tests/work-order-viewer.test.cjs`, Hotel Work Plan and hotel availability tests. Confirm Preview commit SHA, current access roles, OOO date filtering, Combine identity, print behavior and unchanged XLSX sync / properties / triggers before Production.
