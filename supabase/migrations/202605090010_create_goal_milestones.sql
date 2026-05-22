create table if not exists public.goal_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  milestone integer not null,
  progress_percent integer not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint chk_goal_milestone_value check (milestone in (25, 50, 75, 100)),
  constraint chk_goal_progress_percent check (progress_percent between 0 and 100),
  constraint uq_goal_milestone_once unique (user_id, goal_id, milestone)
);

create index if not exists idx_goal_milestones_user_created
  on public.goal_milestones (user_id, created_at desc);

alter table public.goal_milestones enable row level security;

drop policy if exists "Users can manage own goal milestones" on public.goal_milestones;
create policy "Users can manage own goal milestones"
  on public.goal_milestones
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
