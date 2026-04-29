-- Matric Nejma 6 — Supabase one-time setup
-- Run this once in the Supabase SQL Editor (https://app.supabase.com → your project → SQL Editor).
-- After running it the admin panel can save posts and contact messages.

create table if not exists public.kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Service-role key bypasses RLS, but disabling RLS keeps things simple
-- and prevents accidental lockouts if the key is ever rotated.
alter table public.kv_store disable row level security;

-- Optional: an index on updated_at if you ever want to sort/inspect.
create index if not exists kv_store_updated_at_idx on public.kv_store (updated_at desc);
