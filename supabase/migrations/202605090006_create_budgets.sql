create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  month text not null,
  amount_limit numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_budget_user_category_month unique (user_id, category, month),
  constraint chk_budget_amount_positive check (amount_limit > 0),
  constraint chk_budget_month_format check (month ~ '^\d{4}-\d{2}$'),
  constraint chk_budget_category_nonempty check (length(trim(category)) > 0)
);

create index if not exists idx_budgets_user_month
  on public.budgets (user_id, month);

alter table public.budgets enable row level security;

drop policy if exists "Users can manage own budgets" on public.budgets;
create policy "Users can manage own budgets"
  on public.budgets
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
