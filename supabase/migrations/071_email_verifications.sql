-- Email OTP verification table
-- Used to verify ownership of an email address during business onboarding
-- before any Supabase auth user or business row is created.

create table if not exists email_verifications (
  id            uuid        primary key default gen_random_uuid(),
  email         text        not null,
  otp_hash      text        not null,       -- HMAC-SHA256 of the OTP
  expires_at    timestamptz not null,       -- 15 minutes from creation
  verified_at   timestamptz,               -- set when OTP is accepted
  attempt_count smallint    not null default 0,  -- wrong-attempt counter
  created_at    timestamptz default now()
);

-- Lookup by email + recency (used by send-otp to enforce rate limit)
create index on email_verifications (email, created_at desc);

-- Service role only — no anon/tenant access
alter table email_verifications enable row level security;
-- (service role bypasses RLS; no policies needed)
