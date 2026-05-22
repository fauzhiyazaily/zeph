-- Migration: governance_snapshot_logs
-- Persists periodic ingestion governance snapshots for trend analysis,
-- SLO compliance reporting, and deployment gate pre-checks.

create table if not exists public.governance_snapshot_logs (
  id                         uuid        primary key default gen_random_uuid(),
  snapshot_at                timestamptz not null default timezone('utc', now()),
  pipeline_success_rate      numeric     not null,
  replay_success_rate        numeric     not null default 0,
  fingerprint_collision_count int        not null default 0,
  dead_letter_count          int         not null default 0,
  duplicate_detection_rate   numeric     not null default 0,
  batch_failure_rate         numeric     not null default 0,
  high_duplicate_rate        boolean     not null default false,
  high_invalid_rate          boolean     not null default false,
  collision_spike            boolean     not null default false,
  overall_severity           text        not null default 'info'
                               check (overall_severity in ('info', 'warning', 'critical')),
  anomaly_count              int         not null default 0,
  governance_pass            boolean     not null default true,
  slo_violations             jsonb       not null default '[]'::jsonb,
  recorded_by                uuid        references auth.users (id) on delete set null
);

create index if not exists governance_snapshot_logs_snapshot_at_idx on public.governance_snapshot_logs (snapshot_at desc);

create index if not exists governance_snapshot_logs_governance_pass_idx on public.governance_snapshot_logs (
    governance_pass,
    snapshot_at desc
);

-- Row-level security: only authenticated users in the same tenant can read;
-- only service-role can insert (server-side only).
alter table public.governance_snapshot_logs enable row level security;

create policy "governance_snapshots_select_authenticated" on public.governance_snapshot_logs for
select using (
        auth.role () = 'authenticated'
    );