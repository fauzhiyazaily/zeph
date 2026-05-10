alter table public.transactions
  add column if not exists ai_raw_classification text,
  add column if not exists ai_raw_reason text,
  add column if not exists ai_user_classification text,
  add column if not exists ai_user_reason text,
  add column if not exists ai_review_state text not null default 'pending',
  add column if not exists ai_override_at timestamptz;

alter table public.transactions
  drop constraint if exists chk_transactions_ai_raw_classification;

alter table public.transactions
  add constraint chk_transactions_ai_raw_classification
  check (
    ai_raw_classification is null
    or ai_raw_classification in ('wise', 'useless')
  );

alter table public.transactions
  drop constraint if exists chk_transactions_ai_user_classification;

alter table public.transactions
  add constraint chk_transactions_ai_user_classification
  check (
    ai_user_classification is null
    or ai_user_classification in ('wise', 'useless')
  );

alter table public.transactions
  drop constraint if exists chk_transactions_ai_raw_reason_length;

alter table public.transactions
  add constraint chk_transactions_ai_raw_reason_length
  check (
    ai_raw_reason is null
    or char_length(trim(ai_raw_reason)) between 8 and 240
  );

alter table public.transactions
  drop constraint if exists chk_transactions_ai_user_reason_length;

alter table public.transactions
  add constraint chk_transactions_ai_user_reason_length
  check (
    ai_user_reason is null
    or char_length(trim(ai_user_reason)) between 8 and 240
  );

alter table public.transactions
  drop constraint if exists chk_transactions_ai_review_state;

alter table public.transactions
  add constraint chk_transactions_ai_review_state
  check (ai_review_state in ('pending', 'accepted', 'overridden'));

create index if not exists idx_transactions_user_ai_review_state_date
  on public.transactions (user_id, ai_review_state, date desc);
