-- Migration 26: Add draft status to move_out_status enum
ALTER TYPE move_out_status ADD VALUE IF NOT EXISTS 'draft' BEFORE 'pending_accounting';
