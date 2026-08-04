-- ============================================================================
-- 175 — repairs: new columns
-- All columns are nullable and additive — existing rows/behaviour are unaffected.
--
-- Two unrelated additions bundled in one migration:
--   1. created_by — GENERAL PURPOSE, applies to every vertical. Stamps which
--      staff member booked/created the job (distinct from assigned_to, the
--      technician dispatched to do it). Not tyre-specific in any way.
--   2. vehicle_id / tyre_size / tyre_quantity / tyre_quality / location_notes /
--      scheduled_start / scheduled_end — Mobile Tyre Fitting vertical only.
--      Reuses the repairs table as the "job" entity for that vertical instead
--      of a parallel table, per job_number/status/assigned_to/payments/
--      invoice-linkage/activity-log plumbing already in place.
-- ============================================================================

ALTER TABLE repairs
  ADD COLUMN IF NOT EXISTS vehicle_id      UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tyre_size       TEXT,
  ADD COLUMN IF NOT EXISTS tyre_quantity   INT,
  ADD COLUMN IF NOT EXISTS tyre_quality    TEXT,
  ADD COLUMN IF NOT EXISTS location_notes  TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_end   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN repairs.vehicle_id IS 'Mobile tyre fitting vertical: the vehicle this job was booked against.';
COMMENT ON COLUMN repairs.tyre_size IS 'Mobile tyre fitting vertical: tyre size fitted, e.g. 205/55R16.';
COMMENT ON COLUMN repairs.tyre_quantity IS 'Mobile tyre fitting vertical: number of tyres fitted on this job.';
COMMENT ON COLUMN repairs.tyre_quality IS 'Mobile tyre fitting vertical: tyre brand/quality tier (e.g. Budget/Mid-range/Premium), free text.';
COMMENT ON COLUMN repairs.location_notes IS 'Mobile tyre fitting vertical: free-text description of where the vehicle is stranded (e.g. motorway/junction).';
COMMENT ON COLUMN repairs.scheduled_start IS 'Mobile tyre fitting vertical: dispatch slot start — the time the assigned fitter is booked to attend.';
COMMENT ON COLUMN repairs.scheduled_end IS 'Mobile tyre fitting vertical: dispatch slot end.';
COMMENT ON COLUMN repairs.created_by IS 'The staff member (profiles.id) who booked/created this job — distinct from assigned_to, the technician dispatched to do it.';

CREATE INDEX IF NOT EXISTS idx_repairs_vehicle_id ON repairs(vehicle_id);

-- Supports the per-fitter double-booking (soft warning) conflict check:
-- overlapping scheduled_start/scheduled_end for the same assigned_to.
CREATE INDEX IF NOT EXISTS idx_repairs_scheduled_window
  ON repairs(assigned_to, scheduled_start, scheduled_end)
  WHERE assigned_to IS NOT NULL AND scheduled_start IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_repairs_created_by ON repairs(created_by);
