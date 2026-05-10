create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(12, 2) not null,
  current_amount numeric(12, 2) not null default 0,
  deadline date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_goals_name_length check (char_length(trim(name)) between 2 and 120),
  constraint chk_goals_target_positive check (target_amount > 0),
  constraint chk_goals_current_nonnegative check (current_amount >= 0),
  constraint chk_goals_notes_length check (notes is null or char_length(notes) <= 500)
);

create index if not exists idx_goals_user_deadline
  on public.goals (user_id, deadline);

alter table public.goals enable row level security;

drop policy if exists "Users can manage own goals" on public.goals;
create policy "Users can manage own goals"
  on public.goals
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
