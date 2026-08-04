-- ============================================================
-- 139 — Freeze the regular selling price on discount-allocation sale lines
--
-- process_sale() already freezes unit_cost (136) and links discount_allocation_id
-- (137/138) on discount lines, but never recorded what the item's normal
-- selling price was — so receipts couldn't show "UNIT: <regular price>
-- DISC: <amount>", only the price actually charged with no discount context.
-- Following the frozen-at-time-of-sale pattern from unit_cost: read the live
-- products/product_variants.selling_price inside process_sale and freeze it,
-- populated ONLY for discount-allocation lines (v_is_discount = true). NULL
-- for every normal-price line — renderers fall back to unit_price/discount
-- exactly as before when this is NULL.
-- ============================================================

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS original_unit_price NUMERIC(10,2);

CREATE OR REPLACE FUNCTION process_sale(p_sale_data JSONB)
RETURNS UUID AS $$
DECLARE
  v_sale_id            UUID;
  v_sale_item_id       UUID;
  v_item               JSONB;
  v_inventory_id       UUID;
  v_current_qty        INT;
  v_unit_cost          NUMERIC;
  v_payment_method     TEXT;
  v_amount_paid        NUMERIC;
  v_total              NUMERIC;
  v_payment_status     TEXT;
  v_repair_id          UUID;
  v_is_discount        BOOLEAN;
  v_discount_id        UUID;
  v_discount_remaining INT;
  v_original_price     NUMERIC;
