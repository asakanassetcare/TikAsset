-- แจ้งเตือนสัญญาใกล้หมด ทุกวัน 08:00 BKK = 01:00 UTC
-- ส่ง 30 วันก่อนหมด และ 7 วันก่อนหมด

select cron.schedule(
  'line_notify_contract_expiry_30d',
  '0 1 * * *',
  $$
    select net.http_post(
      url     := 'https://jezhwipikfbyzccatixs.supabase.co/functions/v1/line-notify',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Implemh3aXBpa2ZieXpjY2F0aXhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4OTYyMTMsImV4cCI6MjA5NjQ3MjIxM30.6Z4CSmxdzR3iP1RC-gC2iyx5G00tHneWL5CNCI9lTs0"}'::text,
      body    := '{"type":"contract_expiry","days_before":30}'::text
    );
  $$
);

select cron.schedule(
  'line_notify_contract_expiry_7d',
  '0 1 * * *',
  $$
    select net.http_post(
      url     := 'https://jezhwipikfbyzccatixs.supabase.co/functions/v1/line-notify',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Implemh3aXBpa2ZieXpjY2F0aXhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4OTYyMTMsImV4cCI6MjA5NjQ3MjIxM30.6Z4CSmxdzR3iP1RC-gC2iyx5G00tHneWL5CNCI9lTs0"}'::text,
      body    := '{"type":"contract_expiry","days_before":7}'::text
    );
  $$
);
