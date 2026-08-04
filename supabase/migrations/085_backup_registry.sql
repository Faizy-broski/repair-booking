-- Migration 085: Per-business backup registry
-- Tracks metadata for each daily JSON backup exported to Supabase Storage.
-- Only accessible via service_role (adminSupabase) — no tenant-facing RLS policy.

CREATE TABLE backup_registry (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  backup_date     DATE        NOT NULL,
  storage_path    TEXT        NOT NULL,
  size_bytes      BIGINT,
  record_counts   JSONB,
  schema_version  INT         NOT NULL DEFAULT 86,
  status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message   TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,

  UNIQUE (business_id, backup_date)
);

CREATE INDEX idx_backup_registry_date     ON backup_registry (backup_date DESC);
CREATE INDEX idx_backup_registry_business ON backup_registry (business_id, backup_date DESC);
CREATE INDEX idx_backup_registry_status   ON backup_registry (status) WHERE status IN ('pending', 'running');

-- Enable RLS with zero policies — blocks all anon/authenticated access.
-- adminSupabase (service_role key) bypasses RLS entirely.
ALTER TABLE backup_registry ENABLE ROW LEVEL SECURITY;
