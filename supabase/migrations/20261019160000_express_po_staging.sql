-- Express PO Preview-only staging contract. Migration is NOT applied to Production.
-- Existing materials, procurement_items, file sync and RBAC/RLS remain unchanged.
create table if not exists public.express_po_import_runs (
 id uuid primary key default gen_random_uuid(),
 source_file text not null,
 source_modified_at timestamptz not null,
 source_sha256 text not null unique check(source_sha256 ~ '^[a-f0-9]{64}$'),
 summary jsonb not null, qa jsonb not null,
 created_at timestamptz not null default now()
);
create table if not exists public.express_po_document_snapshots (
 run_id uuid not null references public.express_po_import_runs(id) on delete restrict,
 po_no text not null, document_data jsonb not null,
 primary key(run_id,po_no)
);
create table if not exists public.express_po_item_snapshots (
 run_id uuid not null, po_no text not null,
 sequence integer not null check(sequence>0),
 item_data jsonb not null,
 primary key(run_id,po_no,sequence),
 foreign key(run_id,po_no)
  references public.express_po_document_snapshots(run_id,po_no) on delete restrict
);
alter table public.express_po_import_runs enable row level security;
alter table public.express_po_document_snapshots enable row level security;
alter table public.express_po_item_snapshots enable row level security;
revoke all on public.express_po_import_runs,
 public.express_po_document_snapshots,public.express_po_item_snapshots
 from public,anon,authenticated;

-- Atomic + idempotent per file hash. Credentialed server-role only; never user-initiated.
create or replace function public.express_po_stage_import(
 p_source_file text,p_source_modified_at timestamptz,p_source_sha256 text,
 p_documents jsonb,p_qa jsonb,p_summary jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;v_doc jsonb;v_item jsonb;v_po text;v_seq integer;
begin
 if coalesce(auth.role(),'')<>'service_role' then
  raise exception 'service-role only';
 end if;
 if p_source_sha256 !~ '^[a-f0-9]{64}$' or
  jsonb_typeof(p_documents)<>'array' or jsonb_array_length(p_documents)>1000 or
  jsonb_typeof(p_qa)<>'array' or jsonb_typeof(p_summary)<>'object'
 then raise exception 'invalid Express PO staging payload';end if;
 select id into v_id from public.express_po_import_runs where source_sha256=p_source_sha256;
 if found then return v_id;end if;
 insert into public.express_po_import_runs
 (source_file,source_modified_at,source_sha256,summary,qa)
 values(p_source_file,p_source_modified_at,p_source_sha256,p_summary,p_qa)
 on conflict (source_sha256) do nothing returning id into v_id;
 if v_id is null then
  select id into v_id from public.express_po_import_runs where source_sha256=p_source_sha256;
  return v_id;
 end if;
 for v_doc in select value from jsonb_array_elements(p_documents) loop
  v_po:=v_doc->>'poNo';
  if v_po !~ '^(PO[0-9]{9}|PL[0-9]{7})$' or jsonb_typeof(v_doc->'items')<>'array'
  then raise exception 'invalid PO document';end if;
  insert into public.express_po_document_snapshots(run_id,po_no,document_data)
   values(v_id,v_po,v_doc-'items');
  for v_item in select value from jsonb_array_elements(v_doc->'items') loop
   v_seq:=(v_item->>'sequence')::integer;
   insert into public.express_po_item_snapshots(run_id,po_no,sequence,item_data)
    values(v_id,v_po,v_seq,v_item);
  end loop;
 end loop;
 return v_id;
end $$;
revoke all on function public.express_po_stage_import(text,timestamptz,text,jsonb,jsonb,jsonb)
 from public,anon,authenticated;
grant execute on function public.express_po_stage_import(text,timestamptz,text,jsonb,jsonb,jsonb)
 to service_role;
