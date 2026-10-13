const fs=require('node:fs')
const assert=require('node:assert/strict')
const ts=require('typescript')
const vm=require('node:vm')

function load(path){
 const module={exports:{}}
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports})
 return module.exports
}
const g=load('lib/hotelRoomGroups.ts')
const role=load('lib/accessControl.ts')
const original=fs.readFileSync('components/DefectCombineRoomEnhancer.tsx','utf8')
const oldGroups=Array.from(original.matchAll(/\['([AB]\d{3})','([AB]\d{3})'(?:,'([AB]\d{3})')?\]/g),m=>[m[1],m[2],...(m[3]?[m[3]]:[])])
assert.deepEqual(JSON.parse(JSON.stringify(g.HOTEL_COMBINE_GROUPS)),oldGroups,'Combine mapping must match existing Defect UI')
for (let i=1;i<=5;i++){
 assert.equal(g.normalizeHotelRoom('Good0'+i),'B10'+i)
 assert.equal(g.normalizeHotelRoom('GOOD'+i),'B10'+i)
}
assert.equal(g.hotelRoomKey('B615'),'B614')
assert.deepEqual([...g.hotelRoomMembers('A224')],['A223','A224','A225'])
assert.deepEqual([...g.hotelRoomMembers('B614')],['B614','B615'])
assert.equal(g.hotelRoomKey('A311'),'A311')
for(const r of ['owner','admin','viewer','viewer_editor','purchase','defect_contributor','defect_editor']){
 assert.equal(role.canAccessPath(r,'/hotel-room-status'),true,'room availability read role '+r)
 assert.equal(role.canAccessPath(r,'/data-health'),r==='owner','reconciliation owner only')
}
const sql=fs.readFileSync('supabase/migrations/20261013190000_hotel_room_availability.sql','utf8')
const tab=fs.readFileSync('app/hotel-room-status/page.tsx','utf8')
const reconciliation=fs.readFileSync('components/HotelRoomReconciliationPanel.tsx','utf8')
assert.match(sql,/ENABLE ROW LEVEL SECURITY/g)
assert.match(sql,/ROOM_AVAILABILITY_EDIT_DENIED/)
assert.match(sql,/REVISION_CONFLICT_RELOAD/)
assert.match(sql,/ROOM_OUTSIDE_HOTEL_PROGRAM/)
assert.match(sql,/REVIEW_OWNER_ONLY/)
assert.doesNotMatch(sql,/UPDATE public\.condo_room_status/i)
assert.doesNotMatch(sql,/DELETE FROM public\.condo_room_status/i)
for (const rooms of oldGroups)for (const room of rooms)
 assert.ok(sql.includes("('"+room+"','"+rooms[0]+"')"),'SQL membership '+room)
assert.match(tab,/DefectInputPanel manualOnly/)
assert.match(tab,/hotel_room_availability_save/)
assert.match(tab,/hotelRoomKey/)
assert.match(reconciliation,/hotel_room_availability_review/)
const flow=fs.readFileSync('app/defect-flow/page.tsx','utf8')
assert.doesNotMatch(flow,/<DefectInputPanel\s*\/>/)
assert.match(flow,/Defect Detail/)
assert.match(fs.readFileSync('app/defects/page.tsx','utf8'),/<DefectInputPanel\s*\/>/)
console.log('Hotel room availability checks passed: role visibility, 31 Combine groups, Good aliases, separation and review')
