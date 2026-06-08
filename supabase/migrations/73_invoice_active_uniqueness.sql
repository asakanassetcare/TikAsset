-- Migration 73: replace broad invoice uniqueness with active-invoice indexes.
-- The original constraint included cancelled rows for monthly invoices, which
-- blocked reissuing a new invoice for the same period. It also did not protect
-- contract_initial rows because billing_period is NULL.

DO $$
DECLARE
  v_dupe_paid_count int;
BEGIN
  -- Keep one active period invoice per contract/period/type before adding the
  -- partial unique index. Prefer paid rows, then the newest row.
  WITH ranked AS (
    SELECT id,
           status,
           ROW_NUMBER() OVER (
             PARTITION BY contract_id, billing_period, invoice_type
             ORDER BY (status = 'paid') DESC, created_at DESC, id DESC
           ) AS rn
      FROM invoices
     WHERE contract_id IS NOT NULL
       AND billing_period IS NOT NULL
       AND status NOT IN ('cancelled', 'rejected')
  )
  UPDATE invoices i
     SET status = 'cancelled',
         cancelled_at = COALESCE(i.cancelled_at, now()),
         cancellation_reason = COALESCE(i.cancellation_reason, 'Cancelled duplicate before active invoice uniqueness migration')
    FROM ranked r
   WHERE i.id = r.id
     AND r.rn > 1
     AND r.status <> 'paid';

  -- Same cleanup for contract_initial, where billing_period is NULL and the old
  -- unique constraint did not prevent duplicates.
  WITH ranked AS (
    SELECT id,
           status,
           ROW_NUMBER() OVER (
             PARTITION BY contract_id, invoice_type
             ORDER BY (status = 'paid') DESC, created_at DESC, id DESC
           ) AS rn
      FROM invoices
     WHERE contract_id IS NOT NULL
       AND invoice_type = 'contract_initial'
       AND billing_period IS NULL
       AND status NOT IN ('cancelled', 'rejected')
  )
  UPDATE invoices i
     SET status = 'cancelled',
         cancelled_at = COALESCE(i.cancelled_at, now()),
         cancellation_reason = COALESCE(i.cancellation_reason, 'Cancelled duplicate before active invoice uniqueness migration')
    FROM ranked r
   WHERE i.id = r.id
     AND r.rn > 1
     AND r.status <> 'paid';

  SELECT COUNT(*)
    INTO v_dupe_paid_count
    FROM (
      SELECT contract_id, billing_period, invoice_type
        FROM invoices
       WHERE contract_id IS NOT NULL
         AND billing_period IS NOT NULL
         AND status NOT IN ('cancelled', 'rejected')
       GROUP BY contract_id, billing_period, invoice_type
      HAVING COUNT(*) > 1
      UNION ALL
      SELECT contract_id, NULL::text AS billing_period, invoice_type
        FROM invoices
       WHERE contract_id IS NOT NULL
         AND invoice_type = 'contract_initial'
         AND billing_period IS NULL
         AND status NOT IN ('cancelled', 'rejected')
       GROUP BY contract_id, invoice_type
      HAVING COUNT(*) > 1
    ) dupes;

  IF v_dupe_paid_count > 0 THEN
    RAISE EXCEPTION 'Active invoice duplicates still exist; review paid duplicate invoices before adding uniqueness indexes';
  END IF;
END
$$;

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_contract_id_billing_period_invoice_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_active_period_type
  ON invoices(contract_id, billing_period, invoice_type)
  WHERE contract_id IS NOT NULL
    AND billing_period IS NOT NULL
    AND status NOT IN ('cancelled', 'rejected');

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_active_contract_initial
  ON invoices(contract_id, invoice_type)
  WHERE contract_id IS NOT NULL
    AND invoice_type = 'contract_initial'
    AND billing_period IS NULL
    AND status NOT IN ('cancelled', 'rejected');
