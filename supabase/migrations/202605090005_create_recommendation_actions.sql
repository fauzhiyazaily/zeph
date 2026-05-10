create table if not exists public.recommendation_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  period_key text not null,
  action text not null,
  created_at timestamptz not null default now(),
  constraint uq_recommendation_action unique (user_id, category, period_key),
  constraint chk_recommendation_action check (action in ('accepted', 'dismissed'))
);

create index if not exists idx_recommendation_actions_user_period
  on public.recommendation_actions (user_id, period_key);

alter table public.recommendation_actions enable row level security;

drop policy if exists "Users can manage own recommendation actions" on public.recommendation_actions;
create policy "Users can manage own recommendation actions"
  on public.recommendation_actions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
