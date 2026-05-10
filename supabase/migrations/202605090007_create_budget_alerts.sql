create table if not exists public.budget_alert_preferences (
    user_id uuid primary key references auth.users (id) on delete cascade,
    alert_75_enabled boolean not null default true,
    alert_100_enabled boolean not null default true,
    in_app_enabled boolean not null default true,
    push_enabled boolean not null default true,
    email_enabled boolean not null default false,
    updated_at timestamptz not null default now()
);

create table if not exists public.budget_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  month text not null,
  threshold integer not null,
  spent_amount numeric(12, 2) not null,
  budget_limit numeric(12, 2) not null,
  channels jsonb not null default '{}'::jsonb,
  message text not null,
  created_at timestamptz not null default now(),
  constraint chk_budget_alert_threshold check (threshold in (75, 100)),
  constraint chk_budget_alert_month_format check (month ~ '^\d{4}-\d{2}$'),
  constraint uq_budget_alert_threshold_once unique (user_id, budget_id, month, threshold)
);

create index if not exists idx_budget_alerts_user_created on public.budget_alerts (user_id, created_at desc);

create index if not exists idx_budget_alerts_user_month on public.budget_alerts (user_id, month);

alter table public.budget_alert_preferences enable row level security;

alter table public.budget_alerts enable row level security;

drop policy if exists "Users can manage own budget alert preferences" on public.budget_alert_preferences;

create policy "Users can manage own budget alert preferences" on public.budget_alert_preferences for all to authenticated using (auth.uid () = user_id)
with
    check (auth.uid () = user_id);

drop policy if exists "Users can manage own budget alerts" on public.budget_alerts;

create policy "Users can manage own budget alerts" on public.budget_alerts for all to authenticated using (auth.uid () = user_id)
with
    check (auth.uid () = user_id);