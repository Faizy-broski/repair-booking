-- Adds a real completion timestamp for repairs, maintained by a trigger.
--
-- Every "completed this period" figure (get_profit_loss, the Repairs
-- dashboard's P&L-basis Revenue/Margin subtext, repairs/stats) has been
-- using repairs.updated_at as a stand-in for "when the job finished." That's
-- fragile: ANY edit to a long-finished job (a note, a discount tweak, a
-- deposit top-up) bumps updated_at and makes the job look like it completed
-- today, and a job that finished weeks ago but hasn't been touched since
-- keeps whatever updated_at it had at that time — both cases drift away from
-- the actual completion date.
--
-- completed_at is set once, the moment a repair's status transitions from
-- non-terminal to terminal (per-business repair_custom_statuses.is_terminal,
-- migration 156/157 — statuses are free text, defined per business), and
-- cleared if the job is reopened. It's maintained centrally by a trigger
-- rather than in every application code path that can change repairs.status
-- (the update_repair_status RPC, direct RepairService.update, and
-- already-terminal repairs created via data import).

ALTER TABLE repairs ADD COLUMN completed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION set_repair_completed_at()
RETURNS TRIGGER AS $$
DECLARE
  v_business_id UUID;
  v_was_terminal BOOLEAN := false;
  v_is_terminal  BOOLEAN := false;
BEGIN
  SELECT business_id INTO v_business_id FROM branches WHERE id = NEW.branch_id;

  SELECT COALESCE(rcs.is_terminal, false) INTO v_is_terminal
  FROM repair_custom_statuses rcs
  WHERE rcs.business_id = v_business_id
    AND LOWER(TRIM(rcs.name)) = LOWER(TRIM(NEW.status));

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(rcs.is_terminal, false) INTO v_was_terminal
    FROM repair_custom_statuses rcs
    WHERE rcs.business_id = v_business_id
      AND LOWER(TRIM(rcs.name)) = LOWER(TRIM(OLD.status));
  END IF;

  IF v_is_terminal AND NOT v_was_terminal THEN
    NEW.completed_at := NOW();
  ELSIF NOT v_is_terminal AND v_was_terminal THEN
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_repairs_completed_at
BEFORE INSERT OR UPDATE ON repairs
FOR EACH ROW EXECUTE FUNCTION set_repair_completed_at();

-- Backfill: currently-terminal repairs keep reporting exactly what they do
-- today (updated_at was the completion-date proxy every report already
-- used), so seed completed_at from updated_at instead of leaving it NULL.
--
-- repairs already has an unconditional "set_updated_at_repairs" trigger
-- (migration 003) that stamps updated_at = NOW() on every UPDATE. Left
-- enabled, this backfill would silently bump updated_at — the very column
-- it's reading from — on every terminal repair as a side effect. Disable it
-- for just this statement so the backfill is a pure, inert data copy.
ALTER TABLE repairs DISABLE TRIGGER set_updated_at_repairs;

UPDATE repairs r
SET completed_at = r.updated_at
WHERE r.completed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM repair_custom_statuses rcs
    JOIN branches b ON b.id = r.branch_id
    WHERE rcs.business_id = b.business_id
      AND rcs.is_terminal
      AND LOWER(TRIM(rcs.name)) = LOWER(TRIM(r.status))
  );

ALTER TABLE repairs ENABLE TRIGGER set_updated_at_repairs;
