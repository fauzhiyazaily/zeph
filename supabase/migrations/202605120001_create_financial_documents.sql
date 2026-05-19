create table if not exists public.financial_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null default 'bank_statement',
  fingerprint text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  parse_status text not null default 'processing',
  parse_error text,
  bank_name text,
  account_holder_name text,
  account_number_masked text,
  currency text not null default 'INR',
  statement_period_start timestamptz,
  statement_period_end timestamptz,
  transaction_count integer not null default 0,
  imported_debit_count integer not null default 0,
  total_credits numeric(14, 2) not null default 0,
  total_debits numeric(14, 2) not null default 0,
  opening_balance numeric(14, 2),
  closing_balance numeric(14, 2),
  extracted_summary jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_financial_documents_user_fingerprint unique (user_id, fingerprint),
  constraint chk_financial_documents_type check (document_type in ('bank_statement')),
  constraint chk_financial_documents_status check (parse_status in ('processing', 'completed', 'failed'))
);

create table if not exists public.financial_document_transactions (
    id uuid primary key default gen_random_uuid (),
    document_id uuid not null references public.financial_documents (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    posted_at timestamptz not null,
    description text not null check (
        char_length(trim(description)) between 2 and 240
    ),
    amount numeric(14, 2) not null check (amount > 0),
    direction text not null check (
        direction in ('credit', 'debit')
    ),
    balance numeric(14, 2),
    reference text,
    category text,
    is_salary boolean not null default false,
    is_emi boolean not null default false,
    transaction_id uuid references public.transactions (id) on delete set null,
    created_at timestamptz not null default now()
);

alter table public.transactions
add column if not exists financial_document_id uuid references public.financial_documents (id) on delete cascade;

create index if not exists idx_financial_documents_user_created_at on public.financial_documents (user_id, created_at desc);

create index if not exists idx_financial_documents_user_status on public.financial_documents (
    user_id,
    parse_status,
    created_at desc
);

create index if not exists idx_financial_document_transactions_document_posted_at on public.financial_document_transactions (document_id, posted_at desc);

create index if not exists idx_financial_document_transactions_user_direction on public.financial_document_transactions (
    user_id,
    direction,
    posted_at desc
);

create index if not exists idx_transactions_financial_document_id on public.transactions (financial_document_id);

create or replace function public.set_financial_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_financial_documents_updated_at on public.financial_documents;

create trigger trg_financial_documents_updated_at
before update on public.financial_documents
for each row
execute function public.set_financial_documents_updated_at();

alter table public.financial_documents enable row level security;

alter table public.financial_document_transactions enable row level security;

drop policy if exists "Users can manage own financial documents" on public.financial_documents;

create policy "Users can manage own financial documents" on public.financial_documents for all to authenticated using (auth.uid () = user_id)
with
    check (auth.uid () = user_id);

drop policy if exists "Users can manage own financial document transactions" on public.financial_document_transactions;

create policy "Users can manage own financial document transactions" on public.financial_document_transactions for all to authenticated using (auth.uid () = user_id)
with
    check (auth.uid () = user_id);