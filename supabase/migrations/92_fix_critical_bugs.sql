-- Fix 1: Enable RLS on telegram_notification_logs
ALTER TABLE telegram_notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tnl_read_staff ON telegram_notification_logs;
CREATE POLICY tnl_read_staff ON telegram_notification_logs
  FOR SELECT TO authenticated
  USING (is_staff_or_above() OR is_accounting());

-- Fix 2a: line_payment_submissions - restrict overly broad policy
DROP POLICY IF EXISTS "service role full access" ON line_payment_submissions;

DROP POLICY IF EXISTS lps_select ON line_payment_submissions;
CREATE POLICY lps_select ON line_payment_submissions
  FOR SELECT TO authenticated
  USING (is_staff_or_above() OR is_accounting());

DROP POLICY IF EXISTS lps_update ON line_payment_submissions;
CREATE POLICY lps_update ON line_payment_submissions
  FOR UPDATE TO authenticated
  USING (is_staff_or_above() OR is_accounting())
  WITH CHECK (is_staff_or_above() OR is_accounting());

DROP POLICY IF EXISTS lps_delete ON line_payment_submissions;
CREATE POLICY lps_delete ON line_payment_submissions
  FOR DELETE TO authenticated
  USING (is_super_admin());

-- Fix 2b: receipts - restrict overly broad policies
DROP POLICY IF EXISTS receipts_insert ON receipts;
CREATE POLICY receipts_insert ON receipts
  FOR INSERT TO authenticated
  WITH CHECK (is_staff_or_above() OR is_accounting());

DROP POLICY IF EXISTS receipts_update ON receipts;
CREATE POLICY receipts_update ON receipts
  FOR UPDATE TO authenticated
  USING (is_staff_or_above() OR is_accounting())
  WITH CHECK (is_staff_or_above() OR is_accounting());

-- Fix 4: Cron notification functions — use >= N with idempotency guard
CREATE OR REPLACE FUNCTION public.notify_payment_overdue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv record;
  v_grace int := 3;
  v_count int := 0;
BEGIN
  SELECT COALESCE((value->>'overdue_alert_days')::int, 3) INTO v_grace
    FROM settings WHERE key = 'notification';

  FOR v_inv IN
    SELECT i.id, i.invoice_number, i.due_date, c.assigned_staff_id, r.room_number
    FROM invoices i
    JOIN contracts c ON c.id = i.contract_id
    JOIN rooms r ON r.id = i.room_id
    WHERE i.status = 'overdue'
      AND current_date - i.due_date >= v_grace
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.ref_table = 'invoices'
          AND n.ref_id    = i.id
          AND n.type      = 'payment_overdue'
      )
  LOOP
    PERFORM notify_user(v_inv.assigned_staff_id, 'payment_overdue',
      format('เกินกำหนดชำระ: ห้อง %s', v_inv.room_number),
      format('ใบแจ้งหนี้ %s ครบกำหนด %s', v_inv.invoice_number,
             to_char(v_inv.due_date,'DD/MM/YYYY')),
      'invoices', v_inv.id, null);
    PERFORM notify_role('head_staff', 'payment_overdue',
      format('เกินกำหนดชำระ: ห้อง %s', v_inv.room_number),
      v_inv.invoice_number, 'invoices', v_inv.id, null);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION public.notify_contracts_expiring()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_days int := 30;
  v_contract record;
  v_count int := 0;
BEGIN
  SELECT COALESCE((value->>'contract_expiring_days')::int, 30) INTO v_days
    FROM settings WHERE key = 'notification';

  FOR v_contract IN
    SELECT c.id, c.contract_number, c.assigned_staff_id, c.contract_end_date,
           r.room_number
    FROM contracts c
    JOIN rooms r ON r.id = c.room_id
    WHERE c.status = 'active'
      AND c.contract_end_date - current_date <= v_days
      AND c.contract_end_date >= current_date
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.ref_table = 'contracts'
          AND n.ref_id    = c.id
          AND n.type      = 'contract_expiring'
      )
  LOOP
    PERFORM notify_user(v_contract.assigned_staff_id, 'contract_expiring',
      format('สัญญาใกล้หมด: ห้อง %s', v_contract.room_number),
      format('สัญญา %s หมดวันที่ %s', v_contract.contract_number,
             to_char(v_contract.contract_end_date,'DD/MM/YYYY')),
      'contracts', v_contract.id, null);
    PERFORM notify_role('head_staff', 'contract_expiring',
      format('สัญญาใกล้หมด: ห้อง %s', v_contract.room_number),
      v_contract.contract_number, 'contracts', v_contract.id, null);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION public.notify_settlement_overdue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mo record;
  v_count int := 0;
BEGIN
  FOR v_mo IN
    SELECT mo.id, mo.move_out_number, mo.settlement_deadline
    FROM move_outs mo
    JOIN settlements s ON s.move_out_id = mo.id
    WHERE mo.status = 'approved'
      AND s.status = 'pending'
      AND mo.settlement_deadline <= current_date
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.ref_table = 'move_outs'
          AND n.ref_id    = mo.id
          AND n.type      = 'settlement_overdue'
      )
  LOOP
    PERFORM notify_role('accounting', 'settlement_overdue',
      'เคลียร์เงินคืนครบ 15 วัน: ' || v_mo.move_out_number,
      'ต้องดำเนินการคืนเงินภายในวันนี้', 'move_outs', v_mo.id, null);
    PERFORM notify_role('head_staff', 'settlement_overdue',
      'เคลียร์เงินคืนครบ 15 วัน: ' || v_mo.move_out_number,
      null, 'move_outs', v_mo.id, null);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END
$function$;
