const fs=require('node:fs')
const assert=require('node:assert/strict')

const read=path=>fs.readFileSync(path,'utf8')
const sql=read('supabase/migrations/20261013212500_combine_group_edit_consistency.sql')
const hotel=read('app/hotel-room-status/page.tsx')
const defect=read('app/defects/page.tsx')
const editor=read('components/DefectInputPanel.tsx')
const flow=read('app/defect-flow/page.tsx')
const dashboard=read('app/page.tsx')
const groups=read('lib/hotelRoomGroups.ts')
const marker=read('components/DefectCombineRoomEnhancer.tsx')

// The canonical identity and the existing Combine "c" indicator stay unchanged.
assert.match(groups, /"A213",\s*"A214"/)
assert.match(groups, /"A223",\s*"A224",\s*"A225"/)
assert.match(marker, /code\.textContent='c'/)
assert.match(hotel, /<b>{hotelRoomLabel\(g\.key\)}<\/b>/)
assert.match(hotel, /return \{key:room\.room_no,members/)
assert.match(hotel, /hotelRoomMembers\(g\.key\)/)
assert.match(defect, /hotelRoomMembers\(r\.room_no\)/)

// Each authenticated edit updates all members atomically via one server RPC.
// Row-specific source maps preserve per-room Excel writeback and revision.
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.hotel_room_availability_save/i)
assert.match(sql,/v_rooms text\[\]/)
assert.match(sql,/FOREACH v_member IN ARRAY v_rooms LOOP/)
assert.match(sql,/INSERT INTO public\.hotel_room_availability/)
assert.match(sql,/ON CONFLICT\(room_no\) DO UPDATE SET/)
assert.match(sql,/public\.hotel_room_source_map/)
assert.match(sql,/source_sync_state='pending'/)
assert.match(sql,/FOR UPDATE/)
assert.match(sql,/REVISION_CONFLICT_RELOAD/)
assert.match(sql,/ROOM_AVAILABILITY_EDIT_DENIED/)
assert.match(sql,/REVOKE ALL ON FUNCTION public\.hotel_room_availability_save/)

// Defect updates use the existing audited/checked entrypoint, retaining the
// trigger and Excel writeback, while updating every Combine member.
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.defect_manual_update_apply_checked/)
assert.match(sql,/v_id:=public\.defect_manual_update_apply\(v_member/)
assert.match(sql,/DEFECT_REVISION_CONFLICT_REFRESH_ROOM/)
assert.doesNotMatch(sql,/DELETE FROM public\./)
assert.doesNotMatch(sql,/DROP TABLE/)
assert.match(editor,/hotelRoomMembers\(target\)/)
assert.match(editor,/combineMembers\.length>1/)
assert.match(editor,/defect_manual_update_apply_checked/)

// Read-only search includes Combine peers and can accept comma-separated rooms.
assert.match(hotel,/query\.split\(\/\[,，\]\+\//)
assert.match(hotel,/g\.members\.some/)
assert.match(hotel,/statusText\(g\.hotel\)/)
assert.match(hotel,/g\.conflict/)
assert.match(defect,/const paired=rows\.filter\(other=>hotelRoomMembers/)
assert.ok(defect.indexOf('className="panel filter-panel compact-filter-shell"')<defect.indexOf('<DefectInputPanel />'))
assert.match(hotel,/<PrintButton reportTitle="Room Status \| OOO\/OOS"/)
assert.match(hotel,/\.hotel-status-table th\{position:sticky;top:0/)

// Dashboard actions respect the existing route guard and preserve freshness
// in the right-side action area only. Flow SVG inherits the application font.
assert.match(dashboard,/canAccessPath\(role,'\/reports'\)/)
assert.match(dashboard,/canViewSiteOperations&&<Link href="\/reports"/)
assert.doesNotMatch(dashboard,/\+ รายงานประจำวัน/)
assert.doesNotMatch(dashboard,/ข้อมูล Dashboard จาก Schedule \/ Materials \/ Site Operations/)
assert.match(flow,/<g fontFamily="inherit">/)
assert.match(flow,/clone\.querySelector\('g\[font-family\]'\)/)
console.log('Combine edit, search, layout, RBAC, and unchanged room identity checks passed')
