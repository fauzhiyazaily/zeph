create table if not exists public.user_income_preferences (
    user_id uuid primary key references auth.users (id) on delete cascade,
    balance_target numeric(12, 2) null default null,
    updated_at timestamptz not null default now()
);

alter table public.user_income_preferences enable row level security;

drop policy if exists "Users can manage own income preferences" on public.user_income_preferences;

create policy "Users can manage own income preferences" on public.user_income_preferences for all to authenticated using (auth.uid () = user_id)
with
    check (auth.uid () = user_id);