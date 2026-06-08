-- Migration 24: Add building_id to receipts for project filtering
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES buildings(id);
