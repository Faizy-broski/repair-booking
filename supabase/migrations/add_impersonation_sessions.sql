create table if not exists impersonation_sessions (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id) on delete cascade,
  target_user_id uuid not null,
  created_by     uuid not null,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  ip_address     text
);

create index if not exists impersonation_sessions_pending_idx
  on impersonation_sessions(id)
  where used_at is null;
