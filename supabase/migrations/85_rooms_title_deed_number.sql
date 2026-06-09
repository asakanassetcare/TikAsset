-- Migration 85: Add optional title deed number for rooms
alter table rooms add column if not exists title_deed_number text;
