const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const page=fs.readFileSync('app/contractor-quality/page.tsx','utf8')
const nav=fs.readFileSync('components/AppShell.tsx','utf8')
const access=fs.readFileSync('lib/accessControl.ts','utf8')
const migration=fs.readFileSync('supabase/migrations/20261115121000_contractor_quality_isolated_history.sql','utf8')

test('Contractor Quality follows existing Defect navigation immediately after Work Order',()=>{
 const begin=nav.indexOf('aria-label="Defect navigation"')
 const end=nav.indexOf('</nav>',begin)
 assert.ok(begin>0&&end>begin)
 const segment=nav.slice(begin,end)
 assert.ok(segment.indexOf('href="/work-order"')>=0)
 assert.ok(segment.indexOf('href="/contractor-quality"')>segment.indexOf('href="/work-order"'))
 assert.match(nav,/path==='\/contractor-quality'/)
})

test('Existing Work Order authorization and defect role matrix apply to quality route',()=>{
 assert.match(access,/cleanPath\(path\)==='\/work-order'\|\|cleanPath\(path\)==='\/contractor-quality'\)return canAccessWorkOrder\(role,snapshot\)/)
 assert.match(access,/p==='\/contractor-quality'\)return 'defect'/)
 assert.match(page,/const permitted=canAccessWorkOrder\(role\)/)
 assert.match(page,/if\(!permitted\)return/)
})

test('History uses Work IDs and does not discard repairs when work orders complete',()=>{
 assert.match(page,/contractor_quality_history/)
 assert.match(page,/source_confirmed===true/)
 assert.match(page,/source_origin==='master_register'/)
 assert.match(page,/const known=new Set\(history.map\(r=>r.work_id\)\)/)
 assert.match(page,/const pendingSync=snapshot.filter\(r=>!known.has\(r.work_id\)\)/)
 assert.doesNotMatch(page,/\.eq\('source_active',true\)/)
})

test('3 Kings is excluded and unclear teams are not automatically assigned to external contractors',()=>{
 assert.match(page,/if\(s==='3 Kings'\)return 'internal'/)
 assert.match(page,/return 'unconfirmed'/)
 assert.match(page,/const external=verified.filter\(r=>category\(r.contractor\)==='external'\)/)
 assert.match(page,/const unresolved=verified.filter\(r=>category\(r.contractor\)==='unconfirmed'\)/)
 assert.match(page,/Moo/)
 assert.match(page,/s==='TTM'/)
})

test('Entire new surface stays read-only and does not change baseline Defect / Work Order flows',()=>{
 for(const file of [page,migration]){
  assert.doesNotMatch(file,/\.from\('condo_room_status'\)\.(?:insert|update|delete|upsert)/)
  assert.doesNotMatch(file,/\.from\('defect_work_order_snapshot'\)\.(?:insert|update|delete|upsert)/)
 }
 assert.doesNotMatch(page,/\.upsert\(|\.insert\(|\.update\(|\.delete\(/)
 assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE|ALTER TABLE public\.defect_work_order_snapshot|ALTER TABLE public\.condo_room_status/i)
 assert.match(migration,/ENABLE ROW LEVEL SECURITY/)
 assert.match(migration,/GRANT SELECT ON TABLE public\.contractor_quality_history TO authenticated/)
 assert.match(migration,/REVOKE ALL ON TABLE public\.contractor_quality_history FROM anon, authenticated/)
})

test('Missing source records and team conflicts are made explicit rather than silently counted',()=>{
 assert.match(page,/const sourceOnly=allVerified.filter/)
 assert.match(page,/const mismatched=allVerified.filter/)
 assert.match(page,/const pendingDbOnly=history.filter\(r=>!r.source_confirmed\)/)
 assert.match(page,/source_modified_at/)
 assert.match(page,/imported_at/)
})
