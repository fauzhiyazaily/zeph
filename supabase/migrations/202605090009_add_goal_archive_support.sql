-- Add archived_at column to goals table for soft-delete archive support
alter table public.goals
  add column archived_at timestamptz;

-- Drop old index and create a new one optimized for archive filtering
drop index if exists idx_goals_user_deadline;

create index if not exists idx_goals_user_updated_archived
  on public.goals (user_id, updated_at desc, archived_at);

create index if not exists idx_goals_user_archived
  on public.goals (user_id, archived_at);

-- Add constraint to ensure archived_at reflects goal status
alter table public.goals
  add constraint chk_goals_archived_at check (
    archived_at is null or archived_at <= now()
  );

-- Add comment for clarity
comment on column public.goals.archived_at is 'Timestamp when goal was archived; NULL if not archived';
