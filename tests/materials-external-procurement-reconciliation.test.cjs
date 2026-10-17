'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '../docs/apps-script/MaterialsExternalProcurementGuard_2026-10-17.gs'),
  'utf8'
);
const ctx = {};
vm.runInNewContext(source, ctx);
const partition = ctx.partitionProcurementForMasterSync20261017_;
const ids = [
  '0800abb4-cc10-431d-a466-e1317739ed6f',
  '0cf3e226-d14f-40c3-ad84-0b09e6ffac76',
  '228fb09c-0dad-440d-a291-1b530fcbf72c',
  '710679d7-d0c7-465e-b4c6-131995e20797',
  '775862af-1a3b-4753-bea2-44dbbffd5730',
  'af82f4d9-c133-496f-b979-6a30b57672a9',
  'afb1fb16-d1e9-48bc-94f3-465d5b63051e',
  'c9bf165b-61d1-4698-8c49-c721956efc4c'
];
const ext = ids.map((id,i)=>({
  id, source_sheet:'PR-QUOTATION Approved 2026-10-14',
  source_row:i+1, item_name:'external '+(i+1)
}));
const master = Array.from({length:114}, (_,i)=>({
  id:'master-'+(i+1), source_sheet:'04 Purchasing ค้างส่ง', source_row:i+1
}));
const existing=[...master,...ext];
const before=JSON.stringify(existing);
const filtered=partition(existing);
assert.equal(filtered.comparable.length,114);
assert.equal(filtered.preserved.length,8);
assert.equal(JSON.stringify(existing), before);
const incoming=[...master.map(row=>({source_row:row.source_row})),...[
  {source_row:119},{source_row:120},{source_row:121}
]];
assert.equal(incoming.length,117);
assert.equal(incoming.filter(row => !filtered.comparable.some(old=>old.source_row===row.source_row)).length,3);
assert.throws(()=>partition([...existing,{id:'unknown',source_sheet:'other'}]),/no writes/);
assert.throws(()=>partition([...master,...ext.slice(1),ext[1]]),/duplicate row identity/);
assert.throws(()=>partition(master),/no writes/);
console.log('PASS: 114 master records, 8 preserved external records and 3 new PR records. Unknown/missing records blocked.');
