create table if not exists public.ingestion_audit_logs (
    id uuid primary key default gen_random_uuid (),
    ingestion_batch_id text not null,
    source_type text not null,
    source_version text not null,
    pipeline_version text not null,
    total_rows integer not null default 0,
    valid_rows integer not null default 0,
    invalid_rows integer not null default 0,
    duplicate_rows integer not null default 0,
    processing_duration_ms integer not null default 0,
    created_at timestamptz not null default timezone ('utc', now())
);

create index if not exists ingestion_audit_logs_batch_idx on public.ingestion_audit_logs (ingestion_batch_id);

create index if not exists ingestion_audit_logs_created_at_idx on public.ingestion_audit_logs (created_at desc);