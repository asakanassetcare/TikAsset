-- Migration 67: Telegram internal work notifications
--
-- This migration is intentionally small:
-- 1) keep a dedupe log so Telegram is not spammed for the same pending item
-- 2) schedule an internal notifier scan every 5 minutes
--
-- Required Supabase secrets before deploying the function:
--   TELEGRAM_BOT_TOKEN
--   TELEGRAM_STAFF_CHAT_ID
--   TELEGRAM_HEAD_STAFF_CHAT_ID
--   TELEGRAM_ACCOUNTING_CHAT_ID
--
-- Optional fallback:
--   TELEGRAM_ADMIN_CHAT_ID
--
-- The function is configured with verify_jwt = false in supabase/config.toml.
-- If you deploy it with JWT verification enabled, set app.settings.anon_key
-- first so the cron Authorization header below is valid.

create table if not exists telegram_notification_logs (
  dedupe_key text primary key,
  type text not null,
  ref_table text not null,
  ref_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_telegram_notification_logs_ref
  on telegram_notification_logs(ref_table, ref_id);

create index if not exists idx_telegram_notification_logs_created
  on telegram_notification_logs(created_at desc);

-- Avoid duplicate schedules if this file is re-run.
select cron.unschedule('telegram_internal_notifications')
where exists (
  select 1 from cron.job where jobname = 'telegram_internal_notifications'
);

select cron.schedule(
  'telegram_internal_notifications',
  '*/5 * * * *',
  $$
    select net.http_post(
      url     := 'https://jezhwipikfbyzccatixs.supabase.co/functions/v1/telegram-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.anon_key', true)
      ),
      body    := '{}'::jsonb
    );
  $$
);
