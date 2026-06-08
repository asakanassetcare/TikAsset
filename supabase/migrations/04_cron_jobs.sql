-- =====================================================================
-- pg_cron SCHEDULES
-- =====================================================================
-- All times in UTC. Asia/Bangkok = UTC+7.
-- We want jobs to run at Thailand local times.
-- =====================================================================
-- Make sure pg_cron extension is enabled in Supabase Dashboard first:
-- Dashboard → Database → Extensions → enable "pg_cron".

-- Drop existing schedules if rerun
do $$
declare j record;
begin
  for j in select jobname from cron.job where jobname like 'condo_%' loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;

-- 1) Generate next-month invoices on the 25th at 02:00 Asia/Bangkok = 19:00 UTC (previous day)
--    pg_cron uses UTC. 02:00 BKK on day 25 = 19:00 UTC on day 24.
--    Using simple 0 19 24 * * works because pg_cron uses cron syntax.
--    To stay simple and bullet-proof we'll run at 03:00 UTC on day 25 (= 10:00 BKK day 25).
select cron.schedule(
  'condo_generate_invoices_25th',
  '0 3 25 * *',   -- 03:00 UTC = 10:00 BKK
  $$select public.generate_invoices_for_next_month();$$
);

-- 2) Mark overdue invoices daily at 01:00 BKK = 18:00 UTC previous day
select cron.schedule(
  'condo_mark_overdue_invoices',
  '0 18 * * *',
  $$select public.mark_overdue_invoices();$$
);

-- 3) Notify contracts expiring daily at 09:00 BKK = 02:00 UTC
select cron.schedule(
  'condo_notify_contracts_expiring',
  '0 2 * * *',
  $$select public.notify_contracts_expiring();$$
);

-- 4) Notify settlement overdue daily at 09:30 BKK = 02:30 UTC
select cron.schedule(
  'condo_notify_settlement_overdue',
  '30 2 * * *',
  $$select public.notify_settlement_overdue();$$
);

-- 5) Notify payment overdue daily at 09:15 BKK = 02:15 UTC
select cron.schedule(
  'condo_notify_payment_overdue',
  '15 2 * * *',
  $$select public.notify_payment_overdue();$$
);

-- check: select * from cron.job;
