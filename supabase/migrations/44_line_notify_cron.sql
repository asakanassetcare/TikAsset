-- LINE notification cron jobs
-- วันที่ 1 เวลา 08:00 BKK = 01:00 UTC → ส่งใบแจ้งหนี้
-- วันที่ 5 เวลา 08:00 BKK = 01:00 UTC → ส่งแจ้งเตือน
--
-- แทนที่ค่าด้านล่างก่อนรัน:
--   <PROJECT_REF>  = Supabase project reference (เช่น abcdefghijklmnop)
--   <ANON_KEY>     = Project API key (anon/public) จาก Project Settings → API

select cron.schedule(
  'line_notify_invoice_1st',
  '0 1 1 * *',
  $$
    select net.http_post(
      url     := 'https://jezhwipikfbyzccatixs.supabase.co/functions/v1/line-notify',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Implemh3aXBpa2ZieXpjY2F0aXhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4OTYyMTMsImV4cCI6MjA5NjQ3MjIxM30.6Z4CSmxdzR3iP1RC-gC2iyx5G00tHneWL5CNCI9lTs0"}'::text,
      body    := '{"type":"invoice"}'::text
    );
  $$
);

select cron.schedule(
  'line_notify_reminder_5th',
  '0 1 5 * *',
  $$
    select net.http_post(
      url     := 'https://jezhwipikfbyzccatixs.supabase.co/functions/v1/line-notify',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Implemh3aXBpa2ZieXpjY2F0aXhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4OTYyMTMsImV4cCI6MjA5NjQ3MjIxM30.6Z4CSmxdzR3iP1RC-gC2iyx5G00tHneWL5CNCI9lTs0"}'::text,
      body    := '{"type":"reminder"}'::text
    );
  $$
);
