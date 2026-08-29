-- ============================================================================
-- register_expected_cash.test.sql
--
-- Automated regression check for the POS register cash/stats functions:
--   register_session_expected()  -- live "Expected Cash" tile
--   close_register_session()     -- final Z-report on register close
--
-- WHAT THIS TESTS
-- Every stat tile the POS register bar shows (Product/Card/Store-credit/
-- Loyalty/Credit sales, Repair Sales, Refunds, Credit Repaid, Cash In/Out,
-- Buyback, Expected Cash) across realistic scenarios: plain cash/card sales,
-- split cash+credit deposits, split cash+card sales, cash vs. non-cash
-- refunds, repair deposits/top-ups/collections, repair refunds (both via the
-- POS refund screen and via a direct status change in the Repairs module,
-- including a mixed cash+card deposit to check the refund's cash portion is
-- capped correctly), same-day credit repayments, and manual cash movements.
-- It also checks that the live preview (register_session_expected) and the
-- final close-out figure (close_register_session) always agree — the exact
-- class of bug found and fixed in migrations 172/173, and again in 184.
--
-- Group E (migrations 185/186/187) covers the "Total" figure correctly netting
-- product refunds, and confirms Expected Cash reacts correctly to any
-- properly-typed cash_movements row regardless of what wrote it — the read
-- side both the gift-card-cash-sale fix (GiftCardService.create) and the
-- trade-in-cash-payout fix (TradeInService.create) now rely on.
--
-- Group F (migration 188) is a CRITICAL regression check for a live,
-- user-reproduced bug: process_refund() used to always negate the caller's
-- `total`, so a caller sending a POSITIVE total (src/app/(tenant)/sales/
-- page.tsx's inline refund modal) got its refund stored with a NEGATIVE
-- sales.total, making Expected Cash INCREASE on a cash refund instead of
-- decrease. Unlike every other group, this one calls process_refund()
-- directly rather than inserting a synthetic sales row, since the bug lives
-- in the RPC's sign-handling.
--
-- Group F's F4/F5 checks (migration 191) cover a second, separate live bug:
-- "Refund Amount" mode on the Sales page always failed with "Cannot refund
-- more than remaining quantity" against a REAL original sale, because its
-- fabricated item name ("<name> (amount refund)") never matched the
-- original sale_items row. F1-F3 didn't set original_sale_id, so they never
-- exercised that guard at all.
--
-- Group G (migration 189) checks that a split-tender sale's card (and any
-- other non-cash) leg is correctly broken out into card_sales/other_sales
-- instead of being lumped entirely into other_sales.
--
-- Group I (migration 201) covers a live, user-reported Riseteck bug: a
-- split-tender sale (cash+card) refunded in full only reduced whichever
-- single payment_method the refund row carried -- the other leg vanished
-- from Expected Cash entirely, not just from a display tile (unlike Group
-- G's sales-side version of this bug, migration 194, where Expected Cash was
-- already correct and only the Cash Sales tile was wrong). Calls
-- process_refund() directly, like Group F, since the fix spans both the
-- RPC's INSERT (storing payment_splits on a refund row at all) and the
-- register formula's leg-recovery query.
--
-- Group H (migration 190) is an EXPLICIT BUSINESS DECISION, not a bug fix:
-- card payments (sales, refunds, split-tender card legs, repair card
-- deposits/refunds) are now merged into Expected Cash itself, and closing
-- takes a new p_closing_card_total alongside p_closing_cash. This changed
-- what several PRE-EXISTING assertions in Groups A and B must expect — a
-- card sale/refund used to correctly leave Expected Cash unchanged; now it
-- must correctly move it. Those specific assertions (A2, A5, A7, and B4c's
-- mixed cash+card repair deposit/refund) were rewritten in place rather than
-- left stale, since leaving them asserting the old (now wrong) behavior
-- would make the suite fail against materially correct new behavior. Group
-- G's split-tender sale (G5/G6) was rewritten the same way.
--
-- SAFETY — READ BEFORE RUNNING
-- This script NEVER commits anything. It opens with BEGIN and closes with
-- ROLLBACK, and every check inside runs in a DO block with its own
-- EXCEPTION handler, so even an unexpected SQL error is caught and recorded
-- as a failure instead of aborting the transaction. Nothing is thrown to the
-- client — results are written to a temp table and printed as a summary,
-- so the script always completes cleanly and always rolls back, whether
-- every check passes or several fail. It is safe to run against a real
-- database, including production, because nothing it does is ever kept.
--
-- That said:
--   - Run it over a DIRECT/session connection (psql on port 5432, or
--     Supabase's "direct connection" string), NOT the pooled connection
--     (port 6543 / PgBouncer transaction mode). A pooled connection can
--     behave unpredictably with an explicit multi-statement transaction.
--   - Try it on a staging/test project first. Only run against production
--     once you've confirmed it behaves as expected on staging.
--   - Run the whole file as ONE script (e.g. `psql "$DIRECT_DATABASE_URL"
--     -f supabase/tests/register_expected_cash.test.sql`, or paste the
--     entire file into the Supabase SQL editor and run it all at once).
--     Do not run statements one at a time — that defeats the transaction
--     wrapper and could leave test rows or a stuck transaction behind.
--
-- Note on timestamps: everything below runs inside ONE transaction, and
-- Postgres's NOW() is frozen to the transaction's start time for the whole
-- transaction (not wall-clock time) — so we can't rely on DEFAULT NOW() or
-- pg_sleep() to create realistic "this happened after that" orderings. All
-- session/sale/payment timestamps below are instead assigned explicitly
-- from a simulated clock (v_clock) that starts an hour before the frozen
-- NOW() and advances a little before each insert, so every row still lands
-- safely inside the "<= NOW()" window the functions filter on.
--
-- Note on the branch: register_sessions has a DATABASE-LEVEL constraint
-- (migration 099, register_sessions_branch_open_unique) allowing at most ONE
-- open session per branch at a time. Reusing a real, currently-in-use branch
-- here could collide with an actual cashier's live register and fail this
-- script outright. To avoid that entirely, this script creates its OWN
-- throwaway branch inside the transaction (rolled back at the end, never
-- visible to anyone) -- you only need to supply a real business_id and a
-- real cashier_id.
--
-- HOW TO RUN
-- 1. Fill in the two UUIDs below (business_id, cashier_id) -- use IDs from
--    a real business already in the target Supabase project. A dedicated
--    test/staging business is strongly preferred. cashier_id must be a real
--    profiles.id (profiles.id is a hard FK to auth.users, so it can't be
--    fabricated inside this script).
-- 2. Run the whole file in one go, per the safety notes above.
-- 3. Read the NOTICE output at the end -- it prints one line per check
--    (PASS/FAIL, expected vs. actual) and a final summary line.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _test_config (
  business_id UUID,
  cashier_id  UUID
);
INSERT INTO _test_config (business_id, cashier_id) VALUES (
  '00000000-0000-0000-0000-000000000000',  -- <-- FILL IN: business_id
  '00000000-0000-0000-0000-000000000000'   -- <-- FILL IN: cashier_id (profiles.id)
);

CREATE TEMP TABLE _test_results (
  seq      SERIAL,
  label    TEXT,
  status   TEXT,
  expected NUMERIC,
  actual   NUMERIC
);

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(p_label TEXT, p_actual NUMERIC, p_expected NUMERIC)
RETURNS VOID LANGUAGE plpgsql AS $fn$
BEGIN
  IF abs(COALESCE(p_actual, 0) - p_expected) <= 0.01 THEN
    INSERT INTO _test_results (label, status, expected, actual) VALUES (p_label, 'PASS', p_expected, p_actual);
  ELSE
    INSERT INTO _test_results (label, status, expected, actual) VALUES (p_label, 'FAIL', p_expected, p_actual);
  END IF;
END;
$fn$;

DO $$
DECLARE
  v_business_id  UUID;
  v_branch_id    UUID;
  v_cashier_id   UUID;
  v_customer_id  UUID;

  v_session_id   UUID;
  v_preview      JSONB;
  v_close        JSONB;

  v_repair1_id    UUID;
  v_repair2_id    UUID;
  v_repair3_id    UUID;
  v_repair4_id    UUID;
  v_repair5_id    UUID;
  v_repair6_id    UUID;
  v_sale_id       UUID;
  v_prior_sale_id UUID;
  v_refund_id     UUID;
  v_refund_row    RECORD;

  v_exp    NUMERIC;       -- running expected value of Expected Cash for the current session
  v_clock  TIMESTAMPTZ;   -- simulated clock, see "Note on timestamps" above
BEGIN
  v_clock := now() - interval '1 hour';

  SELECT business_id, cashier_id
  INTO v_business_id, v_cashier_id
  FROM _test_config;

  IF v_business_id = '00000000-0000-0000-0000-000000000000'
     OR v_cashier_id = '00000000-0000-0000-0000-000000000000' THEN
    INSERT INTO _test_results (label, status, expected, actual)
    VALUES ('CONFIG', 'FAIL', NULL, NULL);
    RAISE NOTICE 'Fill in _test_config with real business_id/cashier_id before running this script.';
    RETURN;
  END IF;

  -- Throwaway branch, scoped to this transaction only -- see the header note
  -- on why we never reuse a real branch (avoids colliding with a real open
  -- register session, which is a DB-level uniqueness constraint).
  INSERT INTO branches (business_id, name, is_active)
  VALUES (v_business_id, 'TEST-SCRIPT branch (rolled back, never persisted)', true)
  RETURNING id INTO v_branch_id;

  INSERT INTO customers (business_id, branch_id, first_name, last_name)
  VALUES (v_business_id, v_branch_id, 'TEST-SCRIPT', 'DoNotSave')
  RETURNING id INTO v_customer_id;

  -- Each scenario group below runs in its OWN nested BEGIN/EXCEPTION block.
  -- PL/pgSQL rolls back to the savepoint at the start of whichever block
  -- catches an error -- if all four groups shared one block, an error in
  -- Group D would silently wipe out the PASS/FAIL rows already recorded for
  -- A/B/C too. Isolating each group means one broken scenario can't hide
  -- the results of the others.

  -- ==========================================================================
  -- GROUP A: Product sale tender types + refunds (QA doc §2, §3)
  -- ==========================================================================
  BEGIN
  v_clock := v_clock + interval '1 second';
  INSERT INTO register_sessions (business_id, branch_id, cashier_id, opening_float, status, opened_at)
  VALUES (v_business_id, v_branch_id, v_cashier_id, 100, 'open', v_clock)
  RETURNING id INTO v_session_id;
  v_exp := 100;

  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('A0 Opening float baseline: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §2.1 cash sale, 50
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 50, 50, 'cash', 'paid', false, 50, '[]'::jsonb, v_clock);
  v_exp := v_exp + 50;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('A1 Cash sale: cash_sales', (v_preview->>'cash_sales')::numeric, 50);
  PERFORM pg_temp.assert_eq('A1 Cash sale: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §2.2 card sale, 40 -- now moves Expected Cash too (migration 190: card
  -- payments are merged into Expected Cash by explicit business decision).
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 40, 40, 'card', 'paid', false, 40, '[]'::jsonb, v_clock);
  v_exp := v_exp + 40;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('A2 Card sale: card_sales', (v_preview->>'card_sales')::numeric, 40);
  PERFORM pg_temp.assert_eq('A2 Card sale: expected_cash includes card (migration 190 fix)', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §2.3 store_credit + loyalty_points sales -- must NOT move Expected Cash
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 20, 20, 'store_credit', 'paid', false, 20, '[]'::jsonb, v_clock);
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 15, 15, 'loyalty_points', 'paid', false, 15, '[]'::jsonb, v_clock);
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('A3 Store credit sale: store_credit_sales', (v_preview->>'store_credit_sales')::numeric, 20);
  PERFORM pg_temp.assert_eq('A3 Loyalty points sale: loyalty_points_sales', (v_preview->>'loyalty_points_sales')::numeric, 15);
  PERFORM pg_temp.assert_eq('A3 Non-cash tenders: expected_cash unchanged', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §2.4 on_account sale, total 100, 50 cash deposit (the client's exact bug #2 scenario)
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 100, 100, 'on_account', 'partial', false, 50, '[{"method":"cash","amount":50}]'::jsonb, v_clock);
  v_exp := v_exp + 50;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('A4 On-account 50/50 deposit: on_account_sales', (v_preview->>'on_account_sales')::numeric, 50);
  PERFORM pg_temp.assert_eq('A4 On-account 50/50 deposit: split_tender_cash', (v_preview->>'split_tender_cash')::numeric, 50);
  PERFORM pg_temp.assert_eq('A4 On-account 50/50 deposit: expected_cash (bug #2 check)', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §2.5 split cash+card sale, total 80, 50 cash / 30 card, fully paid (no
  -- credit) -- both legs now move Expected Cash (migration 190).
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 80, 80, 'split', 'paid', false, 80, '[{"method":"cash","amount":50},{"method":"card","amount":30}]'::jsonb, v_clock);
  v_exp := v_exp + 50 + 30;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('A5 Split cash+card sale: split_tender_cash cumulative', (v_preview->>'split_tender_cash')::numeric, 100);
  PERFORM pg_temp.assert_eq('A5 Split cash+card sale: split_tender_card cumulative', (v_preview->>'split_tender_card')::numeric, 30);
  PERFORM pg_temp.assert_eq('A5 Split cash+card sale: expected_cash includes both legs (migration 190 fix)', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §3.1 cash refund, 50
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 50, 50, 'cash', 'refunded', true, 0, '[]'::jsonb, v_clock);
  v_exp := v_exp - 50;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('A6 Cash refund: total_refunds', (v_preview->>'total_refunds')::numeric, 50);
  PERFORM pg_temp.assert_eq('A6 Cash refund: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §3.1b card refund, 30 -- now DOES reduce Expected Cash too (migration
  -- 190: card is merged in, so its refunds must symmetrically subtract).
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 30, 30, 'card', 'refunded', true, 0, '[]'::jsonb, v_clock);
  v_exp := v_exp - 30;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('A7 Card refund: total_refunds cumulative', (v_preview->>'total_refunds')::numeric, 80);
  PERFORM pg_temp.assert_eq('A7 Card refund: card_refunds', (v_preview->>'card_refunds')::numeric, 30);
  PERFORM pg_temp.assert_eq('A7 Card refund: expected_cash decreases (migration 190 fix)', (v_preview->>'expected_cash')::numeric, v_exp);

  -- Close-out parity: close_register_session must return the same expected_cash
  -- as the live preview, and counting exactly that amount must give variance 0.
  v_close := close_register_session(v_session_id, v_exp, NULL);
  PERFORM pg_temp.assert_eq('A8 Close parity: expected_cash matches live preview', (v_close->>'expected_cash')::numeric, v_exp);
  PERFORM pg_temp.assert_eq('A8 Close parity: variance is zero', (v_close->>'variance')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _test_results (label, status, expected, actual)
    VALUES ('GROUP A UNEXPECTED ERROR: ' || SQLERRM, 'FAIL', NULL, NULL);
  END;

  -- ==========================================================================
  -- GROUP B: Repairs (QA doc §4)
  -- ==========================================================================
  BEGIN
  v_clock := v_clock + interval '1 second';
  INSERT INTO register_sessions (business_id, branch_id, cashier_id, opening_float, status, opened_at)
  VALUES (v_business_id, v_branch_id, v_cashier_id, 0, 'open', v_clock)
  RETURNING id INTO v_session_id;
  v_exp := 0;

  -- §4.1 repair deposit only, via repair_payments ledger (not through POS), cash 50
  INSERT INTO repairs (branch_id, customer_id, job_number, estimated_cost, deposit_paid)
  VALUES (v_branch_id, v_customer_id, 'TEST-JOB-1', 200, 50)
  RETURNING id INTO v_repair1_id;
  v_clock := v_clock + interval '1 second';
  INSERT INTO repair_payments (business_id, repair_id, customer_id, amount, method, created_at)
  VALUES (v_business_id, v_repair1_id, v_customer_id, 50, 'cash', v_clock);
  v_exp := v_exp + 50;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('B1 Repair deposit-only: repair_sales', (v_preview->>'repair_sales')::numeric, 50);
  PERFORM pg_temp.assert_eq('B1 Repair deposit-only: total_sales unaffected', (v_preview->>'total_sales')::numeric, 0);
  PERFORM pg_temp.assert_eq('B1 Repair deposit-only: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §4.2 repair fully checked out via POS in ONE sale (parts+labor), 120 cash -- regression: must not double count into Product Sales
  INSERT INTO repairs (branch_id, customer_id, job_number, estimated_cost, actual_cost)
  VALUES (v_branch_id, v_customer_id, 'TEST-JOB-2', 120, 120)
  RETURNING id INTO v_repair2_id;
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 120, 120, 'cash', 'paid', false, 120, '[]'::jsonb, v_clock)
  RETURNING id INTO v_sale_id;
  INSERT INTO sale_items (sale_id, repair_id, name, quantity, unit_price, total)
  VALUES (v_sale_id, v_repair2_id, 'Repair job 2 (parts+labor)', 1, 120, 120);
  v_exp := v_exp + 120;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('B2 Repair-via-POS: repair_sales cumulative', (v_preview->>'repair_sales')::numeric, 170);
  PERFORM pg_temp.assert_eq('B2 Repair-via-POS: total_sales stays 0 (no double count)', (v_preview->>'total_sales')::numeric, 0);
  PERFORM pg_temp.assert_eq('B2 Repair-via-POS: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §4.3 mixed checkout: repair (80) + unrelated retail item (20) in ONE sale, cash
  INSERT INTO repairs (branch_id, customer_id, job_number, estimated_cost, actual_cost)
  VALUES (v_branch_id, v_customer_id, 'TEST-JOB-3', 80, 80)
  RETURNING id INTO v_repair3_id;
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 100, 100, 'cash', 'paid', false, 100, '[]'::jsonb, v_clock)
  RETURNING id INTO v_sale_id;
  INSERT INTO sale_items (sale_id, repair_id, name, quantity, unit_price, total)
  VALUES (v_sale_id, v_repair3_id, 'Repair job 3', 1, 80, 80);
  INSERT INTO sale_items (sale_id, repair_id, name, quantity, unit_price, total)
  VALUES (v_sale_id, NULL, 'Unrelated retail item', 1, 20, 20);
  v_exp := v_exp + 100;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('B3 Mixed repair+retail sale: repair_sales cumulative', (v_preview->>'repair_sales')::numeric, 250);
  PERFORM pg_temp.assert_eq('B3 Mixed repair+retail sale: total_sales (retail-only portion)', (v_preview->>'total_sales')::numeric, 20);
  PERFORM pg_temp.assert_eq('B3 Mixed repair+retail sale: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §4.4 repair marked "Collected" directly in Repairs module (deposit already collected earlier, not this session)
  INSERT INTO repairs (branch_id, customer_id, job_number, estimated_cost, actual_cost, deposit_paid)
  VALUES (v_branch_id, v_customer_id, 'TEST-JOB-4', 150, 150, 50)
  RETURNING id INTO v_repair4_id;
  v_clock := v_clock + interval '1 second';
  INSERT INTO repair_status_history (repair_id, old_status, new_status, created_at)
  VALUES (v_repair4_id, 'in_progress', 'collected', v_clock);
  -- expected_cash unaffected -- pickup collections carry no tender data
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('B4 Collected elsewhere: repair_sales adds remaining balance', (v_preview->>'repair_sales')::numeric, 350);
  PERFORM pg_temp.assert_eq('B4 Collected elsewhere: expected_cash unaffected (no tender data)', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §4.4b repair REFUNDED directly in the Repairs module (not via POS refund
  -- screen), with a cash deposit paid via repair_payments this session --
  -- regression coverage for migration 184 (the bug found while investigating
  -- the RiseTeck Aug-19 report: repairs.refund_amount was set but the cash
  -- portion was never subtracted from Expected Cash).
  INSERT INTO repairs (branch_id, customer_id, job_number, estimated_cost, deposit_paid)
  VALUES (v_branch_id, v_customer_id, 'TEST-JOB-5', 55, 55)
  RETURNING id INTO v_repair5_id;
  v_clock := v_clock + interval '1 second';
  INSERT INTO repair_payments (business_id, repair_id, customer_id, amount, method, created_at)
  VALUES (v_business_id, v_repair5_id, v_customer_id, 55, 'cash', v_clock);
  v_exp := v_exp + 55;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('B4b Repair-5 cash deposit: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  v_clock := v_clock + interval '1 second';
  UPDATE repairs SET refund_amount = 55 WHERE id = v_repair5_id;
  INSERT INTO repair_status_history (repair_id, old_status, new_status, created_at)
  VALUES (v_repair5_id, 'ready_to_collect', 'refunded', v_clock);
  v_exp := v_exp - 55;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('B4b Repair refunded (cash deposit): repair_cash_refunds (migration 184 fix)', (v_preview->>'repair_cash_refunds')::numeric, 55);
  PERFORM pg_temp.assert_eq('B4b Repair refunded (cash deposit): expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §4.4c mixed-tender repair refund: deposit paid 80 cash + 20 card,
  -- refund_amount is the full 100. Both the cash portion (capped by LEAST())
  -- and, since migration 190, the card portion now leave Expected Cash too.
  INSERT INTO repairs (branch_id, customer_id, job_number, estimated_cost, deposit_paid)
  VALUES (v_branch_id, v_customer_id, 'TEST-JOB-6', 100, 100)
  RETURNING id INTO v_repair6_id;
  v_clock := v_clock + interval '1 second';
  INSERT INTO repair_payments (business_id, repair_id, customer_id, amount, method, created_at)
  VALUES (v_business_id, v_repair6_id, v_customer_id, 80, 'cash', v_clock);
  v_clock := v_clock + interval '1 second';
  INSERT INTO repair_payments (business_id, repair_id, customer_id, amount, method, created_at)
  VALUES (v_business_id, v_repair6_id, v_customer_id, 20, 'card', v_clock);
  v_exp := v_exp + 80 + 20;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('B4c Repair-6 mixed cash+card deposit: repair_card_deposits (migration 190 fix)', (v_preview->>'repair_card_deposits')::numeric, 20);
  PERFORM pg_temp.assert_eq('B4c Repair-6 mixed cash+card deposit: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  v_clock := v_clock + interval '1 second';
  UPDATE repairs SET refund_amount = 100 WHERE id = v_repair6_id;
  INSERT INTO repair_status_history (repair_id, old_status, new_status, created_at)
  VALUES (v_repair6_id, 'ready_to_collect', 'refunded', v_clock);
  v_exp := v_exp - 80 - 20;  -- both the cash and (since migration 190) card portions leave Expected Cash
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('B4c Mixed-tender repair refund: repair_cash_refunds capped at cash paid (cumulative w/ B4b)', (v_preview->>'repair_cash_refunds')::numeric, 135);
  PERFORM pg_temp.assert_eq('B4c Mixed-tender repair refund: repair_card_refunds capped at card paid (migration 190 fix)', (v_preview->>'repair_card_refunds')::numeric, 20);
  PERFORM pg_temp.assert_eq('B4c Mixed-tender repair refund: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §4.5 repair refund -- refund the repair-2 sale in full (120)
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 120, 120, 'cash', 'refunded', true, 0, '[]'::jsonb, v_clock)
  RETURNING id INTO v_sale_id;
  INSERT INTO sale_items (sale_id, repair_id, name, quantity, unit_price, total)
  VALUES (v_sale_id, v_repair2_id, 'Refund: Repair job 2', 1, 120, 120);
  v_exp := v_exp - 120;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('B5 Repair refund: repair_refunds', (v_preview->>'repair_refunds')::numeric, 120);
  PERFORM pg_temp.assert_eq('B5 Repair refund: total_refunds unaffected (repair-linked, not product)', (v_preview->>'total_refunds')::numeric, 0);
  PERFORM pg_temp.assert_eq('B5 Repair refund: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  v_close := close_register_session(v_session_id, v_exp, NULL);
  PERFORM pg_temp.assert_eq('B6 Close parity: expected_cash matches live preview', (v_close->>'expected_cash')::numeric, v_exp);
  PERFORM pg_temp.assert_eq('B6 Close parity: variance is zero', (v_close->>'variance')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _test_results (label, status, expected, actual)
    VALUES ('GROUP B UNEXPECTED ERROR: ' || SQLERRM, 'FAIL', NULL, NULL);
  END;

  -- ==========================================================================
  -- GROUP C: Credit repayments (QA doc §5) -- needs a sale from a PRIOR, closed session
  -- ==========================================================================
  BEGIN
  v_clock := v_clock + interval '1 second';
  INSERT INTO register_sessions (business_id, branch_id, cashier_id, opening_float, status, opened_at)
  VALUES (v_business_id, v_branch_id, v_cashier_id, 0, 'open', v_clock)
  RETURNING id INTO v_session_id;

  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 100, 100, 'on_account', 'partial', false, 20, '[{"method":"card","amount":20}]'::jsonb, v_clock)
  RETURNING id INTO v_prior_sale_id;

  v_close := close_register_session(v_session_id, 0, NULL);  -- close this "prior session" immediately

  -- New session opens strictly after the prior sale's timestamp (simulated clock, not wall time).
  v_clock := v_clock + interval '1 second';
  INSERT INTO register_sessions (business_id, branch_id, cashier_id, opening_float, status, opened_at)
  VALUES (v_business_id, v_branch_id, v_cashier_id, 0, 'open', v_clock)
  RETURNING id INTO v_session_id;
  v_exp := 0;

  -- §5.1 same-day cash repayment against the PRIOR session's on-account sale
  v_clock := v_clock + interval '1 second';
  INSERT INTO sale_payments (business_id, sale_id, customer_id, amount, method, created_at)
  VALUES (v_business_id, v_prior_sale_id, v_customer_id, 30, 'cash', v_clock);
  v_exp := v_exp + 30;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('C1 Prior-session credit repayment: credit_repayments_cash', (v_preview->>'credit_repayments_cash')::numeric, 30);
  PERFORM pg_temp.assert_eq('C1 Prior-session credit repayment: total_sales not bumped', (v_preview->>'total_sales')::numeric, 0);
  PERFORM pg_temp.assert_eq('C1 Prior-session credit repayment: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §5.2 same-session on-account sale + an (out-of-band) repayment attempt against it same day -- must not double count
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 50, 50, 'on_account', 'partial', false, 10, '[{"method":"cash","amount":10}]'::jsonb, v_clock)
  RETURNING id INTO v_sale_id;
  v_clock := v_clock + interval '1 second';
  INSERT INTO sale_payments (business_id, sale_id, customer_id, amount, method, created_at)
  VALUES (v_business_id, v_sale_id, v_customer_id, 15, 'cash', v_clock);  -- same-session sale: this ledger row must be ignored
  v_exp := v_exp + 10;  -- only the deposit counts; the same-session sale_payments row must not
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('C2 Same-session repayment guard: credit_repayments_cash unchanged', (v_preview->>'credit_repayments_cash')::numeric, 30);
  PERFORM pg_temp.assert_eq('C2 Same-session repayment guard: on_account_sales', (v_preview->>'on_account_sales')::numeric, 40);
  PERFORM pg_temp.assert_eq('C2 Same-session repayment guard: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  v_close := close_register_session(v_session_id, v_exp, NULL);
  PERFORM pg_temp.assert_eq('C3 Close parity: expected_cash matches live preview', (v_close->>'expected_cash')::numeric, v_exp);
  PERFORM pg_temp.assert_eq('C3 Close parity: variance is zero', (v_close->>'variance')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _test_results (label, status, expected, actual)
    VALUES ('GROUP C UNEXPECTED ERROR: ' || SQLERRM, 'FAIL', NULL, NULL);
  END;

  -- ==========================================================================
  -- GROUP D: Cash In / Cash Out / Buyback (QA doc §6)
  -- ==========================================================================
  BEGIN
  v_clock := v_clock + interval '1 second';
  INSERT INTO register_sessions (business_id, branch_id, cashier_id, opening_float, status, opened_at)
  VALUES (v_business_id, v_branch_id, v_cashier_id, 100, 'open', v_clock)
  RETURNING id INTO v_session_id;
  v_exp := 100;

  v_clock := v_clock + interval '1 second';
  INSERT INTO cash_movements (session_id, branch_id, business_id, cashier_id, type, amount, purpose, created_at)
  VALUES (v_session_id, v_branch_id, v_business_id, v_cashier_id, 'cash_in', 20, 'plain', v_clock);
  v_exp := v_exp + 20;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('D1 Cash In: cash_in', (v_preview->>'cash_in')::numeric, 20);
  PERFORM pg_temp.assert_eq('D1 Cash In: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  v_clock := v_clock + interval '1 second';
  INSERT INTO cash_movements (session_id, branch_id, business_id, cashier_id, type, amount, purpose, created_at)
  VALUES (v_session_id, v_branch_id, v_business_id, v_cashier_id, 'cash_out', 10, 'plain', v_clock);
  v_exp := v_exp - 10;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('D2 Cash Out (plain): cash_out', (v_preview->>'cash_out')::numeric, 10);
  PERFORM pg_temp.assert_eq('D2 Cash Out (plain): expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  v_clock := v_clock + interval '1 second';
  INSERT INTO cash_movements (session_id, branch_id, business_id, cashier_id, type, amount, purpose, created_at)
  VALUES (v_session_id, v_branch_id, v_business_id, v_cashier_id, 'cash_out', 40, 'buyback', v_clock);
  v_exp := v_exp - 40;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('D3 Cash Out (buyback): cash_out cumulative', (v_preview->>'cash_out')::numeric, 50);
  PERFORM pg_temp.assert_eq('D3 Cash Out (buyback): buyback_out', (v_preview->>'buyback_out')::numeric, 40);
  PERFORM pg_temp.assert_eq('D3 Cash Out (buyback): expected_cash (not double-subtracted)', (v_preview->>'expected_cash')::numeric, v_exp);

  v_close := close_register_session(v_session_id, v_exp, NULL);
  PERFORM pg_temp.assert_eq('D4 Close parity: expected_cash matches live preview', (v_close->>'expected_cash')::numeric, v_exp);
  PERFORM pg_temp.assert_eq('D4 Close parity: variance is zero', (v_close->>'variance')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _test_results (label, status, expected, actual)
    VALUES ('GROUP D UNEXPECTED ERROR: ' || SQLERRM, 'FAIL', NULL, NULL);
  END;

  -- ==========================================================================
  -- GROUP E: Grand Total refund netting (migration 185) + gift-card-sale /
  -- trade-in-payout cash movements (migrations 186/187)
  -- ==========================================================================
  BEGIN
  v_clock := v_clock + interval '1 second';
  INSERT INTO register_sessions (business_id, branch_id, cashier_id, opening_float, status, opened_at)
  VALUES (v_business_id, v_branch_id, v_cashier_id, 0, 'open', v_clock)
  RETURNING id INTO v_session_id;
  v_exp := 0;

  -- E1: plain cash sale of 100, then a cash refund of 30 on a (non-repair)
  -- product sale -- close_register_session's grand_total must be 70 (100-30),
  -- not 100. Before migration 185, grand_total only netted repair_refunds.
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 100, 100, 'cash', 'paid', false, 100, '[]'::jsonb, v_clock);
  v_exp := v_exp + 100;

  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 30, 30, 'cash', 'refunded', true, 0, '[]'::jsonb, v_clock);
  v_exp := v_exp - 30;

  -- E2: a gift card sold for cash writes a cash_in/'gift_card_sale'
  -- cash_movements row (GiftCardService.create, migrations 186/187) --
  -- Expected Cash must rise by that amount, but it's not a `sales` row so
  -- total_sales/grand_total must NOT include it (a gift card sale isn't
  -- revenue, it's a liability -- also excluded from get_profit_loss()'s
  -- v_cash_net and computeCashNet(), see migration 187).
  v_clock := v_clock + interval '1 second';
  INSERT INTO cash_movements (session_id, branch_id, business_id, cashier_id, type, amount, purpose, notes, created_at)
  VALUES (v_session_id, v_branch_id, v_business_id, v_cashier_id, 'cash_in', 25, 'gift_card_sale', 'Gift card sale — TEST-GC', v_clock);
  v_exp := v_exp + 25;

  -- E3: a trade-in cash payout writes a cash_out/'trade_in' cash_movements
  -- row (TradeInService.create, migration 186) -- Expected Cash must fall by
  -- that amount, and again must not touch total_sales/grand_total.
  v_clock := v_clock + interval '1 second';
  INSERT INTO cash_movements (session_id, branch_id, business_id, cashier_id, type, amount, purpose, notes, created_at)
  VALUES (v_session_id, v_branch_id, v_business_id, v_cashier_id, 'cash_out', 15, 'trade_in', 'Trade-in payout — TEST-DEVICE', v_clock);
  v_exp := v_exp - 15;

  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('E2 Gift card cash sale: cash_in', (v_preview->>'cash_in')::numeric, 25);
  PERFORM pg_temp.assert_eq('E3 Trade-in cash payout: cash_out', (v_preview->>'cash_out')::numeric, 15);
  PERFORM pg_temp.assert_eq('E2/E3 Non-sale cash movements: total_sales unaffected', (v_preview->>'total_sales')::numeric, 70);
  PERFORM pg_temp.assert_eq('E1/E2/E3 Combined: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  v_close := close_register_session(v_session_id, v_exp, NULL);
  PERFORM pg_temp.assert_eq('E1 Grand Total nets product refunds (migration 185 fix)', (v_close->>'grand_total')::numeric, 70);
  PERFORM pg_temp.assert_eq('E4 Close parity: expected_cash matches live preview', (v_close->>'expected_cash')::numeric, v_exp);
  PERFORM pg_temp.assert_eq('E4 Close parity: variance is zero', (v_close->>'variance')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _test_results (label, status, expected, actual)
    VALUES ('GROUP E UNEXPECTED ERROR: ' || SQLERRM, 'FAIL', NULL, NULL);
  END;

  -- ==========================================================================
  -- GROUP F: process_refund() sign normalization (migration 188) --
  -- CRITICAL, live-reproduced bug: refunding through the Sales page's inline
  -- refund modal (src/app/(tenant)/sales/page.tsx, refundMutation) sends a
  -- POSITIVE `total` to process_refund(), which used to negate it
  -- unconditionally -- storing a NEGATIVE sales.total for the refund row,
  -- which made v_cash_refunds negative and Expected Cash INCREASE instead of
  -- decrease. This calls process_refund() directly (not a synthetic sales
  -- insert) with that exact payload shape, since the bug lives in the RPC's
  -- sign-handling itself, not in the register formula.
  -- ==========================================================================
  BEGIN
  v_clock := v_clock + interval '1 second';
  INSERT INTO register_sessions (business_id, branch_id, cashier_id, opening_float, status, opened_at)
  VALUES (v_business_id, v_branch_id, v_cashier_id, 200, 'open', v_clock)
  RETURNING id INTO v_session_id;
  v_exp := 200;

  -- Mimic src/app/(tenant)/sales/page.tsx's refundMutation payload exactly:
  -- POSITIVE subtotal/tax/total, no original_sale_id, one is_service line
  -- item (its "Refund Amount" mode) with a POSITIVE total.
  v_refund_id := process_refund(jsonb_build_object(
    'branch_id',    v_branch_id,
    'cashier_id',   v_cashier_id,
    'customer_id',  NULL,
    'subtotal',     100,
    'tax',          0,
    'total',        100,
    'payment_method', 'cash',
    'refund_reason', NULL,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', NULL, 'variant_id', NULL, 'name', 'TEST-REFUND-AMOUNT-MODE',
      'quantity', 1, 'unit_price', 100, 'total', 100, 'is_service', true
    ))
  ));

  SELECT total, is_refund, payment_method INTO v_refund_row FROM sales WHERE id = v_refund_id;
  PERFORM pg_temp.assert_eq('F1 process_refund stores POSITIVE total regardless of caller sign (migration 188 fix)', v_refund_row.total, 100);

  v_exp := v_exp - 100;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('F2 Cash refund via positive-sign caller: expected_cash DECREASES (not increases)', (v_preview->>'expected_cash')::numeric, v_exp);

  v_close := close_register_session(v_session_id, v_exp, NULL);
  PERFORM pg_temp.assert_eq('F3 Close parity: expected_cash matches live preview', (v_close->>'expected_cash')::numeric, v_exp);
  PERFORM pg_temp.assert_eq('F3 Close parity: variance is zero', (v_close->>'variance')::numeric, 0);

  -- F4/F5 (migration 191): "Refund Amount" mode against a REAL original sale
  -- always failed with "Cannot refund more than remaining quantity" -- the
  -- amount-mode item name ("<name> (amount refund)") never matches the
  -- original sale_items row's real name, so the quantity-remaining guard
  -- always saw 0 remaining. F1-F3 above never caught this because they
  -- didn't set original_sale_id at all, which skips that guard entirely --
  -- this reproduces the exact failing case: a real original_sale_id with a
  -- matching sale_items row, refunded via the amount-mode payload shape.
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 110, 110, 'cash', 'paid', false, 110, '[]'::jsonb, v_clock)
  RETURNING id INTO v_sale_id;
  INSERT INTO sale_items (sale_id, name, quantity, unit_price, total)
  VALUES (v_sale_id, 'TEST-ITEM-F4', 1, 110, 110);
  v_exp := v_exp + 110;

  v_clock := v_clock + interval '1 second';
  v_refund_id := process_refund(jsonb_build_object(
    'original_sale_id', v_sale_id,
    'branch_id',    v_branch_id,
    'cashier_id',   v_cashier_id,
    'customer_id',  NULL,
    'subtotal',     10,
    'tax',          0,
    'total',        10,
    'payment_method', 'cash',
    'refund_reason', NULL,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', NULL, 'variant_id', NULL, 'name', 'TEST-ITEM-F4 (amount refund)',
      'quantity', 1, 'unit_price', 10, 'total', 10, 'is_service', true
    ))
  ));
  v_exp := v_exp - 10;
  PERFORM pg_temp.assert_eq('F4 Amount-mode refund against a real sale does not raise (migration 191 fix)', CASE WHEN v_refund_id IS NOT NULL THEN 1 ELSE 0 END, 1);

  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('F5 Amount-mode refund against a real sale: expected_cash decreases correctly', (v_preview->>'expected_cash')::numeric, v_exp);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _test_results (label, status, expected, actual)
    VALUES ('GROUP F UNEXPECTED ERROR: ' || SQLERRM, 'FAIL', NULL, NULL);
  END;

  -- ==========================================================================
  -- GROUP G: Split-tender sale cash/card breakdown (migration 189) -- a
  -- split-tender sale's card (and any other non-cash) leg used to be lumped
  -- entirely into "Other Sales" instead of Cash Sales / Card Sales.
  -- ==========================================================================
  BEGIN
  v_clock := v_clock + interval '1 second';
  INSERT INTO register_sessions (business_id, branch_id, cashier_id, opening_float, status, opened_at)
  VALUES (v_business_id, v_branch_id, v_cashier_id, 0, 'open', v_clock)
  RETURNING id INTO v_session_id;
  v_exp := 0;

  -- Split-tender sale: 100 total, 25 cash / 75 card.
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 100, 100, 'split', 'paid', false, 100, '[{"method":"cash","amount":25},{"method":"card","amount":75}]'::jsonb, v_clock);
  v_exp := v_exp + 25 + 75;  -- both legs move Expected Cash since migration 190

  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('G1 Split sale: cash_sales gets the cash leg (migration 189 fix)', (v_preview->>'cash_sales')::numeric, 25);
  PERFORM pg_temp.assert_eq('G2 Split sale: card_sales gets the card leg (migration 189 fix)', (v_preview->>'card_sales')::numeric, 75);
  PERFORM pg_temp.assert_eq('G3 Split sale: other_sales does NOT double-count it (migration 189 fix)', (v_preview->>'other_sales')::numeric, 0);
  PERFORM pg_temp.assert_eq('G4 Split sale: total_sales unaffected by the breakdown fix', (v_preview->>'total_sales')::numeric, 100);
  PERFORM pg_temp.assert_eq('G5 Split sale: expected_cash moves by BOTH legs (migration 190 fix)', (v_preview->>'expected_cash')::numeric, v_exp);

  v_close := close_register_session(v_session_id, v_exp, NULL);
  PERFORM pg_temp.assert_eq('G6 Close parity: cash_sales', (v_close->>'cash_sales')::numeric, 25);
  PERFORM pg_temp.assert_eq('G6 Close parity: card_sales', (v_close->>'card_sales')::numeric, 75);
  PERFORM pg_temp.assert_eq('G6 Close parity: other_sales', (v_close->>'other_sales')::numeric, 0);
  PERFORM pg_temp.assert_eq('G6 Close parity: expected_cash matches live preview', (v_close->>'expected_cash')::numeric, v_exp);
  PERFORM pg_temp.assert_eq('G6 Close parity: variance is zero', (v_close->>'variance')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _test_results (label, status, expected, actual)
    VALUES ('GROUP G UNEXPECTED ERROR: ' || SQLERRM, 'FAIL', NULL, NULL);
  END;

  -- ==========================================================================
  -- GROUP H: Card payments merged into Expected Cash (migration 190) --
  -- EXPLICIT BUSINESS DECISION, not a bug fix. Card sales/refunds/repair
  -- deposits now move Expected Cash the same way cash does. Closing also
  -- takes a new p_closing_card_total (the staff-entered card machine total),
  -- added to the counted cash before comparing against Expected Cash.
  -- ==========================================================================
  BEGIN
  v_clock := v_clock + interval '1 second';
  INSERT INTO register_sessions (business_id, branch_id, cashier_id, opening_float, status, opened_at)
  VALUES (v_business_id, v_branch_id, v_cashier_id, 0, 'open', v_clock)
  RETURNING id INTO v_session_id;
  v_exp := 0;

  -- H1: card sale, 60 -- now moves Expected Cash (previously it wouldn't have).
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 60, 60, 'card', 'paid', false, 60, '[]'::jsonb, v_clock);
  v_exp := v_exp + 60;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('H1 Card sale: card_sales', (v_preview->>'card_sales')::numeric, 60);
  PERFORM pg_temp.assert_eq('H1 Card sale: expected_cash now includes card (migration 190 fix)', (v_preview->>'expected_cash')::numeric, v_exp);

  -- H2: card refund, 15 -- must now reduce Expected Cash.
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 15, 15, 'card', 'refunded', true, 0, '[]'::jsonb, v_clock);
  v_exp := v_exp - 15;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('H2 Card refund: card_refunds', (v_preview->>'card_refunds')::numeric, 15);
  PERFORM pg_temp.assert_eq('H2 Card refund: expected_cash decreases (migration 190 fix)', (v_preview->>'expected_cash')::numeric, v_exp);

  -- H3: repair card deposit via repair_payments ledger (not pos_paid), 45 --
  -- mirrors the existing cash-deposit test (Group B §4.1) but for card.
  INSERT INTO repairs (branch_id, customer_id, job_number, estimated_cost, deposit_paid)
  VALUES (v_branch_id, v_customer_id, 'TEST-JOB-H3', 200, 45)
  RETURNING id INTO v_repair1_id;
  v_clock := v_clock + interval '1 second';
  INSERT INTO repair_payments (business_id, repair_id, customer_id, amount, method, created_at)
  VALUES (v_business_id, v_repair1_id, v_customer_id, 45, 'card', v_clock);
  v_exp := v_exp + 45;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('H3 Repair card deposit: repair_card_deposits', (v_preview->>'repair_card_deposits')::numeric, 45);
  PERFORM pg_temp.assert_eq('H3 Repair card deposit: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  -- H4: close with a counted-cash amount of 0 AND a separately entered card
  -- total of 90 (= 60 - 15 + 45, everything this session was card) -- staff
  -- physically counted no cash (none was ever in the drawer) and typed in
  -- the card machine's report total instead.
  v_close := close_register_session(v_session_id, 0, NULL, 90);
  PERFORM pg_temp.assert_eq('H4 Close with card total input: expected_cash matches live preview', (v_close->>'expected_cash')::numeric, v_exp);
  PERFORM pg_temp.assert_eq('H4 Close with card total input: closing_card_total stored', (v_close->>'closing_card_total')::numeric, 90);
  PERFORM pg_temp.assert_eq('H4 Close with card total input: variance is zero (0 cash + 90 card = expected)', (v_close->>'variance')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _test_results (label, status, expected, actual)
    VALUES ('GROUP H UNEXPECTED ERROR: ' || SQLERRM, 'FAIL', NULL, NULL);
  END;

  -- ==========================================================================
  -- GROUP I: Split-tender REFUND cash/card breakdown (migration 201) --
  -- reproduces the live Riseteck bug: a split-tender sale (250 = 220 cash +
  -- 30 card) refunded in full used to only reduce whichever single
  -- payment_method the refund row carried -- the other leg vanished from
  -- every cash figure. Calls process_refund() directly (like Group F) with
  -- payment_method:'split' + payment_splits, since the fix lives in both the
  -- RPC's INSERT (storing payment_splits at all) and the register formula's
  -- leg-recovery query.
  -- ==========================================================================
  BEGIN
  v_clock := v_clock + interval '1 second';
  INSERT INTO register_sessions (business_id, branch_id, cashier_id, opening_float, status, opened_at)
  VALUES (v_business_id, v_branch_id, v_cashier_id, 0, 'open', v_clock)
  RETURNING id INTO v_session_id;
  v_exp := 0;

  -- Original split-tender sale: 250 total, 220 cash / 30 card (the PS5 sale).
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 250, 250, 'split', 'paid', false, 250, '[{"method":"cash","amount":220},{"method":"card","amount":30}]'::jsonb, v_clock)
  RETURNING id INTO v_sale_id;
  v_exp := v_exp + 220 + 30;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('I0 Split sale baseline: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  -- Full refund via process_refund(), mirroring the same split.
  v_clock := v_clock + interval '1 second';
  v_refund_id := process_refund(jsonb_build_object(
    'original_sale_id', v_sale_id,
    'branch_id',    v_branch_id,
    'cashier_id',   v_cashier_id,
    'customer_id',  NULL,
    'subtotal',     250,
    'tax',          0,
    'total',        250,
    'payment_method', 'split',
    'payment_splits', jsonb_build_array(
      jsonb_build_object('method', 'cash', 'amount', 220),
      jsonb_build_object('method', 'card', 'amount', 30)
    ),
    'refund_reason', NULL,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', NULL, 'variant_id', NULL, 'name', 'TEST-PS5-SPLIT-REFUND',
      'quantity', 1, 'unit_price', 250, 'total', 250, 'is_service', true
    ))
  ));

  SELECT payment_method, payment_splits INTO v_refund_row FROM sales WHERE id = v_refund_id;
  PERFORM pg_temp.assert_eq('I1 process_refund stores payment_method = split (migration 201 fix)',
    CASE WHEN v_refund_row.payment_method = 'split' THEN 1 ELSE 0 END, 1);
  PERFORM pg_temp.assert_eq('I2 process_refund stores non-empty payment_splits (migration 201 fix)',
    CASE WHEN v_refund_row.payment_splits IS NOT NULL AND v_refund_row.payment_splits <> '[]'::jsonb THEN 1 ELSE 0 END, 1);

  v_exp := v_exp - 220 - 30;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('I3 Split refund: cash leg reduces expected_cash (migration 201 fix -- previously missing)', (v_preview->>'expected_cash')::numeric, v_exp);
  PERFORM pg_temp.assert_eq('I4 Split refund: card_refunds still gets its own leg', (v_preview->>'card_refunds')::numeric, 30);

  v_close := close_register_session(v_session_id, v_exp, NULL);
  PERFORM pg_temp.assert_eq('I5 Close parity: expected_cash matches live preview', (v_close->>'expected_cash')::numeric, v_exp);
  PERFORM pg_temp.assert_eq('I5 Close parity: variance is zero', (v_close->>'variance')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _test_results (label, status, expected, actual)
    VALUES ('GROUP I UNEXPECTED ERROR: ' || SQLERRM, 'FAIL', NULL, NULL);
  END;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO _test_results (label, status, expected, actual)
  VALUES ('SETUP UNEXPECTED ERROR: ' || SQLERRM, 'FAIL', NULL, NULL);
END;
$$;

-- ── Print summary ─────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  v_pass INT;
  v_fail INT;
BEGIN
  FOR r IN SELECT * FROM _test_results ORDER BY seq LOOP
    RAISE NOTICE '[%] % (expected=%, actual=%)', r.status, r.label, r.expected, r.actual;
  END LOOP;

  SELECT count(*) FILTER (WHERE status = 'PASS'), count(*) FILTER (WHERE status = 'FAIL')
  INTO v_pass, v_fail
  FROM _test_results;

  RAISE NOTICE '========================================================';
  RAISE NOTICE 'RESULT: % passed, % failed (of % checks)', v_pass, v_fail, v_pass + v_fail;
  RAISE NOTICE '========================================================';
END;
$$;

-- Nothing above this line is ever kept -- guaranteed rollback regardless of
-- pass/fail, connection type, or whether an unexpected error occurred.
ROLLBACK;
