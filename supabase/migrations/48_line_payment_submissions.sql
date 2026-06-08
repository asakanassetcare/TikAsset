create table if not exists line_payment_submissions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete set null,
  line_user_id  text not null,
  slip_url      text,
  note          text,
  status        text not null default 'pending'
                  check (status in ('pending','linked','rejected')),
  invoice_id    uuid references invoices(id) on delete set null,
  reviewed_by   uuid references profiles(id) on delete set null,
  reviewed_at   timestamptz,
  reject_reason text,
  created_at    timestamptz not null default now()
);

alter table line_payment_submissions enable row level security;

create policy "service role full access" on line_payment_submissions
  using (true) with check (true);

create index on line_payment_submissions (status, created_at desc);
create index on line_payment_submissions (tenant_id);
