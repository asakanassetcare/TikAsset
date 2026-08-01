-- bookings
CREATE INDEX IF NOT EXISTS idx_bookings_accounting_recorded_by  ON bookings(accounting_recorded_by);
CREATE INDEX IF NOT EXISTS idx_bookings_cancelled_by             ON bookings(cancelled_by);
CREATE INDEX IF NOT EXISTS idx_bookings_converted_to_contract_id ON bookings(converted_to_contract_id);
CREATE INDEX IF NOT EXISTS idx_bookings_created_by               ON bookings(created_by);
CREATE INDEX IF NOT EXISTS idx_bookings_head_approved_by         ON bookings(head_approved_by);
CREATE INDEX IF NOT EXISTS idx_bookings_head_rejected_by         ON bookings(head_rejected_by);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_recorded_by      ON bookings(payment_recorded_by);

-- contract_advance_payments
CREATE INDEX IF NOT EXISTS idx_cap_created_by ON contract_advance_payments(created_by);

-- contract_checklists
CREATE INDEX IF NOT EXISTS idx_contract_checklists_created_by ON contract_checklists(created_by);

-- contract_versions
CREATE INDEX IF NOT EXISTS idx_contract_versions_uploaded_by ON contract_versions(uploaded_by);

-- contracts
CREATE INDEX IF NOT EXISTS idx_contracts_approved_by          ON contracts(approved_by);
CREATE INDEX IF NOT EXISTS idx_contracts_booking_id           ON contracts(booking_id);
CREATE INDEX IF NOT EXISTS idx_contracts_cancelled_by         ON contracts(cancelled_by);
CREATE INDEX IF NOT EXISTS idx_contracts_created_by           ON contracts(created_by);
CREATE INDEX IF NOT EXISTS idx_contracts_previous_contract_id ON contracts(previous_contract_id);
CREATE INDEX IF NOT EXISTS idx_contracts_rejected_by          ON contracts(rejected_by);

-- documents
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);

-- invoice_relation_groups
CREATE INDEX IF NOT EXISTS idx_irg_created_by              ON invoice_relation_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_irg_created_from_invoice_id ON invoice_relation_groups(created_from_invoice_id);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_booking_id   ON invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_cancelled_by ON invoices(cancelled_by);

-- line_payment_submissions
CREATE INDEX IF NOT EXISTS idx_lps_invoice_id  ON line_payment_submissions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_lps_reviewed_by ON line_payment_submissions(reviewed_by);

-- maintenance_requests
CREATE INDEX IF NOT EXISTS idx_maintenance_completed_by ON maintenance_requests(completed_by);
CREATE INDEX IF NOT EXISTS idx_maintenance_reported_by  ON maintenance_requests(reported_by);

-- move_outs
CREATE INDEX IF NOT EXISTS idx_move_outs_approved_by ON move_outs(approved_by);
CREATE INDEX IF NOT EXISTS idx_move_outs_created_by  ON move_outs(created_by);
CREATE INDEX IF NOT EXISTS idx_move_outs_room_id     ON move_outs(room_id);
CREATE INDEX IF NOT EXISTS idx_move_outs_tenant_id   ON move_outs(tenant_id);

-- owner_transfers
CREATE INDEX IF NOT EXISTS idx_owner_transfers_confirmed_by   ON owner_transfers(confirmed_by);
CREATE INDEX IF NOT EXISTS idx_owner_transfers_contract_id    ON owner_transfers(contract_id);
CREATE INDEX IF NOT EXISTS idx_owner_transfers_created_by     ON owner_transfers(created_by);
CREATE INDEX IF NOT EXISTS idx_owner_transfers_invoice_id     ON owner_transfers(invoice_id);
CREATE INDEX IF NOT EXISTS idx_owner_transfers_transferred_by ON owner_transfers(transferred_by);

-- payments
CREATE INDEX IF NOT EXISTS idx_payments_accounting_recorded_by ON payments(accounting_recorded_by);
CREATE INDEX IF NOT EXISTS idx_payments_approved_by            ON payments(approved_by);
CREATE INDEX IF NOT EXISTS idx_payments_head_approved_by       ON payments(head_approved_by);
CREATE INDEX IF NOT EXISTS idx_payments_head_rejected_by       ON payments(head_rejected_by);

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_disabled_by ON profiles(disabled_by);

-- receipts
CREATE INDEX IF NOT EXISTS idx_receipts_building_id      ON receipts(building_id);
CREATE INDEX IF NOT EXISTS idx_receipts_head_approved_by ON receipts(head_approved_by);
CREATE INDEX IF NOT EXISTS idx_receipts_head_rejected_by ON receipts(head_rejected_by);
CREATE INDEX IF NOT EXISTS idx_receipts_issued_by        ON receipts(issued_by);

-- rent_advance_payments
CREATE INDEX IF NOT EXISTS idx_rap_accounting_recorded_by ON rent_advance_payments(accounting_recorded_by);
CREATE INDEX IF NOT EXISTS idx_rap_contract_id            ON rent_advance_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_rap_created_by             ON rent_advance_payments(created_by);
CREATE INDEX IF NOT EXISTS idx_rap_head_approved_by       ON rent_advance_payments(head_approved_by);
CREATE INDEX IF NOT EXISTS idx_rap_head_rejected_by       ON rent_advance_payments(head_rejected_by);
CREATE INDEX IF NOT EXISTS idx_rap_room_id                ON rent_advance_payments(room_id);
CREATE INDEX IF NOT EXISTS idx_rap_tenant_id              ON rent_advance_payments(tenant_id);

-- room_fingerprints
CREATE INDEX IF NOT EXISTS idx_room_fingerprints_created_by ON room_fingerprints(created_by);

-- rooms
CREATE INDEX IF NOT EXISTS idx_rooms_room_type_id ON rooms(room_type_id);

-- settings
CREATE INDEX IF NOT EXISTS idx_settings_updated_by ON settings(updated_by);

-- settlements
CREATE INDEX IF NOT EXISTS idx_settlements_confirmed_by     ON settlements(confirmed_by);
CREATE INDEX IF NOT EXISTS idx_settlements_head_approved_by ON settlements(head_approved_by);
CREATE INDEX IF NOT EXISTS idx_settlements_head_rejected_by ON settlements(head_rejected_by);
CREATE INDEX IF NOT EXISTS idx_settlements_paid_by_staff    ON settlements(paid_by_staff);

-- tenant_vehicles
CREATE INDEX IF NOT EXISTS idx_tenant_vehicles_created_by ON tenant_vehicles(created_by);
