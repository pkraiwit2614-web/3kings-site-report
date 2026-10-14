const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript')
const React=require('react'),{create,act}=require('react-test-renderer')
global.IS_REACT_ACT_ENVIRONMENT=true
let snapshot={revision:1,rows:require('./role-matrix-defaults.json').map(x=>({...x}))},saves=[],conflict=false
const modules={react:React,'react/jsx-runtime':require('react/jsx-runtime'),'@/lib/supabase':{getSupabase:()=>({rpc:async(name,args)=>{
 if(name==='role_permission_matrix_history')return {data:[]}
 if(name==='role_permission_matrix_save'){
  saves.push(args)
  if(conflict)return {error:{message:'REVISION_CONFLICT_RELOAD'}}
  assert.equal(args.p_expected_revision,snapshot.revision)
  snapshot={revision:snapshot.revision+1,rows:snapshot.rows.map(r=>{const c=args.p_changes.find(c=>c.role===r.role&&c.module===r.module);return c?{...r,level:c.level}:r})}
  return {data:snapshot}
 }
 throw Error(name)
}})},'@/lib/permissionClient':{loadPermissions:async()=>snapshot,applyPermissionSnapshot:()=>{}}}
function load(file){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,require:n=>{if(!modules[n])throw Error(n);return modules[n]}});return m.exports}
modules['@/lib/accessControl']=load('lib/accessControl.ts');modules['@/lib/rolePreview']=load('lib/rolePreview.ts')
const Matrix=load('components/RolePermissionMatrix.tsx').default
let root
const button=label=>root.root.findAllByType('button').find(x=>JSON.stringify(x.props.children).includes(label))
const select=()=>root.root.findByProps({'aria-label':'Viewer / Schedule / Plan vs Actual'})
;(async()=>{
 await act(async()=>{root=create(React.createElement(Matrix))})
 assert.equal(select().props.value,'view')
 assert.equal(root.root.findAllByType('select').some(x=>String(x.props['aria-label']).startsWith('Owner /')),false)
 await act(async()=>select().props.onChange({target:{value:'manage'}}))
 assert.equal(saves.length,0,'editing alone never writes')
 await act(async()=>button('ตรวจสอบก่อนบันทึก').props.onClick())
 assert.equal(saves.length,0,'review alone never writes')
 await act(async()=>button('ยืนยันบันทึกสิทธิ์').props.onClick())
 assert.equal(saves.length,1)
 assert.equal(JSON.stringify(saves[0].p_changes),JSON.stringify([{role:'viewer',module:'schedule',level:'manage'}]))
 assert.equal(select().props.value,'manage')
 await act(async()=>{root.unmount();root=create(React.createElement(Matrix))})
 assert.equal(select().props.value,'manage','saved value survives remount')
 await act(async()=>button('คืนค่าเริ่มต้น').props.onClick())
 assert.equal(select().props.value,'view');assert.equal(saves.length,1,'restore needs confirmation')
 await act(async()=>button('ยกเลิกการแก้ไข').props.onClick())
 assert.equal(select().props.value,'manage')
 conflict=true
 await act(async()=>select().props.onChange({target:{value:'none'}}))
 await act(async()=>button('ตรวจสอบก่อนบันทึก').props.onClick())
 await act(async()=>button('ยืนยันบันทึกสิทธิ์').props.onClick())
 assert.equal(select().props.value,'none','conflict preserves unsaved draft')
 assert.ok(JSON.stringify(root.toJSON()).includes('มีการเปลี่ยนสิทธิ์จากหน้าจออื่น'))
 await act(async()=>root.unmount())
 console.log('Matrix component: edit/review/confirm/save/remount/restore/cancel/conflict/protected Owner passed')
})().catch(e=>{console.error(e);process.exitCode=1})
