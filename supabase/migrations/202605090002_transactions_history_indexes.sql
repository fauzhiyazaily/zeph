create extension if not exists pg_trgm;

create index if not exists idx_transactions_user_source_date
  on public.transactions (user_id, source, date desc);

create index if not exists idx_transactions_user_category_date
  on public.transactions (user_id, category, date desc);

create index if not exists idx_transactions_merchant_trgm
  on public.transactions
  using gin (merchant gin_trgm_ops);

create index if not exists idx_transactions_reference_trgm
  on public.transactions
  using gin (reference gin_trgm_ops);
