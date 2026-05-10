create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ingestion_id text not null,
  amount numeric(12, 2) not null check (amount > 0),
  merchant text not null check (char_length(trim(merchant)) between 2 and 120),
  source text not null check (source in ('upi', 'card', 'wallet', 'bank', 'unknown')),
  reference text,
  date timestamptz not null,
  category text,
  ai_classification text,
  ai_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_transactions_user_ingestion unique (user_id, ingestion_id)
);

create index if not exists idx_transactions_user_date
  on public.transactions (user_id, date desc);

create index if not exists idx_transactions_user_merchant
  on public.transactions (user_id, merchant);

create or replace function public.set_transactions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at
before update on public.transactions
for each row
execute function public.set_transactions_updated_at();

alter table public.transactions enable row level security;

drop policy if exists "Users can insert own transactions" on public.transactions;
create policy "Users can insert own transactions"
  on public.transactions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can view own transactions" on public.transactions;
create policy "Users can view own transactions"
  on public.transactions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can update own transactions" on public.transactions;
create policy "Users can update own transactions"
  on public.transactions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
