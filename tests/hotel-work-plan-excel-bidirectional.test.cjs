const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const sql=fs.readFileSync('supabase/migrations/20261014115000_hotel_work_plan_isolated.sql','utf8')
const syncSql=fs.readFileSync('supabase/migrations/20261014130000_hotel_work_plan_excel_bidirectional.sql','utf8')
const script=fs.readFileSync('docs/apps-script/HotelWorkPlanExcelBidirectional_2026-10-14.gs','utf8')
const ctx={console};vm.createContext(ctx);vm.runInContext(script,ctx)
const entries=[...sql.matchAll(/\((\d+),(\d+),'([^']+)','([AB]\d{3})',(\d+)\)/g)]
function sample(){
 const rooms=entries.map(m=>({
  seq_no:Number(m[1]),day_no:Number(m[2]),source_room:m[3],room_no:m[4],source_row:Number(m[5]),
  planned_date_override:null,actual_date:null,work_status:'pending',note:null,
  revision:1,updated_at:null,updated_by_name:null,sync_state:'synced',source_synced_day:Number(m[2]),
  source_synced_override:null,source_synced_actual:null,source_synced_status:'pending',source_synced_note:null
 }))
 const days=Array.from({length:9},(_,i)=>({
  day_no:i+1,planned_date:null,note:null,revision:1,sync_state:'synced',
  source_synced_date:null,source_synced_note:null
 }))
 return {rooms,days}
}
function val(x){return JSON.parse(JSON.stringify(x))}
test('pinned source identity 267, protected old sheets, revision-required RPC',()=>{
 assert.equal(entries.length,267)
 assert.equal(entries[0][5],'5')
 assert.equal(entries.at(-1)[5],'271')
 assert.match(script,/FILE_ID:'1KZ-VMDssYeMmTE-TNLYU0d8fwQkSUtuS'/)
 assert.match(script,/TARGET:'xl\/worksheets\/sheet7.xml'/)
 assert.match(script,/SOURCE:'xl\/worksheets\/sheet4.xml'/)
 assert.match(script,/hpBackup_/)
 assert.match(script,/hpUnchangedOthers_/)
 assert.match(script,/hpCheckReadback_/)
 assert.match(script,/hotelWorkPlanInstallTrigger/)
 assert.match(syncSql,/pg_advisory_xact_lock/)
 assert.match(syncSql,/REVISION_CONFLICT|WEB_REVISION_CONFLICT/)
 assert.doesNotMatch(script,/DriveApp\.getFileById\([^)]*DEFECT_SOURCE/i)
 assert.doesNotMatch(syncSql,/UPDATE public\.condo_room_status|UPDATE public\.hotel_room_availability/i)
})
test('new isolated sheet has 267 schedules and 9 editable day cards',()=>{
 const snap=sample(),xml=ctx.hpBuildSheet_(snap)
 assert.match(xml,/<dimension ref="A1:M268"\/>/)
 assert.equal((xml.match(/<row r="/g)||[]).length,268)
 assert.equal(ctx.hpRaw_(xml,'A2',[]),'1')
 assert.equal(ctx.hpRaw_(xml,'B2',[]),'A202')
 assert.equal(ctx.hpRaw_(xml,'K2',[]),'1')
 assert.equal(ctx.hpRaw_(xml,'A268',[]),'267')
 assert.equal(ctx.hpRaw_(xml,'B268',[]),'B715')
 assert.equal(ctx.hpRaw_(xml,'K11',[]),'')
 const r=ctx.hpReadSheet_(xml,[],snap)
 assert.equal(r.rooms.length,267)
 assert.equal(r.days.length,9)
})
test('direct Excel manual changes import, unrelated Web changes can be written, conflicts block',()=>{
 const snap=sample();let xml=ctx.hpBuildSheet_(snap)
 xml=ctx.hpPut_(xml,'C2','2')
 xml=ctx.hpPut_(xml,'D2','18/10/2026')
 xml=ctx.hpPut_(xml,'G2','โรงแรมเปลี่ยนคิว')
 xml=ctx.hpPut_(xml,'L3','19/10/2026')
 let parsed=ctx.hpReadSheet_(xml,[],snap)
 let rec=ctx.hpReconcile_(snap,parsed)
 assert.equal(rec.imports.length,2)
 assert.equal(rec.conflicts.length,0)
 assert.equal(rec.imports.find(v=>v.kind==='room').day,2)
 assert.equal(rec.imports.find(v=>v.kind==='room').override,'2026-10-18')
 assert.equal(rec.imports.find(v=>v.kind==='day').date,'2026-10-19')
 snap.rooms[0].day_no=3;snap.rooms[0].sync_state='pending';snap.rooms[0].revision=2
 rec=ctx.hpReconcile_(snap,parsed)
 assert.equal(rec.conflicts.length,1)
 assert.match(rec.conflicts[0],/Seq 1/)
 const clean=sample()
 clean.days[0].planned_date='2026-10-20'
 clean.days[0].sync_state='pending';clean.days[0].revision=2
 const desired=ctx.hpDesired_(clean)
 const out=ctx.hpUpdateXml_(ctx.hpBuildSheet_(sample()),[],desired)
 assert.ok(out.changed>0)
 assert.equal(ctx.hpRaw_(out.xml,'L2',[]),'20/10/2026')
 assert.equal(ctx.hpRaw_(out.xml,'F2',[]),'รอกำหนด')
})
test('no formulas can be replaced, dates parse Excel serial and Thai DD/MM/YYYY',()=>{
 const snap=sample()
 let xml=ctx.hpBuildSheet_(snap)
 xml=xml.replace(/<c r="D2"[^>]*>.*?<\/c>/,'<c r="D2"><f>TODAY()</f><v>46309</v></c>')
 assert.throws(()=>ctx.hpPut_(xml,'D2','20/10/2026'),/formula/i)
 assert.equal(ctx.hpIsoDate_('14/10/2569'),'2026-10-14')
 assert.equal(ctx.hpIsoDate_('14/10/2026'),'2026-10-14')
 assert.equal(ctx.hpIsoDate_('46309'),'2026-10-14')
 assert.throws(()=>ctx.hpIsoDate_('31/02/2026'),/Invalid Excel date/)
})
test('bootstrap metadata adds sheet 7 without replacing any original worksheet',()=>{
 const snap=sample()
 const original={
  'xl/workbook.xml':{getDataAsString:()=>'<workbook><sheets><sheet sheetId="1"/></sheets></workbook>'},
  'xl/_rels/workbook.xml.rels':{getDataAsString:()=>'<Relationships></Relationships>'},
  '[Content_Types].xml':{getDataAsString:()=>'<Types></Types>'},
  'docProps/app.xml':{getDataAsString:()=>'<HeadingPairs><vt:i4>6</vt:i4></HeadingPairs><TitlesOfParts><vt:vector size="9"><vt:lpstr>ครบทุกห้อง_263</vt:lpstr></vt:vector></TitlesOfParts>'}
 }
 const x=Object.assign({},original)
 ctx.Utilities={newBlob:(s,typ,n)=>({getName:()=>n,getDataAsString:()=>s})}
 ctx.hpEnsureNewSheet_(x,snap)
 assert.match(x['xl/workbook.xml'].getDataAsString(),/Hotel_Work_Plan/)
 assert.match(x['xl/_rels/workbook.xml.rels'].getDataAsString(),/worksheets\/sheet7.xml/)
 assert.match(x['[Content_Types].xml'].getDataAsString(),/worksheets\/sheet7.xml/)
 assert.match(x['docProps/app.xml'].getDataAsString(),/vt:i4>7</)
 assert.match(x['docProps/app.xml'].getDataAsString(),/Hotel_Work_Plan/)
 assert.ok(x['xl/worksheets/sheet7.xml'])
 assert.equal(x['xl/worksheets/sheet7.xml'].getDataAsString().match(/<row r="/g).length,268)
})
