-- Migration 79: align overdue status with the 5-day payment grace period.
-- Due on day 1 means penalty/overdue starts on day 6.

CREATE OR REPLACE FUNCTION mark_overdue_invoices()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE invoices
     SET status = 'pending'
   WHERE status = 'overdue'
     AND due_date + interval '4 days' >= current_date
     AND total_amount > 0;

  UPDATE invoices
     SET status = 'overdue'
   WHERE status = 'pending'
     AND due_date + interval '4 days' < current_date
     AND total_amount > 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
