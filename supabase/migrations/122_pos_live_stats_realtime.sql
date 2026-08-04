-- Migration 122: Enable Supabase Realtime for the tables backing the POS
-- live session stats row (Net/Product/Repair/Credit Sales, Cash In/Out).
--
-- Without this the postgres_changes subscriptions in pos/page.tsx
-- (useRealtime on 'sales', 'repairs', 'cash_movements') emit zero events —
-- same root cause as migration 060 for the messages/chat feature — so the
-- stats only ever update via the 30s polling fallback, appearing to
-- "need a reload" instead of updating live.

ALTER PUBLICATION supabase_realtime ADD TABLE sales;
ALTER PUBLICATION supabase_realtime ADD TABLE repairs;
ALTER PUBLICATION supabase_realtime ADD TABLE cash_movements;

-- REPLICA IDENTITY FULL needed since these subscriptions filter by
-- branch_id (a non-primary-key column) and also listen for UPDATE events.
ALTER TABLE sales REPLICA IDENTITY FULL;
ALTER TABLE repairs REPLICA IDENTITY FULL;
ALTER TABLE cash_movements REPLICA IDENTITY FULL;
