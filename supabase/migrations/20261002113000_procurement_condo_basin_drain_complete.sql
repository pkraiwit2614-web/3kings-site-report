begin;

with target as (
  select id
  from public.procurement_items
  where item_name ilike '%สะดืออ่างล้างหน้า%'
    and coalesce(vendor,'') ilike '%บ้านสุขภัณฑ์%'
  order by updated_at desc
  limit 1
)
update public.procurement_items pi
set project_id = null,
    procurement_status = 'รับสินค้าแล้ว / ติดตั้งเรียบร้อย',
    current_status = 'รับสินค้าแล้ว / ติดตั้งเรียบร้อย / ปิดติดตาม',
    expected_delivery_text = 'ของมาครบและติดตั้งเรียบร้อยแล้ว',
    expected_delivery = null,
    condition_note = 'สำหรับ Above Condo A และ Above Condo B • ยืนยัน 02/10/2569: ของมาครบทั้งหมดและติดตั้งเรียบร้อยแล้ว',
    source_updated_at = date '2026-10-02',
    updated_at = now()
from target
where pi.id = target.id;

with target as (
  select id
  from public.procurement_items
  where item_name ilike '%สะดืออ่างล้างหน้า%'
    and coalesce(vendor,'') ilike '%บ้านสุขภัณฑ์%'
  order by updated_at desc
  limit 1
)
delete from public.procurement_item_projects pip
using target
where pip.procurement_item_id = target.id;

with target as (
  select id
  from public.procurement_items
  where item_name ilike '%สะดืออ่างล้างหน้า%'
    and coalesce(vendor,'') ilike '%บ้านสุขภัณฑ์%'
  order by updated_at desc
  limit 1
)
insert into public.procurement_item_projects(procurement_item_id, project_id)
select target.id, p.id
from target
join public.projects p on p.code in ('CONDO-A','CONDO-B')
on conflict do nothing;

commit;
