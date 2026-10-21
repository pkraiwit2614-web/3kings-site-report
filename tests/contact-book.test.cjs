const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const ts=require('typescript')
const vm=require('node:vm')

const moduleRef={exports:{}}
const compiled=ts.transpileModule(fs.readFileSync('lib/contactBook.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText
vm.runInNewContext(compiled,{module:moduleRef,exports:moduleRef.exports,Intl,Date,Set,Map,Number,String,Object,Error,RegExp,JSON})
const contacts=moduleRef.exports

function fixture(){
  return Array.from({length:41},(_,i)=>({
    contact_id:'3KC-'+String(i+1).padStart(4,'0'),
    category:i<18?'ผู้รับเหมา':'ร้านค้า',
    service_group:'ประเภทงาน',organization:'บริษัท '+(i+1),contact_name:'ผู้ติดต่อ '+(i+1),
    phone:'081123'+String(i).padStart(4,'0'),work_scope:'งานทดสอบ',
    project_area:i<20?'Above Villa':'Above Condo',
    verified_status:'จากเอกสาร ยังไม่โทรยืนยัน',review_note:'',
    source_file:'เอกสาร',source_url:'https://example.org/source',
    source_reference_date:'15/10/2026',secondary_phone:'',active:'ใช่',aliases:''
  }))
}
test('existing 41-row CSV stays structurally intact after round-trip',()=>{
  const data=fixture()
  const csv=contacts.formatContactCsv(data)
  const got=contacts.parseContactCsv(csv)
  assert.equal(got.length,41)
  assert.equal(got[0].phone,data[0].phone)
  assert.equal(got[40].contact_id,'3KC-0041')
  assert.deepEqual(Object.keys(got[0]).sort(),[...contacts.CONTACT_FIELDS].sort())
})
test('new contact is appended without replacing existing records',()=>{
  const data=fixture()
  const edited={category:'ร้านค้า',service_group:'สุขภัณฑ์',organization:'บริษัท ใหม่',contact_name:'คุณทดสอบ',
    phone:'089-888-1111',work_scope:'จัดส่งอุปกรณ์',project_area:'Plot 3',
    review_note:'บันทึกใหม่',secondary_phone:'',active:'ใช่',aliases:''}
  const {rows,record}=contacts.putContact(data,null,edited)
  assert.equal(rows.length,42);assert.equal(record.contact_id,'3KC-0042')
  assert.equal(rows[0].phone,data[0].phone)
  assert.equal(contacts.parseContactCsv(contacts.formatContactCsv(rows)).length,42)
})
test('editing one contact leaves all other 40 untouched',()=>{
  const data=fixture()
  const source=data[1]
  const edited={category:source.category,service_group:source.service_group,organization:source.organization,
    contact_name:source.contact_name,phone:source.phone,work_scope:source.work_scope,
    project_area:'Above Villa Plot 8',review_note:'ยืนยันใหม่',secondary_phone:'',
    active:'ใช่',aliases:''}
  const {rows}=contacts.putContact(data,source.contact_id,edited)
  assert.equal(rows.length,41)
  assert.equal(rows[1].project_area,'Above Villa Plot 8')
  for(let i=0;i<rows.length;i++)if(i!==1)assert.equal(JSON.stringify(rows[i]),JSON.stringify(data[i]))
})
test('normalized duplicate phone is rejected before writing',()=>{
  const data=fixture()
  const existing=data[0].phone
  const edited={category:'ร้านค้า',service_group:'วัสดุ',organization:'ซ้ำ',contact_name:'ผู้ติดต่อ',
    phone:existing.replace(/^081/,'081-'),work_scope:'จัดซื้อ',project_area:'Above Villa',
    review_note:'',secondary_phone:'',active:'ใช่',aliases:''}
  assert.throws(()=>contacts.putContact(data,null,edited),/duplicate_contact_phone/)
})
test('CSV quote/newline and Excel-style record content round trips without shifts',()=>{
  const data=fixture()
  data[3].review_note='หมายเหตุ, \"ตรวจแล้ว\"\nบรรทัดสอง'
  const output=contacts.parseContactCsv(contacts.formatContactCsv(data))
  assert.equal(output[3].review_note,data[3].review_note)
  assert.equal(output[4].phone,data[4].phone)
})
test('integration only adds a dedicated permission row and print-scoped editor',()=>{
  const shell=fs.readFileSync('components/AppShell.tsx','utf8')
  const permission=fs.readFileSync('lib/accessControl.ts','utf8')
  const matrix=fs.readFileSync('components/RolePermissionMatrix.tsx','utf8')
  const page=fs.readFileSync('app/contact-book/page.tsx','utf8')
  const print=fs.readFileSync('components/PrintButton.tsx','utf8')
  const migration=fs.readFileSync('supabase/migrations/20261015120000_contact_book_access_and_lease.sql','utf8')
  assert.match(shell,/\['\/contact-book', 'Contact Book'\]/)
  assert.match(permission,/contact_book/)
  assert.match(matrix,/label: 'Contact Book'/)
  assert.match(page,/data-contact-book-editor/)
  assert.match(print,/data-contact-book-editor/)
  assert.match(migration,/on conflict \(role,module\) do nothing/)
  assert.doesNotMatch(migration,/drop table|truncate|delete from public\./i)
})

test('internal contact category accepted without importing unverified staging',()=>{
  const draft={category:'ภายใน',service_group:'ประสานงาน',organization:'3 Kings',contact_name:'ทดสอบ',phone:'089-888-1111',work_scope:'บริหารโครงการ',project_area:'Above Condo',review_note:'',secondary_phone:'',active:'ใช่',aliases:''}
  assert.equal(contacts.cleanContactInput(draft).category,'ภายใน')
  assert.equal(contacts.putContact(fixture(),null,draft).rows.length,42)
})
