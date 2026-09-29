create or replace function public.procurement_autofill_po_no()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_match text[];
begin
  if nullif(trim(coalesce(new.po_no,'')),'') is null then
    v_match := regexp_match(coalesce(new.item_name,''), '(PL[0-9]+)', 'i');
    if v_match is not null and array_length(v_match,1) >= 1 then
      new.po_no := upper(v_match[1]);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_procurement_autofill_po_no on public.procurement_items;
create trigger trg_procurement_autofill_po_no
before insert or update of item_name, po_no on public.procurement_items
for each row
execute function public.procurement_autofill_po_no();
