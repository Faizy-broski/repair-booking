-- Read-only diagnostic — NOT a migration, does not change anything.
-- Safe to run any time, on any environment.
--
-- Purpose: for one specific register session, show exactly which component
-- (cash sales, card sales, split-tender legs, repair deposits, credit
-- repayments, cash in/out, refunds...) makes up the "Expected Cash" figure,
-- so an unexplained gap like the client's "£528.23 expected vs £487.00
-- counted" (-£41.23) can be traced to a specific cause instead of staying a
-- mystery. See Part 10 of the plan for the full write-up — the most likely
-- explanation is a sale/repair payment/cash movement that landed *while*
-- staff were counting the drawer (Expected Cash is live and moves in
-- real time; the old Close Register modal only showed a one-time snapshot
-- taken when it was opened — now fixed to stay live, see the same Part 10).
--
-- HOW TO USE:
-- 1. Find the session_id for the shift in question — either from the URL
--    when viewing its Z-Report (`/reports/z-report?session=<id>`), or via
--    STEP 0 below (uncomment and fill in the branch + rough date/time).
-- 2. Paste that session_id into p_session_id below.
-- 3. Run this whole file. STEP 1 gives the full component breakdown (should
--    sum to Expected Cash). STEP 2 lists every individual transaction in
--    that session's time window with its timestamp, so you can see exactly
--    which one landed after staff started counting.

-- ── STEP 0 (optional) — find the session_id if you don't already have it ──
-- SELECT id, branch_id, opened_at, closed_at, status, expected_cash, closing_cash, closing_card_total, variance
-- FROM register_sessions
-- WHERE branch_id = '<branch-id-here>'
-- ORDER BY opened_at DESC
-- LIMIT 10;

-- ── Fill this in, then run STEP 1 and STEP 2 below ──
\set session_id '<paste-session-id-here>'

-- ── STEP 1 — full component breakdown for this session ──
-- Calls the exact same function the app itself uses (register_session_expected),
-- so this is guaranteed to match reality, not a re-implementation that could
-- drift out of sync. Every field here is documented in supabase/migrations/
-- 196_exclude_trade_in_from_pnl_cash_net.sql's predecessor, 190_merge_card_
-- into_expected_cash.sql, which defines this function.
SELECT jsonb_pretty(register_session_expected(:'session_id'::uuid));

-- ── STEP 2 — every individual transaction in this session's time window ──
-- Cross-reference this against the card machine's own printed/emailed report
-- and staff's memory of when they started counting, to spot which row(s)
-- landed *after* counting began.
WITH sess AS (
  SELECT id, branch_id, opened_at, COALESCE(closed_at, NOW()) AS window_end
  FROM register_sessions WHERE id = :'session_id'::uuid
)
SELECT 'sale' AS source, s.created_at AS occurred_at, s.payment_method AS method,
       s.total AS amount, s.is_refund, s.payment_splits
FROM sales s, sess
WHERE s.branch_id = sess.branch_id
  AND s.created_at BETWEEN sess.opened_at AND sess.window_end

UNION ALL

SELECT 'repair_payment' AS source, rp.created_at AS occurred_at, rp.method AS method,
       rp.amount AS amount, false AS is_refund, NULL AS payment_splits
FROM repair_payments rp
JOIN repairs r ON r.id = rp.repair_id, sess
WHERE r.branch_id = sess.branch_id
  AND rp.created_at BETWEEN sess.opened_at AND sess.window_end

UNION ALL

SELECT 'cash_movement' AS source, cm.created_at AS occurred_at,
       (cm.type || ' / ' || cm.purpose) AS method,
       cm.amount AS amount, false AS is_refund, NULL AS payment_splits
FROM cash_movements cm, sess
WHERE cm.session_id = sess.id

ORDER BY occurred_at;
