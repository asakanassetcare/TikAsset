alter table invoices
  add column if not exists penalty_discount numeric(12,2) not null default 0,
  add column if not exists penalty_discount_note text;
