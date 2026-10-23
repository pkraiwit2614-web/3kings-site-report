-- Disposable local CI ONLY; mirror of isolated production migration, no hosted access.
-- Express full-history registry: isolated read model, never mixed into procurement_items.
-- Production gate: apply only after scope/QA approval; no receipt status inference.
create table if not exists public.express_register_runs (
  id uuid primary key default gen_random_uuid(),
  source_fingerprint text not null unique check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  state text not null default 'importing' check (state in ('importing','complete','failed')),
  source_files integer not null check (source_files between 1 and 90),
  document_count integer not null check (document_count >= 0),
  line_count integer not null check (line_count >= 0),
  canceled_count integer not null default 0 check (canceled_count >= 0),
  review_count integer not null default 0 check (review_count >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint completed_gate check ((state='complete') = (completed_at is not null))
);
create table if not exists public.express_register_rows (
  batch_id uuid not null references public.express_register_runs(id) on delete cascade,
  document_group text not null check (document_group in ('PO_PL','PR_PC')),
  document_no text not null check (document_no ~ '^(PO|PL|PR|PC)[0-9]{6,9}[A-Z]?$'),
  line_seq integer not null check (line_seq >= 0),
  document_date text,
  supplier text,
  plot_codes text[] not null default '{}',
  qa_status text not null,
  source_file text,
  source_url text,
  item_code text,
  description text,
  quantity numeric(18,4),
  unit text,
  unit_price numeric(18,4),
  line_amount numeric(18,4),
  grand_total numeric(18,4),
  search_text text not null default '',
  primary key (batch_id,document_group,document_no,line_seq),
  constraint header_line_shape check (
    (line_seq=0 and item_code is null and description is null)
    or (line_seq>0 and item_code is not null)
  ),
  constraint nonnegative_quantity check (quantity is null or quantity >= 0)
);
create index if not exists express_registry_complete_runs
 on public.express_register_runs (completed_at desc) where state='complete';
create index if not exists express_registry_doc_lookup
 on public.express_register_rows (batch_id,document_no,line_seq);
create index if not exists express_registry_headers
 on public.express_register_rows (batch_id,document_group,document_no) where line_seq=0;
alter table public.express_register_runs enable row level security;
alter table public.express_register_rows enable row level security;
revoke all on public.express_register_runs,public.express_register_rows from anon;
revoke all on public.express_register_runs,public.express_register_rows from authenticated;
grant select on public.express_register_runs,public.express_register_rows to authenticated;
grant all on public.express_register_runs,public.express_register_rows to service_role;
drop policy if exists express_register_runs_read on public.express_register_runs;
create policy express_register_runs_read on public.express_register_runs
 for select to authenticated using (
  state='complete' and private.matrix_allowed('procurement','view',(select private.is_active_user()))
 );
drop policy if exists express_register_rows_read on public.express_register_rows;
create policy express_register_rows_read on public.express_register_rows
 for select to authenticated using (
  (exists (select 1 from public.express_register_runs b where b.id=batch_id and b.state='complete'))
  and private.matrix_allowed('procurement','view',(select private.is_active_user()))
 );
-- Only the existing trusted Apps Script service-role key may write these rows.
-- Never expose key to browser or create anon/authenticated write policies.

-- Synthetic Viewer grants for this isolated fixture only; never propagated to Production.
INSERT INTO private.role_permission_matrix(role,module,level,default_level,locked)
VALUES ('viewer','materials','view','view',false),('viewer','procurement','view','view',false)
ON CONFLICT (role,module) DO NOTHING;
