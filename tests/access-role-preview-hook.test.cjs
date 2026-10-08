// Runs the real hooks with synthetic profiles and in-memory preview storage.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript')
const React=require(process.env.TEST_REACT_MODULE||'react')
const {create,act}=require(process.env.TEST_RENDERER_MODULE||'react-test-renderer')
global.IS_REACT_ACT_ENVIRONMENT=true
class PreviewEvent extends Event{constructor(type,options){super(type);this.detail=options?.detail}}
const win=new EventTarget(),storage=new Map()
win.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}
let profileRole='manager',userId='bc6ee244-3472-422f-bbf9-d551987ee9a3',active=true
const supabase={auth:{getUser:async()=>({data:{user:{id:userId}}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:profileRole,active}})})})})}
const modules={react:React,'@/lib/supabase':{getSupabase:()=>supabase}}
function load(file){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,require:n=>{if(!(n in modules))throw Error(n);return modules[n]},window:win,CustomEvent:PreviewEvent});return module.exports}
modules['@/lib/accessControl']=load('lib/accessControl.ts')
modules['@/lib/rolePreview']=load('lib/rolePreview.ts')
modules['@/components/useRolePreview']=load('components/useRolePreview.ts')
const useAccessRole=load('components/useAccessRole.ts').default
const access=modules['@/lib/accessControl'],preview=modules['@/lib/rolePreview']
let latest,root
function Probe(){latest=useAccessRole();return null}
const matrix={admin:[false,true,false,false,false],purchase:[false,false,false,true,false],viewer:[false,false,false,false,false],viewer_editor:[true,false,false,false,true],defect_contributor:[false,false,false,false,false],defect_editor:[false,false,true,false,false],owner:[true,true,true,true,true]}
const checks=['canEditSchedule','canEditSiteOperations','canEditDefect','canEditProcurement','canEditCalendar']
function expectRole(role){assert.equal(latest.role,role);assert.equal(latest.ready,true);checks.forEach((fn,i)=>assert.equal(access[fn](latest.role),matrix[role][i],role+' '+fn))}
;(async()=>{
 storage.set(preview.ROLE_PREVIEW_STORAGE_KEY,'admin')
 await act(async()=>{root=create(React.createElement(Probe))})
 expectRole('admin');assert.equal(latest.actualRole,'owner')
 for(const role of Object.keys(matrix).filter(r=>r!=='owner')){
 await act(async()=>{preview.setRolePreview('owner',role)})
 expectRole(role);assert.equal(latest.actualRole,'owner');assert.equal(profileRole,'manager')
 }
 await act(async()=>{preview.clearRolePreview()});expectRole('owner')
 await act(async()=>{root.unmount()})
 for(const role of ['admin','purchase','defect_editor']){
 profileRole=role;userId='11111111-1111-4111-8111-111111111111';storage.clear()
 await act(async()=>{root=create(React.createElement(Probe))});expectRole(role)
 await act(async()=>{root.unmount()})
 }
 console.log('PASS: stored preview, live role switches, exit preview, real Admin/Purchase/Defect Editor; real identity unchanged')
})().catch(e=>{console.error(e);process.exitCode=1})
