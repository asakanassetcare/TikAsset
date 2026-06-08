-- =====================================================================
-- SEED DATA — Phase 1
-- =====================================================================

-- =====================================================================
-- SETTINGS (key-value)
-- =====================================================================
insert into settings(key, value) values
  ('company', jsonb_build_object(
    'name', 'บริษัท คอนโด เรนทัล จำกัด',
    'tax_id', '',
    'address', '',
    'phone', '',
    'logo_url', ''
  )),
  ('invoice', jsonb_build_object(
    'prefix', 'INV',
    'footer_note', 'ขอบคุณที่ใช้บริการ',
    'bank_account', jsonb_build_object(
      'bank_name', '',
      'account_number', '',
      'account_name', ''
    )
  )),
  ('contract', jsonb_build_object(
    'default_deposit_months', 2,
    'default_advance_months', 1,
    'default_payment_day', 1
  )),
  ('late_fee', jsonb_build_object(
    'enabled', false,
    'percent', 5,
    'grace_days', 7
  )),
  ('final_settlement', jsonb_build_object(
    'deadline_days', 15
  )),
  ('notification', jsonb_build_object(
    'contract_expiring_days', 30,
    'overdue_alert_days', 3
  )),
  ('pdf', jsonb_build_object(
    'font_family', 'Sarabun',
    'language', 'th',
    'paper_size', 'A4'
  ))
on conflict (key) do nothing;

-- =====================================================================
-- ROOM TYPES (default options)
-- =====================================================================
insert into room_types(name, description, default_size_sqm) values
  ('Studio', 'ห้องสตูดิโอ ห้องเดียว', 28),
  ('1BR', 'ห้องนอน 1 ห้อง', 35),
  ('2BR', 'ห้องนอน 2 ห้อง', 55),
  ('3BR', 'ห้องนอน 3 ห้อง', 80)
on conflict (name) do nothing;
