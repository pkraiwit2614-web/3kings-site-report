const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
test('security audit SQL cannot change privileges or source tables',()=>{
 const sql=fs.readFileSync('supabase/audits/phase1_rpc_permissions_readonly.sql','utf8')
 const commands=sql.split('\n').filter(s=>!/^\s*--/.test(s)).join('\n').toLowerCase()
 assert.match(commands,/select\s+[\s\S]*has_function_privilege/)
 assert.doesNotMatch(commands,/\b(revoke|grant|alter|drop|insert|delete|update|truncate|create|execute)\s+(on|from|into|function|table|role|schema)\b/)
 assert.match(commands,/p\.prosecdef/)
 assert.match(commands,/has_function_privilege\('anon'/)
})
test('Phase 1 keeps all 17 SOP skill definitions and align only three live SOP names',()=>{
 const manifest=require('../docs/agent-skills/manifest.json')
 assert.equal(manifest.shortcuts.length,17)
 for(const id of [13,15,17]){
  const row=manifest.shortcuts.find(s=>s.number===id)
  assert.match(row.sop_title,/v1\.1_2026-10-19$/)
 }
 assert.equal(manifest.shortcuts.find(s=>s.number===13).mode,'read_only')
 assert.equal(manifest.shortcuts.find(s=>s.number===17).mode,'read_only')
})
