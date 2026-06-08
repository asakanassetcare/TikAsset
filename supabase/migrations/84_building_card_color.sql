-- Migration 84: Add optional display color for building cards
alter table buildings add column if not exists card_color text;
