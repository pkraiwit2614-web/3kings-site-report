const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../docs/apps-script/DefectWorkOrderWebMirror_2026-10-15.gs'),'utf8');
const ctx={};vm.createContext(ctx);vm.runInContext(src,ctx);
const expectedHeader=['AL','AM','AN','AO','AP','AQ'];
assert.match(src,/function defectWorkOrderDryRun20261015/);
assert.match(src,/defectWorkOrderScheduled20261015/);
assert.match(src,/everyMinutes\(15\)/);
assert.match(src,/getLastUpdated\(\)\.getTime\(\)/);
assert.match(src,/woMirrorOneBackup_/);
assert.match(src,/Backu[p]/);
assert.match(src,/getBlob\(\)/);
assert.match(src,/Utilities\.unzip/);
assert.match(src,/Utilities\.zip/);
assert.match(src,/woMirrorRequireSheets_/);
assert.match(src,/woMirrorCanonicalRooms_/);
assert.match(src,/woMirrorDimension_/);
assert.match(src,/sourceFile\.getLastUpdated\(\)/);
assert.match(src,/targetFile\.getLastUpdated\(\)/);
assert.doesNotMatch(src,/\.from\('condo_room_status'\)\.update/);
assert.doesNotMatch(src,/deleteRows|clearContents|DriveApp\.createFile/);
// Only these additional columns are allowed; legacy manual columns are immutable.
assert.match(src,/cols:\['AL','AM','AN','AO','AP','AQ'\]/);
assert.match(src,/cols:\['L','M','N','O'\]/);

const cell=(r,t)=>`<c r="${r}" t="inlineStr"><is><t>${ctx.woMirrorEscape_(t)}</t></is></c>`;
const row=(n,body)=>`<row r="${n}">${body}</row>`;
const workbook=(rs,dim)=>`<worksheet><dimension ref="${dim}"/><sheetData>${rs.join('')}</sheetData></worksheet>`;
const rooms=[];
for(let f=2;f<=7;f++)for(let i=1;i<=27;i++)rooms.push('A'+f+String(i).padStart(2,'0'));
for(let i=1;i<=5;i++)rooms.push('B1'+String(i).padStart(2,'0'));
for(let f=2;f<=7;f++)for(let i=1;i<=16;i++)rooms.push('B'+f+String(i).padStart(2,'0'));
assert.equal(rooms.length,263);
const master=workbook([row(1,cell('C1','Room')),...rooms.map((r,i)=>row(i+2,
  cell('C'+(i+2),r)+cell('F'+(i+2),'Status '+r)+
  cell('I'+(i+2),'Hotel - Incomplete')+cell('L'+(i+2),'Follow '+r)))],'A1:Q264');
const masterMap=ctx.woMirrorCanonicalRooms_(master,[],{EXPECTED_ROOM_COUNT:263});
assert.equal(Object.keys(masterMap).length,263);
const baseRows=[row(5,cell('B5','Work ID')+cell('AK5','Existing header'))];
for(let i=0;i<67;i++){
 const r=rooms[i];let xml=cell('B'+(i+6),'DF-'+r+'-01')+cell('D'+(i+6),r)+cell('C'+(i+6),r);
 xml+='<c r="AG'+(i+6)+'"><f>IF(AF'+(i+6)+'="","",AF'+(i+6)+'+3)</f><v></v></c>';
 baseRows.push(row(i+6,xml));
}
const data=workbook(baseRows,'A1:AK72');
const settings={idCol:'B',roomCol:'D',combineCol:'C',firstRow:6,
 cols:expectedHeader,headings:['status','group','action','dispatch','conflict','last'],fileStamp:'15/10/2026'};
const first=ctx.woMirrorPatch_(data,[],masterMap,settings,67);
assert.equal(first.conflicts.length,0);
assert.equal(first.count,67);
assert.equal(first.writes,67*5+6);
assert.match(first.xml,/<f>IF\(AF6="","",AF6\+3\)<\/f>/);
assert.match(first.xml,/r="AL6"/);
assert.match(first.xml,/r="AQ72"/);
const second=ctx.woMirrorPatch_(first.xml,[],masterMap,settings,67);
assert.equal(second.writes,0,'No change should result in zero writes');
assert.equal(second.xml,first.xml);
const expanded=ctx.woMirrorDimension_(first.xml,'A1:AK72','A1:AQ72');
assert.match(expanded,/dimension ref="A1:AQ72"/);
assert.equal(ctx.woMirrorDimension_(expanded,'A1:AK72','A1:AQ72'),expanded);
assert.throws(()=>ctx.woMirrorDimension_(expanded,'A1:K61','A1:O61'),/Unexpected worksheet dimension/);
assert.throws(()=>ctx.woMirrorCell_(data,'AG6','broken'),/Refusing to overwrite manual formula/);
const tampered=data.replace('DF-A201-01','DF-A201-02');
assert.ok(ctx.woMirrorPatch_(tampered,[],masterMap,settings,67).writes>0);
const bad=data.replace('<t>A201</t>','<t>A999</t>');
const mismatch=ctx.woMirrorPatch_(bad,[],masterMap,settings,67);
assert.equal(mismatch.count,67);
assert.ok(mismatch.conflicts.length>0,'Unknown Work Order room cannot be silently synced');
console.log('Work Order mirror PASS: 263 rooms, 67 rows, zero manual writes, idempotency, safety gates');