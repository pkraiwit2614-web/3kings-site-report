\set ON_ERROR_STOP on
-- Runs after tests/sql/workorder-express-overrides-isolated.sql on ephemeral PostgreSQL 17.
-- No Production credentials, Drive IDs, or data writes.
\i supabase/migrations/20261104112700_express_pc_quotation_evidence.sql
insert into public.express_quotation_evidence
 (document_group,document_no,quotation_no,quotation_date,supplier,amount_incl_vat,drive_file_id,file_name)
values ('PR_PC','PC691103001','QT-SYNTH-001','2026-10-24','Synthetic Supplier',5350.00,
  'SyntheticDriveID1234567890','PC691103001_QT_SYNTH_IMG.jpg');
do $$ begin
 if (select count(*) from public.express_quotation_evidence where document_no='PC691103001')<>1
 then raise exception 'quotation exact-document fixture missing';end if;
 if has_table_privilege('anon','public.express_quotation_evidence','SELECT') or
    has_table_privilege('authenticated','public.express_quotation_evidence','INSERT') or
    has_table_privilege('authenticated','public.express_quotation_evidence','UPDATE') or
    has_table_privilege('authenticated','public.express_quotation_evidence','DELETE')
 then raise exception 'quotation security boundary broken';end if;
 if not (select relrowsecurity from pg_class where oid='public.express_quotation_evidence'::regclass)
 then raise exception 'quotation RLS not enabled';end if;
end $$;
set role authenticated;
do $$ begin
 if (select count(*) from public.express_quotation_evidence where document_no='PC691103001')<>1
 then raise exception 'authorized procurement quotation evidence not visible';end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.express_register_rows)<>7
 then raise exception 'original Express row count modified by quotation model';end if;
 raise notice 'ISOLATED PC QUOTATION EVIDENCE / RLS / EXPRESS PRESERVATION PASS';
end $$;
