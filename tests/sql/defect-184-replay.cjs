'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
function psql(sql,expectSuccess=true){
 const args=['-X','-A','-t','-v','ON_ERROR_STOP=1'];
 const r=cp.spawnSync('psql',args,{input:sql,encoding:'utf8',env:process.env,maxBuffer:5*1024*1024});
 if(expectSuccess){if(r.status!==0)throw Error('PostgreSQL FAIL: '+String(r.stderr).slice(-2500));}
 else if(r.status===0)throw Error('Expected SQL gate failure but it succeeded');
 return (r.stdout||'').trim();
}
function file(p){return fs.readFileSync(p,'utf8')}
function assertResult(expr,value){
 const got=psql('SELECT ('+expr+')::text;').trim().split('\n').at(-1);
 assert.equal(got,String(value),expr+' -> '+got);
}
const oldFixture=file('tests/sql/defect-override-reconcile-fixture.sql');
psql(oldFixture);
psql(file('supabase/migrations/20261019132800_defect_override_field_reconcile_20261019.sql'));
psql(String.raw\`
ALTER TABLE public.condo_room_status
  ADD COLUMN building text,ADD COLUMN floor integer,
  ADD COLUMN hotel_participation text,ADD COLUMN customer_status text,
  ADD COLUMN follow_up text,ADD COLUMN priority text,
  ADD COLUMN source_note text,ADD COLUMN hotel_complete_color text,
  ADD COLUMN hotel_remarks text;
CREATE TABLE public.drive_sync_runs(
  sync_type text,project_code text,source_file text,source_sheet text,
  rows_read integer,rows_written integer,status text,message text);
CREATE OR REPLACE FUNCTION private.drive_sync_key_valid(p text)
  RETURNS boolean LANGUAGE sql AS 'SELECT p = ''local_test_only_key''';
TRUNCATE TABLE public.condo_room_status;
WITH rooms AS (
 SELECT 'A'||(100+i)::text room_no FROM generate_series(1,157) AS i
 UNION ALL SELECT x FROM (VALUES ('A311'),('A401'),('A313'),('A301'),('A302')) t(x)
 UNION ALL SELECT 'B'||(100+i)::text FROM generate_series(1,97) AS i
 UNION ALL SELECT x FROM (VALUES ('B204'),('B502'),('B707'),('B314')) t(x)
)
INSERT INTO public.condo_room_status (
 room_no,building,floor,hotel_participation,customer_status,
 current_status,status_group,follow_up,priority,next_action,
 latest_source,source_note,hotel_complete_color,hotel_remarks,defect_detail,
 source_file_id,source_file_name,source_modified_at
)
SELECT room_no,left(room_no,1),substring(room_no,2,1)::integer,
 'ไม่ร่วมโรงแรม','มีลูกค้า','Defect pending','Non-Hotel - Pending',
 'รอติดตาม','normal','ประสานงาน','Prior',null,null,null,
 CASE WHEN room_no='A311' THEN 'Pending Web note'
      WHEN room_no='B707' THEN 'Acknowledged Web note'
      WHEN room_no='A301' THEN 'Outside-scope old note'
      ELSE 'Existing detail' END,
 '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',
 'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
 '2026-10-18 09:00+07'::timestamptz FROM rooms;
INSERT INTO public.defect_web_overrides (
 room_no,current_status,status_group,next_action,detail_text,
 source_sync_state,updated_at,source_synced_at
) VALUES
('A311',null,null,null,'Pending Web note','pending','2026-10-19 08:00+07',null),
('B707',null,null,null,'Acknowledged Web note','synced',
 '2026-10-19 08:00+07','2026-10-19 09:00+07');
CREATE TEMP TABLE candidate_rows AS
 SELECT jsonb_agg(jsonb_build_object(
  'room_no',room_no,'building',building,'floor',floor,
  'hotel_participation',hotel_participation,'customer_status',customer_status,
  'current_status',current_status,'status_group',status_group,
  'follow_up',follow_up,'priority',priority,'next_action',next_action,
  'latest_source',latest_source,'source_note',source_note,
  'hotel_complete_color',hotel_complete_color,'hotel_remarks',hotel_remarks,
  'defect_detail',CASE room_no
    WHEN 'A311' THEN 'รายการ Defect แจ้งผ่านแชต: Excel cannot override pending'
    WHEN 'A401' THEN 'รายการ Defect แจ้งผ่านแชต: Excel accepted'
    WHEN 'B707' THEN 'รายการ Defect แจ้งผ่านแชต: newer acknowledged'
    WHEN 'A301' THEN 'รายการ Defect แจ้งผ่านแชต: forbidden outside scope'
    ELSE NULL END
 )) AS payload FROM public.condo_room_status;
\`);
assertResult('(SELECT count(*) FROM public.condo_room_status)',263);
assertResult('(SELECT count(*) FROM public.condo_room_status WHERE building=''A'')',162);
assertResult('(SELECT count(*) FROM public.condo_room_status WHERE building=''B'')',101);
psql(file('tests/sql/defect-184-canonical-rpc-baseline.sql'));
const migration=file('supabase/migrations/20261020125000_defect_chat_detail_scoped_guard_20261020.sql');
const originals=['122f81d4065030c7fb95b21c28bc6a28','e8e902111b5f5f01d74e05d0c95d4d63'];
for(const h of originals)assert.ok(migration.includes("'"+h+"'"),'Expected pinned production baseline');
const getHash=signature=>psql('SELECT md5(pg_get_functiondef('+signature+'));').trim().split('\n').at(-1);
const sig="'public.drive_sync_apply_condo_defects(text,text,text,timestamptz,jsonb,boolean)'::regprocedure";
const trig="'public.defect_web_override_protect()'::regprocedure";
const localRpc=getHash(sig),localTrigger=getHash(trig);
assert.match(localRpc,/^[0-9a-f]{32}$/);assert.match(localTrigger,/^[0-9a-f]{32}$/);
// Simulate drift first: a mismatch must reject the migration, preserving its function.
let adjusted=migration.replaceAll(originals[0],localRpc).replaceAll(originals[1],localTrigger);
const broken=adjusted.replace(localRpc,'00000000000000000000000000000000');
psql(broken,false);
assert.equal(getHash(sig),localRpc,'Mismatch guard mutated function');
psql(adjusted);
assert.notEqual(getHash(sig),localRpc,'Migration did not install its limited detail support');
const use=(key,src,count,dry)=>'SELECT public.drive_sync_apply_condo_defects('+
 "'"+key+"','"+src+"','1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',"+
 "'2026-10-20 10:00+07'::timestamptz,"+
 (count===263?'(SELECT payload FROM candidate_rows)':"(SELECT jsonb_agg(x) FROM (SELECT jsonb_array_elements(payload) x FROM candidate_rows LIMIT 1) t)")+','+(dry?'true':'false')+')::text;';
const source='Handover_Defect_Summary_Updated_28-09-2026.xlsx';
function jsonResult(query){return JSON.parse(psql(query).split('\n').at(-1))}
assert.equal(jsonResult(use('wrong_key',source,263,true)).ok,false);
assert.equal(jsonResult(use('local_test_only_key','WRONG_SOURCE.xlsx',263,true)).ok,false);
const dry=jsonResult(use('local_test_only_key',source,263,true));
assert.equal(dry.ok,true,'dry-run rejected valid room inventory');
assertResult("(SELECT defect_detail FROM public.condo_room_status WHERE room_no='A401')",'Existing detail');
const wrote=jsonResult(use('local_test_only_key',source,263,false));
assert.equal(wrote.ok,true,'scoped sync failed');
assertResult("(SELECT defect_detail FROM public.condo_room_status WHERE room_no='A311')",'Pending Web note');
assertResult("(SELECT defect_detail FROM public.condo_room_status WHERE room_no='A401')",'รายการ Defect แจ้งผ่านแชต: Excel accepted');
assertResult("(SELECT defect_detail FROM public.condo_room_status WHERE room_no='A301')",'Outside-scope old note');
assertResult("(SELECT defect_detail FROM public.condo_room_status WHERE room_no='B707')",'รายการ Defect แจ้งผ่านแชต: newer acknowledged');
assertResult("(SELECT count(*) FROM private.defect_reconcile_field_audit WHERE room_no='B707' AND field_name='defect_detail' AND decision='accepted_excel')",1);
assertResult("(SELECT count(*) FROM public.defect_web_overrides)",6);
assertResult("(SELECT count(*) FROM public.drive_sync_runs WHERE status='success')",1);
const again=jsonResult(use('local_test_only_key',source,263,false));
assert.equal(again.ok,true);
assert.equal(again.changed,0,'idempotent replay changed fields');
console.log('PASS: local Postgres exact 263-room inventory, key/source deny, MD5 drift guard, 5-room scope, pending override retained, synced acknowledgment, audit, zero-change replay');
