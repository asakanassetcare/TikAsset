-- สร้างฟังก์ชันใหม่ generate เดือนปัจจุบัน
create or replace function generate_invoices_for_current_month()
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_period text;
  v_contract record;
  v_count int := 0;
  v_inv uuid;
begin
  v_period := to_char(current_date, 'YYYY-MM');
  for v_contract in
    select id from contracts where status = 'active'
  loop
    v_inv := generate_monthly_invoice(v_contract.id, v_period);
    if v_inv is not null then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end $$;

-- ยกเลิก cron เดิม (วันที่ 25)
select cron.unschedule('condo_generate_invoices_25th');

-- เพิ่ม cron ใหม่ (วันที่ 1 เวลา 00:00 UTC = 07:00 BKK)
select cron.schedule(
  'condo_generate_invoices_1st',
  '0 0 1 * *',
  $$select public.generate_invoices_for_current_month();$$
);
