-- Migration 070: Deduplicate customers for Phone Fix Broxburn
-- Business ID: b0067485-37f0-4a00-a958-39148da5ab59

DO $$
DECLARE
  v_business_id UUID := 'b0067485-37f0-4a00-a958-39148da5ab59';
  v_rec RECORD;
  v_master_id UUID;
  v_dup_id UUID;
BEGIN
  -- 1. Deduplicate based on phone number (most common)
  FOR v_rec IN 
    SELECT phone, COUNT(*) 
    FROM customers 
    WHERE business_id = v_business_id AND phone IS NOT NULL AND phone != ''
    GROUP BY phone 
    HAVING COUNT(*) > 1
  LOOP
    -- Pick the oldest customer record as the master
    SELECT id INTO v_master_id 
    FROM customers 
    WHERE business_id = v_business_id AND phone = v_rec.phone
    ORDER BY created_at ASC 
    LIMIT 1;

    -- Merge all other duplicates into the master
    FOR v_dup_id IN 
      SELECT id 
      FROM customers 
      WHERE business_id = v_business_id AND phone = v_rec.phone AND id != v_master_id
    LOOP
      PERFORM merge_customers(v_master_id, v_dup_id);
    END LOOP;
  END LOOP;

  -- 2. Deduplicate based on email
  FOR v_rec IN 
    SELECT email, COUNT(*) 
    FROM customers 
    WHERE business_id = v_business_id AND email IS NOT NULL AND email != ''
    GROUP BY email 
    HAVING COUNT(*) > 1
  LOOP
    -- Pick the oldest customer record as the master
    SELECT id INTO v_master_id 
    FROM customers 
    WHERE business_id = v_business_id AND email = v_rec.email
    ORDER BY created_at ASC 
    LIMIT 1;

    FOR v_dup_id IN 
      SELECT id 
      FROM customers 
      WHERE business_id = v_business_id AND email = v_rec.email AND id != v_master_id
    LOOP
      -- Check if the duplicate still exists (it might have been merged already via phone)
      IF EXISTS (SELECT 1 FROM customers WHERE id = v_dup_id) THEN
        PERFORM merge_customers(v_master_id, v_dup_id);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
