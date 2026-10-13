const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const worker = fs.readFileSync('docs/apps-script/DefectExcelWriteback_2026-10-13.gs', 'utf8');
const sql = fs.readFileSync('supabase/migrations/20261013153000_defect_excel_writeback_queue.sql','utf8');
const panel = fs.readFileSync('components/DefectInputPanel.tsx','utf8');

assert.match(worker,/runDefectWritebackScheduled/);
assert.match(worker,/everyMinutes\(5\)/);
assert.match(worker,/defect_writeback_pull/);
assert.match(worker,/defect_writeback_ack/);
assert.match(worker,/defect_writeback_failure/);
assert.match(worker,/Utilities\.unzip/);
assert.match(worker,/Utilities\.zip/);
assert.match(worker,/writeback.*Excel|Excel.*writeback|Drive upload/);
assert.match(worker,/defectWbVerifyXml_/);
assert.match(worker,/\.getLastUpdated\(\)/);
assert.match(worker,/1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj/);
assert.match(worker,/16JuK26rn7HGPDtSlnMMS2aljYGWyn0Y3/);
assert.doesNotMatch(worker,/DriveApp\.createFile|SpreadsheetApp\.create/);
assert.match(worker,/BACKUP_before_DefectExcelWriteback_2026-10-13/);
assert.match(worker,/getFoldersByName\('Backup'\)/);
assert.match(sql,/updated_at = p_revision/);
assert.match(sql,/source_sync_state = 'synced'/);
assert.match(sql,/source_sync_state = 'pending'/);
assert.match(sql,/private\.drive_sync_key_valid/);
assert.match(panel,/defect_writeback_status/);
assert.match(panel,/Excel ทั้งสองไฟล์/);

const context = {console, Object, RegExp, String, Number, Error};
vm.createContext(context);
vm.runInContext(worker, context, {filename:'DefectExcelWriteback_2026-10-13.gs'});
const esc=context.defectWbEscape_('ไทย & <test> "ok"');
assert.equal(esc,'ไทย &amp; &lt;test&gt; &quot;ok&quot;');
assert.equal(context.defectWbUnescape_(esc),'ไทย & <test> "ok"');

// Simulate the exact room inventory expected by the existing 263/A162/B101 gate.
const rooms=[];
for(let floor=2;floor<=7;floor++)for(let unit=1;unit<=27;unit++)
  rooms.push('A'+floor+String(unit).padStart(2,'0'));
for(let unit=1;unit<=5;unit++)rooms.push('B1'+String(unit).padStart(2,'0'));
for(let floor=2;floor<=7;floor++)for(let unit=1;unit<=16;unit++)
  rooms.push('B'+floor+String(unit).padStart(2,'0'));
assert.equal(rooms.length,263);
const mk=(col)=>'<worksheet><sheetData><row r="1"><c r="'+col+'1" t="inlineStr"><is><t>Room</t></is></c></row>'+
 rooms.map((room,i)=>'<row r="'+(i+2)+'"><c r="'+col+(i+2)+'" t="inlineStr"><is><t>'+room+'</t></is></c><c r="P'+(i+2)+'"><f>1+1</f><v>2</v></c></row>').join('')+
 '</sheetData></worksheet>';
for(const col of ['C','D']){
 const xml=mk(col);
 const row=context.defectWbFindRoomRow_(xml,[],col,'B105');
 assert.equal(row,168);
 const mutated=context.defectWbPutCell_(xml,'Q'+row,'แก้ Defect เสร็จแล้ว & รอตรวจ');
 assert.equal(context.defectWbReadCell_(mutated,'Q'+row,[]),'แก้ Defect เสร็จแล้ว & รอตรวจ');
 assert.match(mutated,/<f>1\+1<\/f><v>2<\/v>/);
 assert.equal((mutated.match(/<f>1\+1<\/f>/g)||[]).length,263);
 assert.throws(()=>context.defectWbPutCell_(xml,'P'+row,'destroy'),/Refusing to replace Excel formula/);
}
console.log('Defect two-workbook writeback static and XML cell-safety tests passed');
