const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const read=(p)=>fs.readFileSync(p,'utf8')
test('OOO Excel writeback script compiles and has a pinned source identity',()=>{
 const source=read('docs/apps-script/HotelOOOExcelWriteback_2026-10-13.gs')
 assert.doesNotThrow(()=>new vm.Script(source))
 assert.match(source,/19TX2KinSx3QXLw_VMZCE3Gm-bQVzzsSC/)
 assert.match(source,/hotel_room_excel_writeback_pull/)
 assert.match(source,/hotelOOOVerifyChange_/)
 assert.match(source,/hotelOOOBackup_/)
 assert.match(source,/hotelOOOInstallTrigger/)
 assert.doesNotMatch(source,/deleteTrigger\(.*smartSync/i)
 assert.doesNotMatch(source,/DELETE FROM public\.condo_room_status/i)
})
test('OOO Excel XML edits preserve non-target fields and block formula overwrites',()=>{
 const source=read('docs/apps-script/HotelOOOExcelWriteback_2026-10-13.gs')
 const ctx={};vm.createContext(ctx);vm.runInContext(source,ctx)
 const xml='<worksheet><sheetData><row r="5"><c r="A5" t="inlineStr"><is><t>A202</t></is></c><c r="B5" s="11" t="inlineStr"><is><t>OOO</t></is></c><c r="Z5"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>'
 const edited=ctx.hotelOOOPut_(xml,'B5','OOS')
 assert.equal(ctx.hotelOOORead_(edited,'B5',[]),'OOS')
 assert.match(edited,/<c r="Z5"><f>1\+1<\/f>/)
 assert.throws(()=>ctx.hotelOOOPut_(edited,'Z5','bad'),/formula/)
 assert.equal(ctx.hotelOOONormalize_('GOOD 02'),'B102')
 assert.equal(ctx.hotelOOOPeriod_('2026-10-01','2026-10-31'),'01/10/2026 – 31/10/2026')
})
test('Hotel UI keeps physical rows while synchronizing Combine members through checked RPC',()=>{
 const src=read('app/hotel-room-status/page.tsx')
 assert.match(src,/return rooms\.map\(\(room\):RoomGroup/)
 assert.match(src,/key:room\.room_no,members,hotel:ownHotel/)
 assert.match(src,/hotelRoomMembers\(room\.room_no\)/)
 assert.match(src,/ownHotel:HotelStatus/)
 const combineSql=read('supabase/migrations/20261013212500_combine_group_edit_consistency.sql')
 assert.match(combineSql,/FOREACH v_member IN ARRAY v_rooms LOOP/)
 assert.match(combineSql,/public\.hotel_room_source_map/)
 assert.match(src,/p_room_no:chosen\.key/)
 assert.match(src,/source_sync_state/)
 assert.match(src,/hotel_remark/)
})
test('SQL migration isolates hotel Excel from Defect and checks revisions',()=>{
 const sql=read('supabase/migrations/20261013210000_hotel_ooo_excel_sync_pinned.sql')
 assert.match(sql,/hotel_room_source_map/)
 assert.match(sql,/hotel_room_excel_writeback_ack/)
 assert.match(sql,/REVISION_CONFLICT_RELOAD/)
 assert.doesNotMatch(sql,/UPDATE public\.condo_room_status/i)
 assert.doesNotMatch(sql,/DELETE FROM public\.condo_room_status/i)
})

test('XLSX bytes are rewrapped as application/zip for all three read paths',()=>{
 const src=read('docs/apps-script/HotelOOOExcelWriteback_2026-10-13.gs')
 const bytes=[0x50,0x4b,0x03,0x04]
 let unzipped=false
 const utilities={
  newBlob:(source,mime,name)=>({data:source,mime,name,getBytes(){return this.data}}),
  unzip:blob=>{
   assert.equal(blob.mime,'application/zip')
   assert.equal(blob.name,'hotel-ooo-read.zip')
   assert.deepEqual(blob.getBytes(),bytes)
   unzipped=true
   return ['unzipped']
  }
 }
 const ctx={Utilities:utilities}
 vm.createContext(ctx)
 vm.runInContext(src,ctx)
 const result=ctx.hotelOOOUnzipXlsx_({getBytes:()=>bytes})
 assert.equal(unzipped,true)
 assert.equal(result[0],'unzipped')
 assert.match(src,/hotelOOOUnzipXlsx_\(file\.getBlob\(\)\)/)
 assert.match(src,/hotelOOOUnzipXlsx_\(f\.getBlob\(\)\)/)
 assert.match(src,/hotelOOOUnzipXlsx_\(DriveApp\.getFileById\(HOTEL_OOO_WB\.FILE_ID\)\.getBlob\(\)\)/)
 assert.doesNotMatch(src,/Utilities\.unzip\(file\.getBlob\(\)\)/)
 assert.doesNotMatch(src,/Utilities\.unzip\(f\.getBlob\(\)\)/)
})


test('empty self-closing Excel cells do not read data from the following row',()=>{
 const src=read('docs/apps-script/HotelOOOExcelWriteback_2026-10-13.gs')
 const ctx={};vm.createContext(ctx);vm.runInContext(src,ctx)
 const sheet='<worksheet><sheetData>'+
  '<row r="139"><c r="F139" t="inlineStr"><is><t>A201</t></is></c>'+
  '<c r="H139" s="22"/><c r="I139" s="22"/><c r="J139" s="24"/>'+
  '<c r="K139" s="24"/></row>'+
  '<row r="140"><c r="A140"><v>5.0</v></c><c r="H140" t="inlineStr"><is><t>OOO</t></is></c></row>'+
  '</sheetData></worksheet>'
 const beforeRow=sheet.match(/<row r="140">[\s\S]*?<\/row>/)[0]
 assert.equal(ctx.hotelOOORead_(sheet,'H139',[]),'')
 assert.equal(ctx.hotelOOORead_(sheet,'H140',[]),'OOO')
 const changed=ctx.hotelOOOPut_(sheet,'H139','OOS')
 assert.equal(ctx.hotelOOORead_(changed,'H139',[]),'OOS')
 assert.equal(ctx.hotelOOORead_(changed,'H140',[]),'OOO')
 assert.equal(ctx.hotelOOORead_(changed,'I139',[]),'')
 assert.equal(changed.match(/<row r="140">[\s\S]*?<\/row>/)[0],beforeRow)
 assert.equal((changed.match(/<row r="139">/g)||[]).length,1)
 assert.throws(()=>ctx.hotelOOOCellPattern_('H139 OR 1=1'),/INVALID_EXCEL_CELL_ADDRESS/)
})
