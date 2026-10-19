const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261019163000_defect_excel_first_override_precedence.sql'),'utf8');
const canonical='1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj';
function allowed(x){return x.synced&&x.id===canonical&&x.name==='Handover_Defect_Summary_Updated_28-09-2026.xlsx'&&x.source>Math.max(x.web,x.ack)}
test('newer canonical Excel wins only after acknowledged Web edits',()=>{
 const b={synced:true,id:canonical,name:'Handover_Defect_Summary_Updated_28-09-2026.xlsx',web:100,ack:110};
 assert.equal(allowed({...b,source:120}),true);
 assert.equal(allowed({...b,source:110}),false);
 assert.equal(allowed({...b,source:120,synced:false}),false);
 assert.equal(allowed({...b,source:120,id:'QA_COPY'}),false);
});
test('no destructive schema, privilege or history changes',()=>{
 for(const s of ['source_sync_state','source_modified_at','source_synced_at','source_file_id','source_file_name','app.defect_manual_update',canonical,'SECURITY DEFINER'])
 assert.ok(sql.includes(s),s);
 for(const r of [/DROP\s+TRIGGER/i,/DROP\s+TABLE/i,/DELETE\s+FROM/i,/TRUNCATE/i,/ALTER\s+POLICY/i,/GRANT\s/i])
 assert.doesNotMatch(sql,r);
});
test('five-room rollout only',()=>{assert.match(sql,/new\.room_no NOT IN \('B214','B314','B315','B403','B515'\)/)})
