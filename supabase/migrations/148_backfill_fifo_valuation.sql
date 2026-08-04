UPDATE products
SET valuation_method = 'fifo'
WHERE valuation_method IS NULL OR valuation_method <> 'fifo';
