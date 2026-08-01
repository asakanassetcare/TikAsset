ALTER TABLE invoice_relation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_relation_items  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "relation_groups_read" ON invoice_relation_groups
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "relation_items_read" ON invoice_relation_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "relation_groups_insert" ON invoice_relation_groups
  FOR INSERT WITH CHECK (is_operational());

CREATE POLICY "relation_items_insert" ON invoice_relation_items
  FOR INSERT WITH CHECK (is_operational());
