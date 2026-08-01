CREATE TABLE IF NOT EXISTS invoice_relation_groups (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id             uuid REFERENCES contracts(id) ON DELETE CASCADE,
  created_from_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  created_by              uuid REFERENCES profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_relation_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES invoice_relation_groups(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, invoice_id),
  UNIQUE (invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_relation_groups_contract ON invoice_relation_groups(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoice_relation_items_group ON invoice_relation_items(group_id);
