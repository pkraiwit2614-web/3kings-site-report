-- Isolated read-only quotation evidence for an exact existing Express PC.
-- Do not change Express source rows, procurement status, approval, or materials master.
-- Private Drive file IDs are stored as data, never in this public migration.
create table if not exists public.express_quotation_evidence (
  document_group text not null default 'PR_PC'
    check (document_group = 'PR_PC'),
  document_no text not null
    check (document_no ~ '^PC[0-9]{9}[A-Z]?$'),
  quotation_no text not null check (length(btrim(quotation_no)) > 0),
  quotation_date date not null,
  supplier text not null check (length(btrim(supplier)) > 0),
  amount_incl_vat numeric(16,2) not null check (amount_incl_vat >= 0),
  drive_file_id text not null check (drive_file_id ~ '^[A-Za-z0-9_-]{12,}$'),
  file_name text not null check (length(btrim(file_name)) > 0),
  created_at timestamptz not null default now(),
  primary key (document_group,document_no,drive_file_id)
);
alter table public.express_quotation_evidence enable row level security;
revoke all on public.express_quotation_evidence from PUBLIC,anon,authenticated;
grant select on public.express_quotation_evidence to authenticated;
create policy express_quotation_evidence_view on public.express_quotation_evidence
  for select to authenticated
  using (private.matrix_allowed('procurement'::text,'view'::text,
    (select private.is_active_user())));
