-- ============================================================================
-- 02_constraints_indexes.sql
-- Adds unique constraints and performance indexes.
-- ============================================================================

-- Prevent duplicate daily logs for the same customer on the same day
ALTER TABLE daily_logs 
ADD CONSTRAINT unique_customer_date UNIQUE (customer_id, date);

-- Prevent duplicate monthly bills for the same customer
ALTER TABLE bills 
ADD CONSTRAINT unique_customer_month UNIQUE (customer_id, month);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_daily_logs_customer_date ON daily_logs (customer_id, date);
CREATE INDEX IF NOT EXISTS idx_bills_customer_month ON bills (customer_id, month);
CREATE INDEX IF NOT EXISTS idx_payments_bill_id ON payments (bill_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions (customer_id);