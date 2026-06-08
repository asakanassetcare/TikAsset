-- =====================================================================
-- Migration 08: Booking → room status sync trigger
-- =====================================================================

-- When a booking is created (status='waiting') → room becomes 'reserved'
-- When booking is cancelled → room back to 'available'
-- (Conversion handled by contract flow — room stays reserved until approved)

create or replace function on_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- New booking (waiting) → reserve the room
  if tg_op = 'INSERT' and new.status = 'waiting' then
    update rooms set status = 'reserved' where id = new.room_id and status = 'available';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    -- Cancelled → free room (only if still reserved, not occupied)
    if new.status = 'cancelled' then
      update rooms set status = 'available'
        where id = new.room_id and status = 'reserved';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_booking_change on bookings;
create trigger trg_booking_change
  after insert or update on bookings
  for each row execute function on_booking_change();
