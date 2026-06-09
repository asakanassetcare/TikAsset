-- Migration 86: Add tenant detail fields used by profile and contract screens
alter table tenants add column if not exists line_user_id text;
alter table tenants add column if not exists birth_date date;
alter table tenants add column if not exists address_house_no text;
alter table tenants add column if not exists address_road text;
alter table tenants add column if not exists address_subdistrict text;
alter table tenants add column if not exists address_district text;
alter table tenants add column if not exists address_province text;

create index if not exists idx_tenants_line_user_id on tenants(line_user_id);
