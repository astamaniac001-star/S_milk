
-- ============================================================================
-- 01_base_schema.sql
-- Creates all core tables for the S_milk application.
-- ============================================================================

-- 1. Settings (Stores the hashed PIN and lockout state)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT, -- Legacy plaintext PIN (will be cleared by migration)
  pin_hash TEXT,
  pin_salt TEXT,
  failed_attempts INT DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Customers
CREATE TABLE customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  delivery_address TEXT,
  status TEXT DEFAULT 'Active',
  product TEXT DEFAULT 'Full Cream',
  daily_qty NUMERIC DEFAULT 1,
  delivery_days JSONB DEFAULT '[0,1,2,3,4,5,6]',
  balance NUMERIC DEFAULT 0,
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Milk Brands
CREATE TABLE milk_brands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_name TEXT NOT NULL,
  supplier_name TEXT,
  supplier_phone TEXT,
  default_milk_type TEXT,
  rate_per_liter NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Daily Logs
CREATE TABLE daily_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  product TEXT,
  qty NUMERIC DEFAULT 0,
  delivered BOOLEAN DEFAULT FALSE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Bills
CREATE TABLE bills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  amount_paid NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Unpaid',
  locked BOOLEAN DEFAULT FALSE,
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Milk Imports
CREATE TABLE milk_imports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES milk_brands(id),
  brand_name TEXT,
  milk_type TEXT,
  quantity NUMERIC DEFAULT 0,
  rate_per_liter NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  invoice_number TEXT,
  supplier_name TEXT,
  date DATE NOT NULL,
  status TEXT DEFAULT 'Draft',
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Pause Periods
CREATE TABLE pause_periods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Subscriptions
CREATE TABLE subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  milk_type TEXT DEFAULT 'Full Cream',
  qty NUMERIC DEFAULT 1,
  delivery_days JSONB DEFAULT '[0,1,2,3,4,5,6]',
  is_active BOOLEAN DEFAULT TRUE,
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Adjustments
CREATE TABLE adjustments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  amount NUMERIC DEFAULT 0,
  reason TEXT,
  applied BOOLEAN DEFAULT FALSE,
  date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Credit Notes (Updated with applied_to_bill_id)
CREATE TABLE credit_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  applied_to_bill_id UUID REFERENCES bills(id), -- Added for tracking where it was applied
  amount NUMERIC DEFAULT 0,
  reason TEXT,
  applied BOOLEAN DEFAULT FALSE,
  date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Payments (New table for audit trails)
CREATE TABLE payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_mode TEXT DEFAULT 'Cash',
  payment_date DATE NOT NULL,
  note TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Auth Tokens (For secure PIN session management)
CREATE TABLE auth_tokens (
  token TEXT PRIMARY KEY,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed BOOLEAN DEFAULT FALSE
);

-- Insert default 6-digit PIN (123456)
INSERT INTO settings (key, value) VALUES ('PIN', '123456');