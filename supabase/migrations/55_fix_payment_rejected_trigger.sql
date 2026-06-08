-- Remove incorrect "rejected → cancelled" logic from payment trigger.
-- When a payment is rejected, the invoice should return to pending/overdue
-- (handled by the frontend) so the tenant can re-submit. Setting invoice
-- to 'cancelled' was wrong per actual business requirements.
create or replace function on_payment_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv invoices%rowtype;
  v_total_paid numeric(12,2);
begin
  if new.status = 'approved' and (old.status is null or old.status <> 'approved') then
    select * into v_inv from invoices where id = new.invoice_id;
    select coalesce(sum(amount),0) into v_total_paid
      from payments where invoice_id = new.invoice_id and status = 'approved';

    if v_total_paid >= v_inv.total_amount then
      update invoices set status = 'paid' where id = new.invoice_id;
    else
      raise exception 'Partial payment not allowed. Invoice total: %, paid: %',
        v_inv.total_amount, v_total_paid;
    end if;
  end if;

  return new;
end $$;
