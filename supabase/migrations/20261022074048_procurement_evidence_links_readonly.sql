-- Procurement evidence lookup only. Does not modify existing purchasing source,
-- status, imported rows, privileges, RLS or sync pipelines.
-- Private Google Drive IDs are DATA, never hard-coded in this public migration.
create table if not exists public.procurement_evidence_links (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('PR','PO','PL')),
  document_no text not null check (length(trim(document_no)) > 0),
  drive_file_id text not null check (drive_file_id ~ '^[A-Za-z0-9_-]{12,}$'),
  file_name text not null check (length(trim(file_name)) > 0),
  file_format text not null check (file_format in ('PDF','ZIP','JPG','JPEG','PNG')),
  evidence_scope text not null check (evidence_scope in ('individual','bundle')),
  created_at timestamptz not null default now(),
  unique (document_type,document_no,drive_file_id)
);
create index if not exists procurement_evidence_links_doc_idx
  on public.procurement_evidence_links(document_type,document_no);
alter table public.procurement_evidence_links enable row level security;

revoke all on public.procurement_evidence_links from PUBLIC, anon, authenticated;
grant select on public.procurement_evidence_links to authenticated;

create policy procurement_evidence_links_view on public.procurement_evidence_links
  for select to authenticated
  using (private.matrix_allowed('procurement'::text,'view'::text,
    (select private.is_active_user())));

-- No client insert/update/delete policies. Imports are separate audited
-- service-side operations after document identity & access verification.
