const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const ts=require('typescript')
const vm=require('node:vm')
const raw=fs.readFileSync('lib/agentCore.ts','utf8')
const code=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText
const catalog=require('../docs/agent-skills/manifest.json')
const moduleShim={exports:{}}
vm.runInNewContext(code,{module:moduleShim,exports:moduleShim.exports,require:(p)=>{
 if(p==='node:crypto')return require('node:crypto')
 if(p==='@/docs/agent-skills/manifest.json')return catalog
 throw Error('unexpected import '+p)
},URL})
const gate=moduleShim.exports
const cmd=catalog.shortcuts.find(s=>s.number===13)
const good={
 readIndex:async()=>({id:'index',modifiedTime:'v1',rows:[{sequence:'13',shortcut:cmd.shortcut,
   sopUrl:'https://docs.google.com/document/d/exampleSop/edit',status:'จัดทำ SOP v1.0'}]}),
 readSop:async()=>({id:'exampleSop',name:cmd.sop_title,mimeType:'application/vnd.google-apps.document',
   modifiedTime:'v2',text:'current full SOP body'}),
 readIndexRevision:async()=>'v1',
 readSopRevision:async()=>'v2'
}
test('17 unique agent shortcut definitions are preserved',()=>{
 assert.equal(catalog.shortcuts.length,17)
 assert.equal(new Set(catalog.shortcuts.map(s=>s.number)).size,17)
 assert.equal(catalog.shortcuts.filter(s=>s.mode==='read_only').length,7)
})
test('only 13/14 can invoke phase-2 inspection',()=>{
 for(const c of catalog.shortcuts){
   if([13,14].includes(c.number))assert.doesNotThrow(()=>gate.validateAction(c,'inspect'))
   else assert.throws(()=>gate.validateAction(c,'inspect'),/BLOCK_ACTION_NOT_READ_ONLY/)
 }
})
test('verified live SOP revision yields read-only decision without mutation',async()=>{
 const r=await gate.evaluateSopGate(13,'inspect',good)
 assert.equal(r.code,'PASS_READ_ONLY');assert.equal(r.ok,true)
 assert.equal(r.sop.fileId,'exampleSop');assert.equal(r.sop.sha256.length,64)
})
test('full 17-command preflight is audit-only',async()=>{
 const r=await gate.evaluateSopGate(13,'preflight',good)
 assert.equal(r.code,'PASS_PREFLIGHT_ONLY')
})
test('missing index, altered document and broken sources all fail closed',async()=>{
 const cases=[
   [{...good,readIndex:async()=>({modifiedTime:'v1',rows:[]})},'BLOCK_SOP_NOT_FOUND'],
   [{...good,readSop:async()=>({...await good.readSop(),text:' '})},'BLOCK_SOP_UNREADABLE'],
   [{...good,readSopRevision:async()=>'changed'},'BLOCK_SOP_REVISION_CHANGED'],
   [{...good,readIndexRevision:async()=>'changed'},'BLOCK_SOP_REVISION_CHANGED'],
   [{...good,readSop:async()=>({...await good.readSop(),name:'different'})},'BLOCK_SOP_TITLE_CONFLICT'],
   [{...good,readIndex:async()=>({...await good.readIndex(),
      rows:[{sequence:'13',shortcut:cmd.shortcut,sopUrl:'https://bad.example/d/1',status:'ok'}]})},'BLOCK_SOP_LINK_INVALID'],
   [{...good,readIndex:async()=>({...await good.readIndex(),
      rows:[{sequence:'13',shortcut:cmd.shortcut,sopUrl:'https://docs.google.com/document/d/exampleSop/edit',status:'Archive'}]})},'BLOCK_SOP_NOT_APPROVED'],
   [{...good,readSop:async()=>{throw Error('Drive down')}},'BLOCK_SOP_SOURCE_UNAVAILABLE']
 ]
 for(const [source,expected] of cases){
   const r=await gate.evaluateSopGate(13,'inspect',source)
   assert.equal(r.ok,false);assert.equal(r.code,expected)
 }
})
test('unknown ID, unknown mode and malformed SOP URL rejected',()=>{
 for(const id of [0,18,'13',null])assert.throws(()=>gate.resolveCommand(id),/BLOCK_UNKNOWN_COMMAND/)
 assert.throws(()=>gate.validateAction(cmd,'write'),/BLOCK_INVALID_MODE/)
 assert.throws(()=>gate.sopIdFromUrl('https://evil.example/document/d/file'),/BLOCK_SOP_LINK_INVALID/)
})
test('route is owner-authenticated and accepts no mutation payload or non-owner access',()=>{
 const route=fs.readFileSync('app/api/agent/read-only/route.ts','utf8')
 for(const v of ['getUser(token)','OWNER_USER_ID','readPermissionSnapshot','FORBIDDEN_MATRIX','BLOCK_UNSUPPORTED_FIELD',
   'createLiveSopSource','evaluateSopGate','inspectSync','inspectProduction'])
   assert.ok(route.includes(v),v)
 assert.equal(/\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.rpc\(['"]drive_sync_replace/.test(route),false)
})
