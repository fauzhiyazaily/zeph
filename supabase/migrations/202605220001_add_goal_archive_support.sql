-- Add archived_at column to goals table for soft-delete archive support.
alter table public.goals
add column if not exists archived_at timestamptz;

-- Rebuild indexes to optimize active and archived goal reads.
drop index if exists idx_goals_user_deadline;

create index if not exists idx_goals_user_updated_archived on public.goals (
    user_id,
    updated_at desc,
    archived_at
);

create index if not exists idx_goals_user_archived on public.goals (user_id, archived_at);

-- Add archived_at consistency check only once.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_goals_archived_at'
  ) then
    alter table public.goals
      add constraint chk_goals_archived_at
      check (archived_at is null or archived_at <= now());

end if;

end $$;

-- Clarify archived_at semantics.
comment on column public.goals.archived_at is 'Timestamp when goal was archived; NULL if not archived';