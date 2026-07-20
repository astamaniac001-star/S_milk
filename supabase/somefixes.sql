-- ==========================================
-- PRE-FLIGHT: DROP CONFLICTING FUNCTIONS & ENSURE COLUMNS
-- ==========================================

-- Drop functions to avoid "cannot change return type" errors
DROP FUNCTION IF EXISTS verify_pin(text);
DROP FUNCTION IF EXISTS rotate_pin(text, text);
DROP FUNCTION IF EXISTS record_payment_rpc(uuid, numeric, text, text, uuid);
DROP FUNCTION IF EXISTS generate_month_bill_rpc(uuid, text);
DROP FUNCTION IF EXISTS apply_adjustment_rpc(uuid, uuid);

-- Permanently destroy the dangerous erase_all_data function (Fixes C2 completely)
DROP FUNCTION IF EXISTS erase_all_data(text);

-- Ensure settings table has lockout columns (in case they are missing in live DB)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS failed_attempts int DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-- ==========================================
-- PHASE 1: SECURITY & RLS LOCKDOWN (C1, C2)
-- ==========================================

-- 1. Revoke all anon access to business tables and settings
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- 2. Grant authenticated access
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 3. Drop existing wide-open policies and replace with strict authenticated policies
DO $$
DECLARE
  r RECORD;
  tbl text;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    tbl := r.tablename;
    -- Drop any legacy policies that might exist
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'anon_all_' || tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'auth_all_' || tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'anon_select_' || tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'auth_select_' || tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'anon_insert_' || tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'auth_insert_' || tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'anon_update_' || tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'auth_update_' || tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'anon_delete_' || tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'auth_delete_' || tbl, tbl);
    
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    
    -- Create strict policy: Only authenticated users can access data
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', 'auth_all_' || tbl, tbl);
  END LOOP;
END $$;

-- ==========================================
-- PHASE 2: FIX AUTH & PIN RPCs (C3)
-- ==========================================

