-- Add 'repairs' to the retail-store vertical template's modules_enabled array
UPDATE business_vertical_templates
SET modules_enabled = array_append(modules_enabled, 'repairs')
WHERE slug = 'retail-store'
  AND NOT ('repairs' = ANY(modules_enabled));
