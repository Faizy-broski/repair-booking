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
-- refunds, repair deposits/top-ups/collections, same-day credit repayments,
-- and manual cash movements. It also checks that the live preview
-- (register_session_expected) and the final close-out figure
-- (close_register_session) always agree — the exact class of bug found and
-- fixed in migrations 172/173.
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
  v_sale_id       UUID;
  v_prior_sale_id UUID;

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

  -- §2.2 card sale, 40 -- must NOT move Expected Cash
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 40, 40, 'card', 'paid', false, 40, '[]'::jsonb, v_clock);
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('A2 Card sale: card_sales', (v_preview->>'card_sales')::numeric, 40);
  PERFORM pg_temp.assert_eq('A2 Card sale: expected_cash unchanged', (v_preview->>'expected_cash')::numeric, v_exp);

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

  -- §2.5 split cash+card sale, total 80, 50 cash / 30 card, fully paid (no credit)
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 80, 80, 'split', 'paid', false, 80, '[{"method":"cash","amount":50},{"method":"card","amount":30}]'::jsonb, v_clock);
  v_exp := v_exp + 50;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('A5 Split cash+card sale: split_tender_cash cumulative', (v_preview->>'split_tender_cash')::numeric, 100);
  PERFORM pg_temp.assert_eq('A5 Split cash+card sale: expected_cash (bug #2 check)', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §3.1 cash refund, 50
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 50, 50, 'cash', 'refunded', true, 0, '[]'::jsonb, v_clock);
  v_exp := v_exp - 50;
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('A6 Cash refund: total_refunds', (v_preview->>'total_refunds')::numeric, 50);
  PERFORM pg_temp.assert_eq('A6 Cash refund: expected_cash', (v_preview->>'expected_cash')::numeric, v_exp);

  -- §3.1b card refund, 30 -- must NOT reduce Expected Cash (bug #1's core check)
  v_clock := v_clock + interval '1 second';
  INSERT INTO sales (branch_id, customer_id, cashier_id, subtotal, total, payment_method, payment_status, is_refund, amount_paid, payment_splits, created_at)
  VALUES (v_branch_id, v_customer_id, v_cashier_id, 30, 30, 'card', 'refunded', true, 0, '[]'::jsonb, v_clock);
  v_preview := register_session_expected(v_session_id);
  PERFORM pg_temp.assert_eq('A7 Card refund: total_refunds cumulative', (v_preview->>'total_refunds')::numeric, 80);
  PERFORM pg_temp.assert_eq('A7 Card refund: expected_cash unchanged (bug #1 check)', (v_preview->>'expected_cash')::numeric, v_exp);

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
