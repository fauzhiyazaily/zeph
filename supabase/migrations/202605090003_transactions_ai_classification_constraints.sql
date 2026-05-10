alter table public.transactions
  drop constraint if exists chk_transactions_ai_classification;

alter table public.transactions
  add constraint chk_transactions_ai_classification
  check (
    ai_classification is null
    or ai_classification in ('wise', 'useless')
  );

alter table public.transactions
  drop constraint if exists chk_transactions_ai_reason_length;

alter table public.transactions
  add constraint chk_transactions_ai_reason_length
  check (
    ai_reason is null
    or char_length(trim(ai_reason)) between 8 and 240
  );

create index if not exists idx_transactions_user_ai_classification_date
  on public.transactions (user_id, ai_classification, date desc);