BEGIN
  v_payment_method := COALESCE(p_sale_data->>'payment_method', 'cash');
  v_total          := (p_sale_data->>'total')::NUMERIC;
  v_amount_paid    := COALESCE((p_sale_data->>'amount_paid')::NUMERIC, 0);

  IF v_payment_method = 'on_account' THEN
    IF v_amount_paid <= 0 THEN
      v_payment_status := 'on_account';
    ELSIF v_amount_paid >= v_total THEN
      v_payment_status := 'paid';
    ELSE
      v_payment_status := 'partial';
    END IF;
  ELSE
    v_payment_status := 'paid';
  END IF;

  INSERT INTO sales (
    branch_id, customer_id, cashier_id,
    subtotal, discount, tax, total,
    payment_method, payment_status, amount_paid,
    payment_splits, gift_card_id, notes, employee_id
  )
  VALUES (
    (p_sale_data->>'branch_id')::UUID,
    NULLIF(p_sale_data->>'customer_id', '')::UUID,
    NULLIF(p_sale_data->>'cashier_id', '')::UUID,
    (p_sale_data->>'subtotal')::NUMERIC,
    COALESCE((p_sale_data->>'discount')::NUMERIC, 0),
    COALESCE((p_sale_data->>'tax')::NUMERIC, 0),
    v_total,
    v_payment_method,
    v_payment_status,
    v_amount_paid,
    COALESCE(p_sale_data->'payment_splits', '[]'::jsonb),
    NULLIF(p_sale_data->>'gift_card_id', '')::UUID,
    p_sale_data->>'notes',
    NULLIF(p_sale_data->>'employee_id', '')::UUID
  )
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_data->'items')
  LOOP
    v_repair_id   := NULLIF(v_item->>'repair_id', '')::UUID;
    v_unit_cost   := 0;
    v_is_discount := COALESCE((v_item->>'is_discount')::BOOLEAN, false);

    INSERT INTO sale_items (
      sale_id, product_id, variant_id, name, quantity, unit_price, discount, total, repair_id
    )
    VALUES (
      v_sale_id,
      -- A repair-job line item never has a row in `products` — never write
      -- its (repair) id into product_id, regardless of what the client sent.
      CASE WHEN v_repair_id IS NOT NULL THEN NULL ELSE NULLIF(v_item->>'product_id', '')::UUID END,
      NULLIF(v_item->>'variant_id', '')::UUID,
      v_item->>'name',
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::NUMERIC,
      COALESCE((v_item->>'discount')::NUMERIC, 0),
      (v_item->>'total')::NUMERIC,
      v_repair_id
    )
    RETURNING id INTO v_sale_item_id;

    IF (v_item->>'is_service')::BOOLEAN IS NOT TRUE AND v_repair_id IS NULL THEN
      SELECT id, quantity INTO v_inventory_id, v_current_qty
      FROM inventory
      WHERE branch_id = (p_sale_data->>'branch_id')::UUID
        AND product_id = NULLIF(v_item->>'product_id', '')::UUID
        AND (
          variant_id = NULLIF(v_item->>'variant_id', '')::UUID
          OR (variant_id IS NULL AND NULLIF(v_item->>'variant_id', '') IS NULL)
        )
      FOR UPDATE;

      IF v_inventory_id IS NOT NULL THEN
        IF v_current_qty < (v_item->>'quantity')::INT THEN
          RAISE EXCEPTION 'Insufficient stock for product: %', v_item->>'name';
        END IF;

        -- Lock this product/variant/branch's active discount allocation (if
        -- any) — needed whether this line IS the discount line (to consume
        -- it) or a NORMAL-price line (to make sure it doesn't eat into units
        -- reserved for the discount pool). Same IS NOT DISTINCT FROM variant
        -- matching the inventory lookup just above already uses.
        SELECT id, quantity_remaining INTO v_discount_id, v_discount_remaining
        FROM product_discount_allocations
        WHERE product_id = NULLIF(v_item->>'product_id', '')::UUID
          AND branch_id  = (p_sale_data->>'branch_id')::UUID
          AND (
            variant_id = NULLIF(v_item->>'variant_id', '')::UUID
            OR (variant_id IS NULL AND NULLIF(v_item->>'variant_id', '') IS NULL)
          )
          AND status = 'active'
        FOR UPDATE;

        IF v_is_discount THEN
          IF v_discount_id IS NULL OR v_discount_remaining < (v_item->>'quantity')::INT THEN
            RAISE EXCEPTION 'Insufficient discounted stock for product: %', v_item->>'name';
          END IF;
        ELSE
          -- A normal-price sale can't dip the physical stock below what's
          -- still reserved for the discount pool — otherwise it would
          -- silently cannibalize units the discount allocation still thinks
          -- it has to sell (e.g. 10 on hand, 5 reserved, selling 6 at normal
          -- price would pass a naive quantity check but leave the discount
          -- pool pointing at units that no longer physically exist).
          IF v_current_qty - (v_item->>'quantity')::INT < COALESCE(v_discount_remaining, 0) THEN
            RAISE EXCEPTION 'Insufficient normal stock for product: % (units reserved for discount)', v_item->>'name';
          END IF;
        END IF;

        v_unit_cost := consume_and_freeze_cost(
          NULLIF(v_item->>'product_id', '')::UUID,
          (p_sale_data->>'branch_id')::UUID,
          (v_item->>'quantity')::INT,
          v_current_qty
        );

        UPDATE inventory
        SET quantity = quantity - (v_item->>'quantity')::INT, updated_at = NOW()
        WHERE id = v_inventory_id;
        INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, reference_id, note)
        VALUES (
          (p_sale_data->>'branch_id')::UUID,
          NULLIF(v_item->>'product_id', '')::UUID,
          NULLIF(v_item->>'variant_id', '')::UUID,
          'sale', -((v_item->>'quantity')::INT), v_sale_id, 'POS Sale'
        );

        UPDATE sale_items SET unit_cost = v_unit_cost WHERE id = v_sale_item_id;

        IF v_is_discount THEN
          -- Freeze the current regular selling price so receipts (including
          -- future reprints, when the live selling_price may have changed)
          -- can show "UNIT: <regular price> DISC: <amount>" instead of just
          -- the discounted unit_price with no discount context.
          SELECT COALESCE(pv.selling_price, p.selling_price) INTO v_original_price
          FROM products p
          LEFT JOIN product_variants pv ON pv.id = NULLIF(v_item->>'variant_id', '')::UUID
          WHERE p.id = NULLIF(v_item->>'product_id', '')::UUID;

          UPDATE sale_items SET original_unit_price = v_original_price WHERE id = v_sale_item_id;

          UPDATE product_discount_allocations
          SET quantity_remaining = quantity_remaining - (v_item->>'quantity')::INT,
              status   = CASE WHEN quantity_remaining - (v_item->>'quantity')::INT <= 0 THEN 'ended' ELSE 'active' END,
              ended_at = CASE WHEN quantity_remaining - (v_item->>'quantity')::INT <= 0 THEN NOW() ELSE ended_at END
          WHERE id = v_discount_id;

          UPDATE sale_items SET discount_allocation_id = v_discount_id WHERE id = v_sale_item_id;
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF p_sale_data->>'gift_card_id' IS NOT NULL AND p_sale_data->>'gift_card_amount' IS NOT NULL THEN
    UPDATE gift_cards
    SET balance = balance - (p_sale_data->>'gift_card_amount')::NUMERIC
    WHERE id = (p_sale_data->>'gift_card_id')::UUID
      AND balance >= (p_sale_data->>'gift_card_amount')::NUMERIC;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient gift card balance';
    END IF;
  END IF;

  IF NULLIF(p_sale_data->>'customer_id', '') IS NOT NULL AND p_sale_data->>'store_credit_amount' IS NOT NULL
     AND (p_sale_data->>'store_credit_amount')::NUMERIC > 0 THEN
    PERFORM apply_store_credit(
      (SELECT b.business_id FROM branches b WHERE b.id = (p_sale_data->>'branch_id')::UUID),
      NULLIF(p_sale_data->>'customer_id', '')::UUID,
      (p_sale_data->>'store_credit_amount')::NUMERIC,
      'POS sale payment',
      v_sale_id,
      'sale'
    );
  END IF;

  IF NULLIF(p_sale_data->>'customer_id', '') IS NOT NULL AND p_sale_data->>'loyalty_points_used' IS NOT NULL
     AND (p_sale_data->>'loyalty_points_used')::INT > 0 THEN
    PERFORM apply_loyalty_redeem(
      (SELECT b.business_id FROM branches b WHERE b.id = (p_sale_data->>'branch_id')::UUID),
      NULLIF(p_sale_data->>'customer_id', '')::UUID,
      (p_sale_data->>'loyalty_points_used')::INT,
      v_sale_id,
      'sale'
    );
  END IF;

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
