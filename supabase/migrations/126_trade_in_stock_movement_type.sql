-- Migration 126: Allow 'trade_in' as a stock_movements.type value.
--
-- Trade-ins/buybacks add stock back into inventory (a customer sells a
-- device to the business), but stock_movements.type's CHECK constraint
-- (migration 001_initial_schema.sql) never included 'trade_in' as an
-- allowed value — TradeInService.create() is being wired to log one via
-- this migration + an app-layer fix, so the constraint needs widening
-- first. Purely additive: existing rows/values are untouched.

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_type_check
  CHECK (type IN ('sale','adjustment','repair_used','return','transfer','purchase','trade_in'));
