-- Update job number generation to use business name initials
-- Example: 'Phone Fix Broxburn' -> 'PFB'

CREATE OR REPLACE FUNCTION generate_job_number(p_branch_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_business_prefix TEXT;
  v_seq             BIGINT;
BEGIN
  -- Extract initials from the business name (e.g., 'Phone Fix Broxburn' -> 'PFB')
  SELECT UPPER(regexp_replace(b.name, '(\w)\w*\s*', '\1', 'g')) INTO v_business_prefix
  FROM branches br
  JOIN businesses b ON b.id = br.business_id
  WHERE br.id = p_branch_id;

  -- Fallback to branch prefix if business name is empty or results in no letters
  IF v_business_prefix IS NULL OR v_business_prefix = '' THEN
    SELECT UPPER(LEFT(name, 3)) INTO v_business_prefix
    FROM branches WHERE id = p_branch_id;
  END IF;

  v_seq := NEXTVAL('repair_job_seq');
  RETURN v_business_prefix || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;
