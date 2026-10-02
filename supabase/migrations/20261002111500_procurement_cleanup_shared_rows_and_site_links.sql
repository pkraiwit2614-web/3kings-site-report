begin;

-- Restore site links that are explicit in the purchasing source labels.
update public.procurement_items
set project_id = (select id from public.projects where code = 'MIRAGE')
where po_no = 'PL0000917' or item_name ilike '%PL0000917%';

insert into public.procurement_item_projects(procurement_item_id, project_id)
select pi.id, p.id
from public.procurement_items pi
join public.projects p on p.code = 'MIRAGE'
where pi.po_no = 'PL0000917' or pi.item_name ilike '%PL0000917%'
on conflict do nothing;

update public.procurement_items
set project_id = (select id from public.projects where code = 'CONDO-A')
where po_no = 'PL0000927' or item_name ilike '%PL0000927%';

insert into public.procurement_item_projects(procurement_item_id, project_id)
select pi.id, p.id
from public.procurement_items pi
join public.projects p on p.code = 'CONDO-A'
where pi.po_no = 'PL0000927' or pi.item_name ilike '%PL0000927%'
on conflict do nothing;

-- Keep PL0000915 as one shared item linked to both Plot 6 and Plot 7.
with target as (
  select id from public.procurement_items
  where po_no = 'PL0000915' or item_name ilike '%PL0000915%'
  order by source_row nulls last, id
  limit 1
)
insert into public.procurement_item_projects(procurement_item_id, project_id)
select target.id, p.id
from target
join public.projects p on p.code in ('AV-P6','AV-P7')
on conflict do nothing;

update public.procurement_items
set project_id = null
where po_no = 'PL0000915' or item_name ilike '%PL0000915%';

-- Door stopper PR is one combined quantity for Plot 6 + Plot 8.
do $$
declare
  v_keep uuid;
begin
  select id into v_keep
  from public.procurement_items
  where item_name ilike 'PR Door stopper PT-103%'
  order by source_row nulls last, id
  limit 1;

  if v_keep is not null then
    insert into public.procurement_item_projects(procurement_item_id, project_id)
    select v_keep, p.id
    from public.projects p
    where p.code in ('AV-P6','AV-P8')
    on conflict do nothing;

    update public.procurement_items
    set project_id = null
    where id = v_keep;

    delete from public.procurement_items
    where item_name ilike 'PR Door stopper PT-103%'
      and id <> v_keep;
  end if;
end $$;

-- A4400 receipt is one combined quantity for Plot 6 + Plot 7 + Plot 8.
do $$
declare
  v_keep uuid;
begin
  select id into v_keep
  from public.procurement_items
  where item_name ilike 'PR American Standard A4400%'
  order by source_row nulls last, id
  limit 1;

  if v_keep is not null then
    insert into public.procurement_item_projects(procurement_item_id, project_id)
    select v_keep, p.id
    from public.projects p
    where p.code in ('AV-P6','AV-P7','AV-P8')
    on conflict do nothing;

    update public.procurement_items
    set project_id = null
    where id = v_keep;

    delete from public.procurement_items
    where item_name ilike 'PR American Standard A4400%'
      and id <> v_keep;
  end if;
end $$;

commit;