-- Fix verify_pin (Argument mismatch & lockout rollback)
CREATE OR REPLACE FUNCTION verify_pin(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash text;
  v_attempts int;
  v_locked_until timestamptz;
  v_settings_id uuid;
BEGIN
  SELECT id, pin_hash, failed_attempts, locked_until 
  INTO v_settings_id, v_hash, v_attempts, v_locked_until 
  FROM settings LIMIT 1 FOR UPDATE; -- Lock row to prevent race conditions

  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account locked. Try later.');
  END IF;

  IF crypt(p_pin, v_hash) = v_hash THEN
    UPDATE settings SET failed_attempts = 0, locked_until = NULL WHERE id = v_settings_id;
    RETURN jsonb_build_object('success', true);
  ELSE
    v_attempts := v_attempts + 1;
    IF v_attempts >= 5 THEN
      UPDATE settings SET failed_attempts = v_attempts, locked_until = now() + interval '15 minutes' WHERE id = v_settings_id;
      RETURN jsonb_build_object('success', false, 'error', 'Too many attempts. Locked for 15 mins.');
    ELSE
      UPDATE settings SET failed_attempts = v_attempts WHERE id = v_settings_id;
      RETURN jsonb_build_object('success', false, 'error', 'Invalid PIN.');
    END IF;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION verify_pin(text) TO authenticated;

-- Fix rotate_pin
CREATE OR REPLACE FUNCTION rotate_pin(p_current text, p_new text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash text;
  v_settings_id uuid;
BEGIN
  SELECT id, pin_hash INTO v_settings_id, v_hash FROM settings LIMIT 1 FOR UPDATE;
  
  IF crypt(p_current, v_hash) != v_hash THEN
    RETURN jsonb_build_object('success', false, 'error', 'Current PIN is incorrect.');
  END IF;

  UPDATE settings SET pin_hash = crypt(p_new, gen_salt('bf')) WHERE id = v_settings_id;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION rotate_pin(text, text) TO authenticated;

-- ==========================================
-- PHASE 3: TRANSACTIONAL FINANCIAL RPCs (C5, C6, H1)
-- ==========================================

-- Atomic Payment RPC (C6: Prevents double counting)
CREATE OR REPLACE FUNCTION record_payment_rpc(
  p_bill_id uuid, p_amount numeric, p_mode text, p_note text, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_bill record; v_existing_payment record;
BEGIN
  SELECT id INTO v_existing_payment FROM payments WHERE idempotency_key = p_idempotency_key;
  IF v_existing_payment IS NOT NULL THEN RETURN jsonb_build_object('success', true, 'idempotent', true); END IF;

  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF v_bill IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  INSERT INTO payments (id, bill_id, amount, mode, note, idempotency_key, created_at)
  VALUES (gen_random_uuid(), p_bill_id, p_amount, p_mode, p_note, p_idempotency_key, now());

  UPDATE bills 
  SET amount_paid = amount_paid + p_amount,
      status = CASE WHEN (amount_paid + p_amount) >= amount THEN 'Paid' ELSE 'Partial' END,
      version = version + 1
  WHERE id = p_bill_id;

  RETURN jsonb_build_object('success', true);
END; $$;
GRANT EXECUTE ON FUNCTION record_payment_rpc(uuid, numeric, text, text, uuid) TO authenticated;

-- Atomic Bill Generation RPC (C5: Fixes zero-value bills)
CREATE OR REPLACE FUNCTION generate_month_bill_rpc(p_customer_id uuid, p_month text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_rate numeric; v_total_qty numeric; v_amount numeric; v_existing_bill_id uuid;
BEGIN
  SELECT rate_per_liter INTO v_rate FROM customers WHERE id = p_customer_id;
  IF v_rate IS NULL THEN v_rate := 0; END IF;

  SELECT COALESCE(SUM(qty), 0) INTO v_total_qty FROM daily_logs
  WHERE customer_id = p_customer_id AND to_char(date, 'YYYY-MM') = p_month AND delivered = true;

  v_amount := v_total_qty * v_rate;

  SELECT id INTO v_existing_bill_id FROM bills WHERE customer_id = p_customer_id AND month = p_month FOR UPDATE;
  
  IF v_existing_bill_id IS NOT NULL THEN
    UPDATE bills SET amount = v_amount, version = version + 1 WHERE id = v_existing_bill_id;
  ELSE
    INSERT INTO bills (id, customer_id, month, amount, amount_paid, status, version)
    VALUES (gen_random_uuid(), p_customer_id, p_month, v_amount, 0, 'Unpaid', 1);
  END IF;

  RETURN jsonb_build_object('success', true, 'amount', v_amount);
END; $$;
GRANT EXECUTE ON FUNCTION generate_month_bill_rpc(uuid, text) TO authenticated;

-- Atomic Adjustment RPC (H1: Prevents partial application)
CREATE OR REPLACE FUNCTION apply_adjustment_rpc(p_adjustment_id uuid, p_bill_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_adj record; v_bill record;
BEGIN
  SELECT * INTO v_adj FROM adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF v_adj IS NULL OR v_adj.status = 'Applied' THEN RETURN jsonb_build_object('success', true, 'idempotent', true); END IF;

  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF v_bill.customer_id != v_adj.customer_id THEN RAISE EXCEPTION 'Customer mismatch'; END IF;

  UPDATE bills SET amount = amount + v_adj.amount, version = version + 1 WHERE id = p_bill_id;
  UPDATE adjustments SET status = 'Applied', bill_id = p_bill_id WHERE id = p_adjustment_id;

  RETURN jsonb_build_object('success', true);
END; $$;
GRANT EXECUTE ON FUNCTION apply_adjustment_rpc(uuid, uuid) TO authenticated;

-- Drop and recreate to enforce Locked and Overpay invariants (H10)
DROP FUNCTION IF EXISTS record_payment_rpc(uuid, numeric, text, text, uuid);
DROP FUNCTION IF EXISTS generate_month_bill_rpc(uuid, text);

-- Hardened Payment RPC
CREATE OR REPLACE FUNCTION record_payment_rpc(
  p_bill_id uuid, p_amount numeric, p_mode text, p_note text, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_bill record; v_existing_payment record; v_pending numeric;
BEGIN
  -- 1. Idempotency check
  SELECT id INTO v_existing_payment FROM payments WHERE idempotency_key = p_idempotency_key;
  IF v_existing_payment IS NOT NULL THEN 
    RETURN jsonb_build_object('success', true, 'idempotent', true); 
  END IF;

  -- 2. Lock and validate bill
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF v_bill IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF v_bill.locked = true THEN RAISE EXCEPTION 'This bill is locked.'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  
  v_pending := v_bill.amount - v_bill.amount_paid;
  IF p_amount > v_pending + 0.01 THEN 
    RAISE EXCEPTION 'Payment exceeds pending amount (%). Use a credit note for advance payment.', v_pending; 
  END IF;

  -- 3. Insert payment and update bill atomically
  INSERT INTO payments (id, bill_id, amount, mode, note, idempotency_key, created_at)
  VALUES (gen_random_uuid(), p_bill_id, p_amount, p_mode, p_note, p_idempotency_key, now());

  UPDATE bills 
  SET amount_paid = amount_paid + p_amount,
      status = CASE WHEN (amount_paid + p_amount) >= amount THEN 'Paid' ELSE 'Partial' END,
      version = version + 1,
      updated_at = now()
  WHERE id = p_bill_id;

  RETURN jsonb_build_object('success', true);
END; $$;
GRANT EXECUTE ON FUNCTION record_payment_rpc(uuid, numeric, text, text, uuid) TO authenticated;

-- Hardened Bill Generation RPC
CREATE OR REPLACE FUNCTION generate_month_bill_rpc(p_customer_id uuid, p_month text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_rate numeric; v_total_qty numeric; v_amount numeric; v_existing_bill record;
BEGIN
  SELECT rate_per_liter INTO v_rate FROM customers WHERE id = p_customer_id;
  IF v_rate IS NULL THEN v_rate := 0; END IF;

  SELECT COALESCE(SUM(qty), 0) INTO v_total_qty FROM daily_logs
  WHERE customer_id = p_customer_id AND to_char(date, 'YYYY-MM') = p_month AND delivered = true;

  v_amount := v_total_qty * v_rate;

  SELECT * INTO v_existing_bill FROM bills WHERE customer_id = p_customer_id AND month = p_month FOR UPDATE;
  
  IF v_existing_bill IS NOT NULL THEN
    IF v_existing_bill.locked = true THEN 
      RAISE EXCEPTION 'Cannot regenerate a locked bill.'; 
    END IF;
    UPDATE bills SET amount = v_amount, version = version + 1, updated_at = now() WHERE id = v_existing_bill.id;
  ELSE
    INSERT INTO bills (id, customer_id, month, amount, amount_paid, status, locked, version)
    VALUES (gen_random_uuid(), p_customer_id, p_month, v_amount, 0, 'Unpaid', false, 1);
  END IF;

  RETURN jsonb_build_object('success', true, 'amount', v_amount);
END; $$;
GRANT EXECUTE ON FUNCTION generate_month_bill_rpc(uuid, text) TO authenticated;
-- Enforce positive amounts and valid statuses (H10)
ALTER TABLE bills ADD CONSTRAINT chk_bills_amount_positive CHECK (amount >= 0 AND amount_paid >= 0);
ALTER TABLE bills ADD CONSTRAINT chk_bills_paid_lte_amount CHECK (amount_paid <= amount);
ALTER TABLE bills ADD CONSTRAINT chk_bills_status_valid CHECK (status IN ('Unpaid', 'Partial', 'Paid', 'Draft'));

ALTER TABLE payments ADD CONSTRAINT chk_payments_amount_positive CHECK (amount > 0);
ALTER TABLE adjustments ADD CONSTRAINT chk_adjustments_amount_nonzero CHECK (amount != 0);

-- Add version columns to tables that were missing OCC (M2)
ALTER TABLE milk_imports ADD COLUMN IF NOT EXISTS version int DEFAULT 1;

-- ==========================================
-- MASTER SECURITY & CLEANUP SCRIPT
-- ==========================================

-- 1. DESTROY CUSTOM AUTH ARTIFACTS
DROP TABLE IF EXISTS public.auth_tokens;
DROP FUNCTION IF EXISTS public.verify_pin(text);
DROP FUNCTION IF EXISTS public.rotate_pin(text, text);

ALTER TABLE public.settings 
  DROP COLUMN IF EXISTS pin_hash,
  DROP COLUMN IF EXISTS pin_salt,
  DROP COLUMN IF EXISTS failed_attempts,
  DROP COLUMN IF EXISTS locked_until;

-- 2. NUKE ALL EXISTING POLICIES (Including the 'app_access_*' and 'settings_*' ghosts)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- 3. REVOKE ALL ANONYMOUS PRIVILEGES
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- 4. REBUILD STRICT "AUTHENTICATED-ONLY" POLICIES FOR EVERY TABLE
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('CREATE POLICY "strict_auth_only_%I" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl, tbl);
  END LOOP;
END $$;
