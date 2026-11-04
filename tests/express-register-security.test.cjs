'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const read=path=>fs.readFileSync(require('node:path').join(process.cwd(),path),'utf8')

test('registry API is disabled by default, read only, paginated, JWT/RLS-bound',()=>{
 const api=read('app/api/materials/express-register/route.ts')
 assert.match(api,/process\.env\.EXPRESS_REGISTER_DISPLAY_ENABLED!=='true'/)
 assert.match(api,/auth\.getUser\(token\)/)
 assert.match(api,/profiles/)
 assert.match(api,/readPermissionSnapshot/)
 assert.match(api,/p\.module==='materials'/)
 assert.match(api,/p\.module==='procurement'/)
 assert.match(api,/canAccessPath\(role,'\/materials',matrix\)/)
 assert.match(api,/canAccessPath\(role,'\/procurement',matrix\)/)
 assert.match(api,/cache-control':'private, no-store'/)
 assert.match(api,/createClient\(url,key,\{global:\{headers:\{Authorization:'Bearer '\+token\}/)
 assert.match(api,/\.eq\('state','complete'\)/)
 assert.match(api,/\.eq\('line_seq',0\)/)
 assert.match(api,/\.range\(page\*limit,page\*limit\+limit-1\)/) // Unchanged Materials view
 assert.match(api,/if\(!procurementView\)/)
 assert.match(api,/\.range\(offset,offset\+FETCH_CHUNK-1\)/)
 assert.match(api,/\.slice\(page\*limit,\(page\+1\)\*limit\)/)
 assert.match(api,/\.gt\('line_seq',0\)/)
 assert.match(api,/\.in\('document_no'/)
 assert.match(api,/const page=Number\(pageText\),limit=50/)
 assert.doesNotMatch(api,/SUPABASE_SERVICE_ROLE_KEY|sb_secret|service_role/)
 assert.doesNotMatch(api,/\.insert\(|\.upsert\(|\.update\(|\.delete\(/)
})

test('browser only invokes authorized API; does not leak DB credentials or query register directly',()=>{
 const page=read('app/materials/page.tsx')
 const component=read('components/ExpressRegisterSection.tsx')
 assert.match(page,/ExpressRegisterSection/)
 assert.match(component,/getSession\(\)/)
 assert.match(component,/\/api\/materials\/express-register/)
 assert.match(component,/Authorization:'Bearer '\+session\.access_token/)
 assert.match(component,/if\(state==='off'\)return null/)
 assert.doesNotMatch(component,/\.from\(['"]express_register_|SUPABASE_SERVICE_ROLE_KEY/)
 assert.doesNotMatch(component,/supabase\.co\/rest\/v1/)
 assert.match(component,/PO \/ PL/)
 assert.match(component,/PR \/ PC/)
})

test('isolated migration preserves existing procurement and secures incomplete batches',()=>{
 const sql=read('supabase/migrations/20261022220800_express_registry_read_model.sql')
 assert.match(sql,/express_register_runs/)
 assert.match(sql,/express_register_rows/)
 assert.match(sql,/enable row level security/)
 assert.match(sql,/revoke all .* from anon/)
 assert.match(sql,/state='complete'/)
 assert.match(sql,/private\.matrix_allowed\('procurement','view'/)
 assert.doesNotMatch(sql,/update public\.procurement_items|truncate public\.procurement_items|drop table public\.procurement_items/i)
})


test('procurement-only Express history: correct Thai dates, document kind and newest-first sorting',()=>{
 const ts=require('typescript')
 const vm=require('node:vm')
 const source=read('lib/expressRegisterDisplay.ts')
 const compiled=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS
 }}).outputText
 const sandbox={exports:{}}
 vm.runInNewContext(compiled,sandbox)
 const {expressDateISO,compareExpressDocumentsNewestFirst,expressDocumentType}=sandbox.exports
 assert.equal(expressDateISO('31/10/69'),'2026-10-31')
 assert.equal(expressDateISO('24/06/68'),'2025-06-24')
 assert.equal(expressDateISO('02/11/2569'),'2026-11-02')
 assert.equal(expressDateISO('2026-11-04'),'2026-11-04')
 assert.equal(expressDateISO('31/02/69'),null)
 const rows=[
  {document_date:'24/06/68',document_no:'PO1',document_group:'PO_PL'},
  {document_date:'31/10/69',document_no:'PL1',document_group:'PO_PL'},
  {document_date:null,document_no:'PC1',document_group:'PR_PC'},
  {document_date:'02/11/69',document_no:'PO2',document_group:'PO_PL'}
 ]
 rows.sort(compareExpressDocumentsNewestFirst)
 assert.deepEqual(rows.map(row=>row.document_no),['PO2','PL1','PO1','PC1'])
 assert.equal(expressDocumentType('PO69001'),'สั่งซื้อ')
 assert.equal(expressDocumentType('PL00001'),'สั่งจ้าง')
 assert.equal(expressDocumentType('PR00001'),'ขอซื้อ')
 assert.equal(expressDocumentType('PC00001'),'ขอจ้าง')
 const component=read('components/ExpressRegisterSection.tsx')
 const page=read('app/procurement/page.tsx')
 const api=read('app/api/materials/express-register/route.ts')
 assert.match(page,/query=\{needle\} procurementView/)
 assert.match(component,/procurementView&&/)
 assert.match(component,/position:'sticky'/)
 assert.match(component,/type="date"/)
 assert.match(component,/row.items.slice\(2\)/)
 assert.match(api,/view==='procurement'/)
 assert.match(api,/expressDateISO\(row.document_date\)/)
 assert.match(api,/REGISTER_DETAILS_UNAVAILABLE/)
})
