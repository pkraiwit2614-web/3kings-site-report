-- Scoped, additive Express project override. No existing registry/Material rows are changed.
-- Activation requires isolated PostgreSQL/RLS QA and production readback, SOP 15/16.
create table if not exists public.express_project_overrides (
  document_group text not null check (document_group in ('PO_PL','PR_PC')),
  document_no text not null check (document_no ~ '^(PO|PL|PR|PC)[0-9]{6,9}[A-Z]?$'),
  plot_codes text[] not null check (cardinality(plot_codes) between 1 and 4),
  supplier_code text not null check (supplier_code ~ '^AP-[0-9]{4}$'),
  expected_total numeric(18,4) not null check (expected_total >= 0),
  evidence_url text not null check (evidence_url ~ '^https://drive\\.google\\.com/file/d/'),
  evidence_scope text not null,
  reviewed_by text not null,
  status text not null check (status in ('approved','revoked')) default 'approved',
  verified_at timestamptz not null default now(),
  primary key(document_group, document_no)
);
alter table public.express_project_overrides enable row level security;
revoke all on public.express_project_overrides from public, anon, authenticated;
grant select on public.express_project_overrides to authenticated;
grant all on public.express_project_overrides to service_role;
drop policy if exists express_project_overrides_reader on public.express_project_overrides;
create policy express_project_overrides_reader on public.express_project_overrides
 for select to authenticated using
 (status='approved' and private.matrix_allowed('procurement','view',(select private.is_active_user())));

-- Source proof: signed 26/10/2026 PL0000976 confirms Above Element Condo B room B603.
-- Source proof: signed 04/08/2026 PL0000850 confirms Proud Residence Condo B rooftop stair.
-- PROUD-CONDO-B is intentionally distinct from Above Element's CONDO-B.
insert into public.express_project_overrides
 (document_group,document_no,plot_codes,supplier_code,expected_total,evidence_url,evidence_scope,reviewed_by,status)
values
 ('PO_PL','PL0000976',array['CONDO-B'],'AP-0159',4387.0000,
  'https://drive.google.com/file/d/1UAcGqXrZo1ON4l5L3w5t6UhBIAMMlIzX/view',
  'Above Element Condo B, room B603, furniture headboard slat','owner-approved evidence review 2026-10-29','approved'),
 ('PO_PL','PL0000850',array['PROUD-CONDO-B'],'AP-0038',12091.0000,
  'https://drive.google.com/file/d/1Kc1PdbeGYCvvoteuB0BJx5TmDhUa_HeQ/view',
  'Proud Residence rooftop stair handrail, Building B','owner-approved evidence review 2026-10-29','approved')
on conflict(document_group,document_no) do nothing;

-- Effective overlay: preserves raw Express rows and survives new source CSV batches.
-- Source grain is unchanged: one header and its original line rows.
create or replace view public.express_register_effective_rows
with (security_invoker=true) as
select r.batch_id,r.document_group,r.document_no,r.line_seq,
 r.document_date,r.supplier,
 case when o.document_no is not null then o.plot_codes else r.plot_codes end as plot_codes,
 case when o.document_no is not null then 'VERIFIED_PROJECT_OVERRIDE' else r.qa_status end as qa_status,
 r.source_file,r.source_url,r.item_code,r.description,r.quantity,r.unit,
 r.unit_price,r.line_amount,r.grand_total,r.search_text,
 (o.document_no is not null) as has_verified_project_override,
 o.evidence_url as project_evidence_url
from public.express_register_rows r
left join public.express_register_rows h on h.batch_id=r.batch_id
  and h.document_group=r.document_group and h.document_no=r.document_no and h.line_seq=0
left join public.express_project_overrides o on
  o.document_group=r.document_group and o.document_no=r.document_no and o.status='approved'
  and cardinality(r.plot_codes)=0 and r.qa_status='HOLD_UNASSIGNED_PLOT'
  and position(o.supplier_code in coalesce(r.supplier,''))>0
  and h.grand_total=o.expected_total;
revoke all on public.express_register_effective_rows from public,anon;
grant select on public.express_register_effective_rows to authenticated,service_role;
-- No trigger or direct DML on public.express_register_rows; future re-imports retain override.
-- Pending PL0000973 and PO691027002 intentionally have no override until project proof.
