-- Migration 69: Add is_active to projects and buildings
alter table projects add column if not exists is_active boolean not null default true;
alter table buildings add column if not exists is_active boolean not null default true;
