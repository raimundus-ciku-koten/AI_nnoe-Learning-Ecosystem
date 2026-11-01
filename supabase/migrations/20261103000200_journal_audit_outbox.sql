create table if not exists public.lesson_journal_audit_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  journal_id uuid,
  action text check (action is null or action in ('created', 'updated', 'deleted')),
  changed_fields text[] check (
    changed_fields is null or (
      cardinality(changed_fields) between 1 and 9
      and changed_fields <@ array[
      'tanggal', 'kelas', 'mapel', 'jam', 'materi', 'kegiatan',
      'kendala', 'tindakLanjut', 'status'
      ]::text[]
    )
  ),
  occurred_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'expired')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_retry_at timestamptz,
  delivered_at timestamptz,
  expired_at timestamptz,
  last_error_code text check (
    last_error_code is null or char_length(last_error_code) <= 80
  ),
  created_at timestamptz not null default now(),
  unique (user_id, event_id),
  check ((status = 'delivered') = (delivered_at is not null)),
  check ((status = 'expired') = (expired_at is not null)),
  check (
    (status = 'pending'
      and journal_id is not null
      and action is not null
      and changed_fields is not null
      and occurred_at is not null)
    or (status <> 'pending'
      and journal_id is null
      and action is null
      and changed_fields is null
      and occurred_at is null)
  )
);

create index if not exists lesson_journal_audit_pending_idx
  on public.lesson_journal_audit_outbox (next_retry_at, created_at)
  where status = 'pending';

create index if not exists lesson_journal_audit_retention_idx
  on public.lesson_journal_audit_outbox (created_at);

alter table public.lesson_journal_audit_outbox enable row level security;
revoke all on table public.lesson_journal_audit_outbox from public, anon, authenticated;
grant all on table public.lesson_journal_audit_outbox to service_role;
