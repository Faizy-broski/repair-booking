-- Migration 186: Trade-in cash payouts weren't tracked against the register.
--
-- The standalone Trade-Ins page (Inventory > Trade-Ins) pays a customer cash
-- for their used device and correctly updates inventory/stock_movements/cost
-- layers, but never recorded that cash leaving the till — unlike the POS's
-- own Cash Out -> Buyback flow (record_cash_movement, migration 133), which
-- does. Any shop using the standalone page for trade-ins would see Expected
-- Cash silently overstate reality by the payout amount at close-out.
--
-- TradeInService.create() will now insert a cash_movements row directly
-- (type='cash_out', purpose='trade_in') against the branch's open register
-- session, once one exists — this just needs 'trade_in' added to the allowed
-- purpose values; no other RPC/table changes are needed since the read side
-- (register_session_expected / close_register_session) already sums ANY
-- cash_out row via v_cash_out regardless of purpose.

ALTER TABLE cash_movements DROP CONSTRAINT IF EXISTS cash_movements_purpose_check;
ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_purpose_check
  CHECK (purpose IN ('plain', 'expense', 'buyback', 'trade_in'));
