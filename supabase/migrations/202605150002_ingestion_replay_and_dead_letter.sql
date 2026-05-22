alter table if exists public.ingestion_audit_logs
add column if not exists replayed_at timestamptz,
add column if not exists replay_source_batch_id text,
add column if not exists replay_pipeline_version text,
add column if not exists linked_transaction_id uuid;

create index if not exists ingestion_audit_logs_replay_source_idx on public.ingestion_audit_logs (replay_source_batch_id);

create index if not exists ingestion_audit_logs_linked_transaction_idx on public.ingestion_audit_logs (linked_transaction_id);

alter table if exists public.transactions
add column if not exists ingestion_batch_id text,
add column if not exists ingestion_fingerprint text;

create index if not exists transactions_ingestion_batch_idx on public.transactions (ingestion_batch_id);

create index if not exists transactions_ingestion_fingerprint_idx on public.transactions (ingestion_fingerprint);

create table if not exists public.failed_ingestion_records (
    id uuid primary key default gen_random_uuid (),
    user_id uuid,
    ingestion_batch_id text not null,
    source_type text not null,
    source_version text not null,
    reason text not null,
    retryable boolean not null default false,
    route text not null,
    payload jsonb not null,
    recorded_at timestamptz not null default timezone ('utc', now())
);

create index if not exists failed_ingestion_records_batch_idx on public.failed_ingestion_records (ingestion_batch_id);

create index if not exists failed_ingestion_records_recorded_at_idx on public.failed_ingestion_records (recorded_at desc);