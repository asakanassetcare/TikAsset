-- Migration 18: Add preferred schedule dates to maintenance requests
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS preferred_start_date  date,
  ADD COLUMN IF NOT EXISTS preferred_due_date     date;
