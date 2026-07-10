-- Secure Notepad — Supabase schema (zero-knowledge, RLS-enforced).
--
-- Run this in the Supabase SQL Editor (or `supabase db push`). Users are
-- handled by Supabase Auth (auth.users); we NEVER store passwords ourselves.
-- Every row here is either ciphertext or wrapped key material — useless without
-- the user's master password, which never reaches the server.

-- ── Envelope key material: one row per user ──────────────────────────────────
create table if not exists public.user_keys (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  kdf_salt      text        not null,   -- base64 Argon2id salt (unique per user)
  encrypted_dek text        not null,   -- base64 DEK encrypted with the Master Key
  dek_nonce     text        not null,   -- base64 nonce for the DEK encryption
  kdf_ops_limit integer     not null,   -- Argon2id iterations used at creation
  kdf_mem_limit integer     not null,   -- Argon2id memory cost (KiB) used at creation
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Notes: ciphertext only ───────────────────────────────────────────────────
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  ciphertext text        not null,      -- base64 AES-256-GCM ciphertext of {title, body}
  nonce      text        not null,      -- base64 unique 12-byte nonce per note
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_updated_idx
  on public.notes (user_id, updated_at desc);

-- ── Row-Level Security: users can only ever touch their own rows ──────────────
alter table public.user_keys enable row level security;
alter table public.notes     enable row level security;

drop policy if exists "own keys only"  on public.user_keys;
drop policy if exists "own notes only" on public.notes;

create policy "own keys only" on public.user_keys
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own notes only" on public.notes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Keep updated_at fresh on UPDATE ──────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_keys_set_updated_at on public.user_keys;
drop trigger if exists notes_set_updated_at     on public.notes;

create trigger user_keys_set_updated_at
  before update on public.user_keys
  for each row execute function public.set_updated_at();

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();
