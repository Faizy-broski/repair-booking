-- Migration 086: Private Supabase Storage bucket for per-business JSON backups
-- No public access, no RLS policies = service_role only.
-- 50 MB per-file limit; files are gzip-compressed JSON (typically 1–15 MB each).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-backups',
  'business-backups',
  false,
  52428800,  -- 50 MB max per file
  ARRAY['application/gzip', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Zero storage policies = only the service_role key (adminSupabase) can read/write.
-- Do NOT add an INSERT/SELECT policy here — backups must never be publicly readable.
