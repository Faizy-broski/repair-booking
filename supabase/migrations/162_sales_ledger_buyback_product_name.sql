-- Migration 162: Surface the buyback product name in the Sales page ledger.
-- Depends on migration 161 (cash_movements.product_id). Adds product_name to
-- get_sales_ledger (migration 158) so a Cash Out row with purpose='buyback'
-- can show which product was bought from the customer.
--
-- Postgres won't let CREATE OR REPLACE change a function's return row shape
-- (new product_name column), so the old signature must be dropped first.

DROP FUNCTION IF EXISTS get_sales_ledger(uuid, timestamptz, timestamptz, text, text, text, uuid[], integer, integer);

CREATE OR REPLACE FUNCTION get_sales_ledger(
  p_branch_id UUID,
  p_from      TIMESTAMPTZ DEFAULT NULL,
  p_to        TIMESTAMPTZ DEFAULT NULL,
  p_type      TEXT        DEFAULT NULL,   -- 'sale' | 'refund' | 'exchange' | 'cash_in' | 'cash_out' | NULL (all)
  p_status    TEXT        DEFAULT NULL,   -- payment_status, sale/refund/exchange rows only
  p_search    TEXT        DEFAULT NULL,
  p_customer_ids UUID[]   DEFAULT NULL,   -- customer IDs matching p_search by name (resolved by the caller)
  p_limit     INT         DEFAULT 20,
  p_offset    INT         DEFAULT 0
)
RETURNS TABLE (
  id                   UUID,
  record_type          TEXT,
  reference            TEXT,
  created_at           TIMESTAMPTZ,
  cashier_id           UUID,
  customer_id          UUID,
  amount               NUMERIC,
  payment_method       TEXT,
  payment_status       TEXT,
  notes                TEXT,
  purpose              TEXT,
  is_refund            BOOLEAN,
  is_exchange          BOOLEAN,
  exchange_original_id UUID,
  refund_reason        TEXT,
  product_name         TEXT,
  total_count          BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_search TEXT := NULLIF(TRIM(p_search), '');
  v_term   TEXT;
BEGIN
  v_term := CASE WHEN v_search IS NOT NULL THEN '%' || v_search || '%' ELSE NULL END;

  RETURN QUERY
  WITH ledger AS (
    SELECT
      s.id,
      CASE WHEN s.is_exchange THEN 'exchange' WHEN s.is_refund THEN 'refund' ELSE 'sale' END AS record_type,
      s.sale_number AS reference,
      s.created_at,
      s.cashier_id,
      s.customer_id,
      s.total AS amount,
      s.payment_method,
      s.payment_status,
      s.notes,
      NULL::TEXT AS purpose,
      s.is_refund,
      s.is_exchange,
      s.exchange_original_id,
      s.refund_reason,
      NULL::TEXT AS product_name
    FROM sales s
    WHERE s.branch_id = p_branch_id
      AND (p_from IS NULL OR s.created_at >= p_from)
      AND (p_to   IS NULL OR s.created_at <= p_to)
      AND (
        p_type IS NULL
        OR (p_type = 'sale'     AND NOT s.is_refund AND NOT s.is_exchange)
        OR (p_type = 'refund'   AND s.is_refund AND NOT s.is_exchange)
        OR (p_type = 'exchange' AND s.is_exchange)
      )
      AND (p_status IS NULL OR s.payment_status = p_status)
      AND (
        v_term IS NULL
        OR s.sale_number ILIKE v_term
        OR s.notes ILIKE v_term
        OR (p_customer_ids IS NOT NULL AND s.customer_id = ANY(p_customer_ids))
      )

    UNION ALL

    SELECT
      cm.id,
      cm.type AS record_type,
      (CASE WHEN cm.type = 'cash_in' THEN 'CI-' ELSE 'CO-' END) || upper(right(cm.id::text, 8)) AS reference,
      cm.created_at,
      cm.cashier_id,
      NULL::UUID AS customer_id,
      cm.amount,
      cm.payment_type AS payment_method,
      NULL::TEXT AS payment_status,
      cm.notes,
      cm.purpose,
      false::BOOLEAN AS is_refund,
      false::BOOLEAN AS is_exchange,
      NULL::UUID AS exchange_original_id,
      NULL::TEXT AS refund_reason,
      p.name AS product_name
    FROM cash_movements cm
    LEFT JOIN products p ON p.id = cm.product_id
    WHERE cm.branch_id = p_branch_id
      AND (p_from IS NULL OR cm.created_at >= p_from)
      AND (p_to   IS NULL OR cm.created_at <= p_to)
      AND (p_type IS NULL OR p_type IN ('cash_in', 'cash_out'))
      AND (p_type IS NULL OR cm.type = p_type)
      AND (p_status IS NULL) -- payment_status doesn't apply to cash movements
      AND (v_term IS NULL OR cm.notes ILIKE v_term
           OR ((CASE WHEN cm.type = 'cash_in' THEN 'CI-' ELSE 'CO-' END) || upper(right(cm.id::text, 8))) ILIKE v_term)
  )
  SELECT l.*, COUNT(*) OVER() AS total_count
  FROM ledger l
  ORDER BY l.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
