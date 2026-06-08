-- Invoices fully covered by booking/advance deductions can have a net due of
-- zero while still carrying a pending payment review record for the original
-- slip. Make those invoices reviewable by accounting.

with item_totals as (
  select invoice_id, coalesce(sum(amount), 0) as net_amount
  from invoice_items
  group by invoice_id
)
update invoices i
set status = 'paid_pending_approve',
    subtotal = it.net_amount,
    total_amount = it.net_amount
from item_totals it
where it.invoice_id = i.id
  and i.status in ('pending', 'overdue')
  and it.net_amount <= 0
  and exists (
    select 1
    from payments p
    where p.invoice_id = i.id
      and p.status = 'pending_approve'
  );
