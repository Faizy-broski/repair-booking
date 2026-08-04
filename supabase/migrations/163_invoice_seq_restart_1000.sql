-- Restart invoice_seq so invoice numbers start from 1000 instead of the low
-- values left over from testing (e.g. INV-202607-0021).
ALTER SEQUENCE invoice_seq RESTART WITH 1000;
                    