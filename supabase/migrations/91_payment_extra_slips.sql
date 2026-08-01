ALTER TABLE payments ADD COLUMN IF NOT EXISTS extra_slips text[];
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extra_slips text[];
