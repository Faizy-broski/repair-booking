-- Repair statuses are free text, defined per business (repair_custom_statuses,
-- see migration 064). Every revenue calculation in the app currently guesses
-- "is this job finished?" from the status text via a keyword heuristic — which
-- breaks for a business whose custom status literally named "Collected" means
-- "we collected the device FROM the customer" (intake), not "the customer
-- collected the finished device" (done).
--
-- This adds an explicit per-status flag so a business can say directly which
-- of its own statuses actually means "job finished," instead of guessing.
--
-- The backfill below preserves today's behavior exactly (same heuristic
-- get_profit_loss already uses) — nothing changes for anyone until they
-- explicitly edit a toggle in Settings.

ALTER TABLE repair_custom_statuses ADD COLUMN is_terminal BOOLEAN NOT NULL DEFAULT false;

UPDATE repair_custom_statuses
SET is_terminal = true
WHERE LOWER(TRIM(name)) IN ('repaired','collected','unrepairable','completed','done','fixed','closed','picked_up','handover')
   OR LOWER(TRIM(name)) LIKE '%complet%' OR LOWER(TRIM(name)) LIKE '%done%' OR LOWER(TRIM(name)) LIKE '%fixed%'
   OR LOWER(TRIM(name)) LIKE '%pick%'    OR LOWER(TRIM(name)) LIKE '%closed%' OR LOWER(TRIM(name)) LIKE '%resolv%'
   OR LOWER(TRIM(name)) LIKE '%finish%'  OR LOWER(TRIM(name)) LIKE '%collect%' OR LOWER(TRIM(name)) LIKE '%handover%';
